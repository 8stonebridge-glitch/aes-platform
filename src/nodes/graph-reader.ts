/**
 * Graph Reader Node — searches Neo4j at pipeline start for prior knowledge.
 *
 * Queries the graph for:
 *   1. Prior builds with similar intent (have we built something like this before?)
 *   2. Existing feature specs that match keywords (reusable features)
 *   3. Known patterns and packages (catalog enrichment)
 *   4. Failure history (what went wrong before on similar builds?)
 *   5. Existing bridges that could be reused
 *
 * This gives every downstream node (classifier, decomposer, catalog searcher,
 * bridge compiler) access to what the system already knows.
 *
 * Graceful: if Neo4j is unavailable, returns empty context and continues.
 */

import type { AESStateType } from "../state.js";
import { getNeo4jService } from "../services/neo4j-service.js";
import { getCallbacks } from "../graph.js";

// ─── Cypher Queries ──────────────────────────────────────────────────

/**
 * Find prior builds that match keywords from the raw request.
 * Searches Entity nodes of type 'contract' in the aes-pipeline system.
 */
function cypherPriorBuilds(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(e.name) CONTAINS '${esc(kw)}' OR toLower(v.snapshot_description) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (e:Entity {system: 'aes-pipeline', entity_type: 'contract'})
MATCH (e)-[:CURRENT_VERSION]->(v:Version)
WHERE ${conditions}
RETURN e.entity_id AS id, e.name AS name, v.snapshot_description AS description,
       v.version_number AS version, v.promoted_at AS promoted_at
ORDER BY v.promoted_at DESC
LIMIT 10
  `.trim();
}

/**
 * Find existing feature specs that share keywords with the new request.
 */
function cypherSimilarFeatures(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(e.name) CONTAINS '${esc(kw)}' OR toLower(v.snapshot_description) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (e:Entity {system: 'aes-pipeline', entity_type: 'feature_spec'})
MATCH (e)-[:CURRENT_VERSION]->(v:Version)
WHERE ${conditions}
RETURN e.entity_id AS id, e.name AS name, v.snapshot_description AS description,
       v.version_number AS version, v.promoted_at AS promoted_at
ORDER BY v.promoted_at DESC
LIMIT 20
  `.trim();
}

/**
 * Find known packages and patterns in the graph (seeded data).
 */
function cypherKnownPatterns(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `toLower(n.name) CONTAINS '${esc(kw)}'`)
    .join(" OR ");

  return `
MATCH (n)
WHERE (n:Package OR n:Pattern OR n:PatternLibraryEntry OR n:CatalogEntry OR n:BridgePreset)
AND (${conditions})
RETURN labels(n)[0] AS type, n.name AS name,
       n.description AS description,
       n.tier AS tier
ORDER BY n.name
LIMIT 20
  `.trim();
}

/**
 * Find failure patterns that are relevant to this kind of build.
 */
function cypherFailureHistory(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(n.name) CONTAINS '${esc(kw)}' OR toLower(n.description) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (n:FailurePattern)
WHERE ${conditions}
RETURN n.name AS name, n.description AS description,
       n.severity AS severity, n.category AS category
LIMIT 10
  `.trim();
}

/**
 * Find existing bridges that could be reused for similar features.
 * Returns the full bridge packet data stored on the Entity node.
 */
function cypherReusableBridges(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(b.feature_name) CONTAINS '${esc(kw)}' OR toLower(f.name) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (b:Entity {entity_type: 'contract'})-[:BRIDGES]->(f:Entity {entity_type: 'feature_spec'})
MATCH (b)-[:CURRENT_VERSION]->(bv:Version)
MATCH (f)-[:CURRENT_VERSION]->(fv:Version)
WHERE ${conditions}
RETURN b.entity_id AS bridge_id, b.feature_name AS bridge_name,
       b.bridge_status AS status,
       b.confidence_overall AS confidence,
       b.confidence_scope AS scope_clarity,
       b.confidence_reuse AS reuse_fit,
       b.risk_score AS risk_score,
       b.priority_rank AS priority_rank,
       b.write_paths AS write_paths,
       b.reuse_count AS reuse_count,
       b.test_count AS test_count,
       b.rule_count AS rule_count,
       b.dep_count AS dep_count,
       b.blocked_reason AS blocked_reason,
       b.app_class AS app_class,
       f.entity_id AS feature_id, f.name AS feature_name,
       bv.snapshot_description AS objective,
       bv.snapshot_text AS bridge_packet_json,
       fv.snapshot_description AS feature_description
ORDER BY b.confidence_overall DESC
LIMIT 15
  `.trim();
}

// ─── Keyword Extraction ──────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "that", "this", "as", "are",
  "was", "be", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "can", "shall", "i", "we", "you",
  "they", "he", "she", "my", "our", "your", "their", "me", "us",
  "build", "create", "make", "want", "need", "app", "application", "system",
  "new", "please",
]);

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

// ─── Main Node ───────────────────────────────────────────────────────

export async function graphReader(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();

  if (!ok) {
    cb?.onStep("Neo4j unavailable — skipping graph context lookup");
    return {};
  }

  cb?.onStep("Searching graph for prior knowledge...");

  const keywords = extractKeywords(state.rawRequest);
  if (keywords.length === 0) {
    cb?.onStep("No searchable keywords — skipping graph lookup");
    return {};
  }

  cb?.onStep(`Graph search keywords: ${keywords.join(", ")}`);

  const context: AESStateType["graphContext"] = {
    priorBuilds: [],
    similarFeatures: [],
    knownPatterns: [],
    failureHistory: [],
    reusableBridges: [],
  };

  try {
    // Run all queries in parallel
    const [builds, features, patterns, failures, bridges] = await Promise.all([
      neo4j.runCypher(cypherPriorBuilds(keywords)).catch(() => []),
      neo4j.runCypher(cypherSimilarFeatures(keywords)).catch(() => []),
      neo4j.runCypher(cypherKnownPatterns(keywords)).catch(() => []),
      neo4j.runCypher(cypherFailureHistory(keywords)).catch(() => []),
      neo4j.runCypher(cypherReusableBridges(keywords)).catch(() => []),
    ]);

    context.priorBuilds = builds;
    context.similarFeatures = features;
    context.knownPatterns = patterns;
    context.failureHistory = failures;
    context.reusableBridges = bridges;

    const total =
      builds.length +
      features.length +
      patterns.length +
      failures.length +
      bridges.length;

    if (total > 0) {
      cb?.onSuccess(
        `Graph context loaded: ${builds.length} prior builds, ${features.length} similar features, ${patterns.length} patterns, ${failures.length} failure records, ${bridges.length} reusable bridges`
      );
    } else {
      cb?.onStep("No prior knowledge found in graph — starting fresh");
    }
  } catch (err: any) {
    cb?.onWarn(`Graph search failed: ${err.message} — continuing without context`);
  }

  return { graphContext: context };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
