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
import {
  isEmbeddingAvailable,
  vectorSearchAll,
  type VectorSearchResult,
} from "../services/embedding-service.js";
import { rrfFuse, boostDualSource, type RankedItem } from "../services/rrf-fusion.js";

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

// ─── Learned Knowledge Queries ───────────────────────────────────────

/**
 * Find learned features that match the request keywords.
 * Searches both code-scanned and Perplexity-researched features.
 */
function cypherLearnedFeatures(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(f.name) CONTAINS '${esc(kw)}' OR toLower(f.description) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (f:LearnedFeature)
WHERE ${conditions}
RETURN f.name AS name, f.description AS description,
       f.complexity AS complexity, f.source AS source,
       f.feature_id AS feature_id, f.file_count AS file_count
ORDER BY f.file_count DESC
LIMIT 25
  `.trim();
}

/**
 * Find learned data models relevant to the request.
 */
function cypherLearnedModels(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(m.name) CONTAINS '${esc(kw)}' OR toLower(m.category) CONTAINS '${esc(kw)}' OR toLower(m.fields_csv) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (m:LearnedDataModel)
WHERE ${conditions}
RETURN m.name AS name, m.category AS category,
       m.fields_csv AS fields, m.field_count AS field_count,
       m.source AS source
ORDER BY m.field_count DESC
LIMIT 25
  `.trim();
}

/**
 * Find learned integrations relevant to the request.
 */
function cypherLearnedIntegrations(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(i.name) CONTAINS '${esc(kw)}' OR toLower(i.type) CONTAINS '${esc(kw)}' OR toLower(i.provider) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (i:LearnedIntegration)
WHERE ${conditions}
RETURN i.name AS name, i.type AS type, i.provider AS provider,
       i.auth_method AS auth_method, i.source AS source
LIMIT 20
  `.trim();
}

/**
 * Find learned patterns (auth, architecture, UI, etc.) relevant to the request.
 */
function cypherLearnedPatterns(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(p.name) CONTAINS '${esc(kw)}' OR toLower(p.description) CONTAINS '${esc(kw)}' OR toLower(p.type) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (p:LearnedPattern)
WHERE ${conditions}
RETURN p.name AS name, p.type AS type, p.description AS description,
       p.evidence AS evidence, p.source AS source
LIMIT 20
  `.trim();
}

/**
 * Find learned user flows relevant to the request.
 */
function cypherLearnedFlows(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(f.name) CONTAINS '${esc(kw)}' OR toLower(f.steps_description) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (f:LearnedUserFlow)
WHERE ${conditions}
RETURN f.name AS name, f.steps_description AS steps,
       f.step_count AS step_count, f.source AS source
LIMIT 15
  `.trim();
}

/**
 * Find Perplexity research nodes for this app domain.
 */
function cypherLearnedResearch(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(r.scenario) CONTAINS '${esc(kw)}' OR toLower(r.app_class) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (r:LearnedResearch)
WHERE ${conditions}
RETURN r.scenario AS scenario, r.app_class AS app_class,
       r.reference_apps AS reference_apps, r.source AS source,
       r.feature_count AS feature_count, r.model_count AS model_count
LIMIT 10
  `.trim();
}

/**
 * Find known corrections (gaps the system has identified).
 */
function cypherLearnedCorrections(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(c.section) CONTAINS '${esc(kw)}' OR toLower(c.missing_item) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (c:LearnedCorrection)
WHERE ${conditions}
RETURN c.section AS section, c.missing_item AS missing_item,
       c.scenario AS scenario, c.source AS source
LIMIT 20
  `.trim();
}

/**
 * Broad keyword search: find ALL LearnedApp nodes whose app_class matches,
 * then pull their full feature/model/integration graphs.
 */
function cypherLearnedAppContext(keywords: string[]): string {
  const conditions = keywords
    .map((kw) => `(toLower(a.app_class) CONTAINS '${esc(kw)}' OR toLower(a.name) CONTAINS '${esc(kw)}')`)
    .join(" OR ");

  return `
MATCH (a:LearnedApp)
WHERE ${conditions}
OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
RETURN a.name AS app_name, a.app_class AS app_class,
       a.source_url AS source,
       collect(DISTINCT f.name) AS features,
       collect(DISTINCT m.name) AS models,
       collect(DISTINCT i.name) AS integrations
LIMIT 5
  `.trim();
}

// ─── Reasoning Rules Loader ─────────────────────────────────────────
// LESSON-001: The retrieval was broken, not the data.
// Always load reasoning rules FIRST so the pipeline knows HOW to search.

function cypherReasoningRules(): string {
  return `
MATCH (r:AESReasoningRule)
OPTIONAL MATCH (r)-[:HAS_STRATEGY]->(s:AESSearchStrategy)
RETURN r.rule_id AS rule_id, r.title AS title, r.summary AS summary,
       r.priority AS priority,
       collect({id: s.strategy_id, title: s.title, description: s.description, example: s.example}) AS strategies
ORDER BY r.priority
  `.trim();
}

function cypherPreflight(): string {
  return `
MATCH (c:AESPreflight)
RETURN c.checklist_id AS id, c.title AS title, c.steps AS steps,
       c.priority AS priority
ORDER BY c.priority
  `.trim();
}

// ─── Synonym Expansion (STRATEGY-001) ───────────────────────────────
// Instead of searching with raw keywords only, expand each keyword
// into related terms so the graph reveals what it actually knows.

const SYNONYM_MAP: Record<string, string[]> = {
  // Scheduling / Booking domain
  booking: ["booking", "appointment", "reservation", "schedule", "slot"],
  appointment: ["appointment", "booking", "reservation", "schedule", "slot"],
  schedule: ["schedule", "booking", "calendar", "availability", "slot"],
  calendar: ["calendar", "schedule", "availability", "ical", "sync"],
  availability: ["availability", "schedule", "slot", "busytime", "free"],

  // People
  barber: ["barber", "staff", "member", "agent", "stylist", "employee"],
  staff: ["staff", "member", "team", "barber", "employee", "agent"],
  client: ["client", "customer", "contact", "user", "profile"],
  customer: ["customer", "client", "contact", "user", "profile"],

  // Payments
  payment: ["payment", "billing", "stripe", "checkout", "deposit", "credit"],
  billing: ["billing", "payment", "invoice", "subscription", "stripe"],
  checkout: ["checkout", "payment", "billing", "stripe", "cart"],

  // Communication
  notification: ["notification", "reminder", "alert", "email", "sms", "message"],
  sms: ["sms", "twilio", "message", "notification", "text"],
  email: ["email", "sendgrid", "notification", "reminder", "ses"],

  // Features
  review: ["review", "rating", "feedback", "star", "testimonial"],
  analytics: ["analytics", "report", "dashboard", "insight", "chart", "metric"],
  dashboard: ["dashboard", "analytics", "report", "overview", "admin"],
  loyalty: ["loyalty", "reward", "stamp", "points", "retention"],
  waitlist: ["waitlist", "queue", "walk-in", "wait", "check-in"],
  marketing: ["marketing", "campaign", "promo", "discount", "gift"],
  location: ["location", "branch", "shop", "venue", "site", "multi-location"],
  service: ["service", "menu", "event-type", "offering", "duration", "pricing"],

  // Auth
  auth: ["auth", "login", "session", "token", "password", "credential"],
  login: ["login", "auth", "signin", "session", "credential"],

  // Tech
  database: ["database", "postgres", "prisma", "drizzle", "typeorm", "sql"],
  api: ["api", "trpc", "graphql", "rest", "endpoint", "route"],
};

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

/**
 * STRATEGY-001: Expand keywords into synonym sets.
 * "barber booking" → ["barber", "staff", "member", "agent", "booking", "appointment", "reservation", ...]
 */
function expandKeywords(raw: string[]): string[] {
  const expanded = new Set<string>();
  for (const kw of raw) {
    expanded.add(kw);
    const synonyms = SYNONYM_MAP[kw];
    if (synonyms) {
      for (const s of synonyms) expanded.add(s);
    }
  }
  return Array.from(expanded);
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

  // ── STEP 0: Load reasoning rules (PREFLIGHT-001) ──
  // The graph teaches us HOW to search before we search.
  cb?.onStep("Loading reasoning rules from graph...");

  const [reasoningRules, preflight] = await Promise.all([
    neo4j.runCypher(cypherReasoningRules()).catch(() => []),
    neo4j.runCypher(cypherPreflight()).catch(() => []),
  ]);

  if (reasoningRules.length > 0) {
    cb?.onStep(`Loaded ${reasoningRules.length} reasoning rule(s): ${reasoningRules.map((r: any) => r.title).join("; ")}`);
  }

  // ── STEP 1: Extract and expand keywords (STRATEGY-001, 003) ──
  cb?.onStep("Searching graph for prior knowledge...");

  const rawKeywords = extractKeywords(state.rawRequest);
  if (rawKeywords.length === 0) {
    cb?.onStep("No searchable keywords — skipping graph lookup");
    return {};
  }

  // Fan-out: expand each keyword into synonyms so we find what the graph actually stores
  const keywords = expandKeywords(rawKeywords);

  cb?.onStep(`Raw keywords: ${rawKeywords.join(", ")}`);
  cb?.onStep(`Expanded to ${keywords.length} search terms (fan-out): ${keywords.join(", ")}`);

  const context: AESStateType["graphContext"] = {
    priorBuilds: [],
    similarFeatures: [],
    knownPatterns: [],
    failureHistory: [],
    reusableBridges: [],
    learnedFeatures: [],
    learnedModels: [],
    learnedIntegrations: [],
    learnedPatterns: [],
    learnedFlows: [],
    learnedResearch: [],
    learnedCorrections: [],
  };

  // ── Check vector search availability ──
  const vectorAvailable = isEmbeddingAvailable();
  if (vectorAvailable) {
    cb?.onStep("Vector search enabled — running hybrid keyword + semantic search");
  }

  // Cypher runner adapter for vectorSearch (matches expected signature)
  const cypherRunner = async (cypher: string, params?: Record<string, any>) =>
    neo4j.runCypher(cypher, params).catch(() => []);

  try {
    // Run ALL keyword queries in parallel — original + learned knowledge
    // PLUS vector search across all indexed node types
    const [
      builds, features, patterns, failures, bridges,
      lFeatures, lModels, lIntegrations, lPatterns, lFlows, lResearch, lCorrections,
      vectorResults,
    ] = await Promise.all([
      // Original keyword queries
      neo4j.runCypher(cypherPriorBuilds(keywords)).catch(() => []),
      neo4j.runCypher(cypherSimilarFeatures(keywords)).catch(() => []),
      neo4j.runCypher(cypherKnownPatterns(keywords)).catch(() => []),
      neo4j.runCypher(cypherFailureHistory(keywords)).catch(() => []),
      neo4j.runCypher(cypherReusableBridges(keywords)).catch(() => []),
      // Learned knowledge keyword queries
      neo4j.runCypher(cypherLearnedFeatures(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedModels(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedIntegrations(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedPatterns(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedFlows(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedResearch(keywords)).catch(() => []),
      neo4j.runCypher(cypherLearnedCorrections(keywords)).catch(() => []),
      // Vector semantic search (all indexed types in parallel)
      vectorAvailable
        ? vectorSearchAll(state.rawRequest, 15, cypherRunner).catch(() => [] as VectorSearchResult[])
        : Promise.resolve([] as VectorSearchResult[]),
    ]);

    // ── RRF Fusion: merge keyword + vector results for learned types ──
    // Group vector results by label so we can fuse per-type
    const vectorByType = new Map<string, VectorSearchResult[]>();
    for (const vr of vectorResults) {
      const existing = vectorByType.get(vr.label) || [];
      existing.push(vr);
      vectorByType.set(vr.label, existing);
    }

    // Helper: convert keyword rows to RankedItems for fusion
    const toRanked = (rows: any[], label: string, idField: string): RankedItem[] =>
      rows.map((r) => ({
        id: r[idField] || r.name || r.id || "",
        name: r.name || "",
        label,
        properties: r,
      }));

    // Helper: convert vector results to RankedItems
    const vectorToRanked = (results: VectorSearchResult[]): RankedItem[] =>
      results.map((r) => ({
        id: r.id,
        name: r.name,
        label: r.label,
        properties: r.properties,
      }));

    // Fuse each learned type: keyword results + vector results → RRF ranked
    const fusedFeatures = fuseAndMerge(lFeatures, vectorByType.get("LearnedFeature") || [], "LearnedFeature", "feature_id");
    const fusedModels = fuseAndMerge(lModels, vectorByType.get("LearnedDataModel") || [], "LearnedDataModel", "name");
    const fusedIntegrations = fuseAndMerge(lIntegrations, vectorByType.get("LearnedIntegration") || [], "LearnedIntegration", "name");
    const fusedPatterns = fuseAndMerge(lPatterns, vectorByType.get("LearnedPattern") || [], "LearnedPattern", "name");
    const fusedFlows = fuseAndMerge(lFlows, vectorByType.get("LearnedUserFlow") || [], "LearnedUserFlow", "name");

    // Count how many new results came purely from vector search
    let vectorOnlyCount = 0;

    context.priorBuilds = builds;
    context.similarFeatures = features;
    context.knownPatterns = patterns;
    context.failureHistory = failures;
    context.reusableBridges = bridges;
    context.learnedFeatures = fusedFeatures.rows;
    context.learnedModels = fusedModels.rows;
    context.learnedIntegrations = fusedIntegrations.rows;
    context.learnedPatterns = fusedPatterns.rows;
    context.learnedFlows = fusedFlows.rows;
    context.learnedResearch = lResearch;
    context.learnedCorrections = lCorrections;

    vectorOnlyCount = fusedFeatures.vectorOnly + fusedModels.vectorOnly +
      fusedIntegrations.vectorOnly + fusedPatterns.vectorOnly + fusedFlows.vectorOnly;

    const originalTotal =
      builds.length + features.length + patterns.length +
      failures.length + bridges.length;
    const learnedTotal =
      fusedFeatures.rows.length + fusedModels.rows.length + fusedIntegrations.rows.length +
      fusedPatterns.rows.length + fusedFlows.rows.length + lResearch.length + lCorrections.length;
    const total = originalTotal + learnedTotal;

    if (total > 0) {
      const parts = [];
      if (originalTotal > 0) {
        parts.push(`${builds.length} prior builds, ${features.length} similar features, ${patterns.length} patterns, ${failures.length} failure records, ${bridges.length} bridges`);
      }
      if (learnedTotal > 0) {
        parts.push(`LEARNED: ${fusedFeatures.rows.length} features, ${fusedModels.rows.length} models, ${fusedIntegrations.rows.length} integrations, ${fusedPatterns.rows.length} patterns, ${fusedFlows.rows.length} flows, ${lResearch.length} research, ${lCorrections.length} corrections`);
      }
      if (vectorOnlyCount > 0) {
        parts.push(`VECTOR-ONLY: ${vectorOnlyCount} semantic matches (not found by keywords)`);
      }
      cb?.onSuccess(`Graph context loaded: ${parts.join(" | ")}`);
    } else {
      cb?.onStep("No prior knowledge found in graph — starting fresh");
    }
  } catch (err: any) {
    cb?.onWarn(`Graph search failed: ${err.message} — continuing without context`);
  }

  return { graphContext: context };
}

// ─── Hybrid Fusion Helper ─────────────────────────────────────────

/**
 * Merge keyword Cypher results with vector search results using RRF.
 * Returns the fused rows (as plain objects for state) and a count of
 * results that came ONLY from vector search (semantic matches that
 * keyword matching missed entirely).
 */
function fuseAndMerge(
  keywordRows: any[],
  vectorRows: VectorSearchResult[],
  label: string,
  idField: string,
): { rows: any[]; vectorOnly: number } {
  // If no vector results, just return keyword results as-is
  if (vectorRows.length === 0) {
    return { rows: keywordRows, vectorOnly: 0 };
  }

  // If no keyword results, return vector properties directly
  if (keywordRows.length === 0) {
    return {
      rows: vectorRows.map((vr) => ({ name: vr.name, ...vr.properties, _vectorScore: vr.score })),
      vectorOnly: vectorRows.length,
    };
  }

  // Build RankedItem lists for RRF
  const kwRanked: RankedItem[] = keywordRows.map((r) => ({
    id: r[idField] || r.name || "",
    name: r.name || "",
    label,
    properties: r,
  }));

  const vecRanked: RankedItem[] = vectorRows.map((r) => ({
    id: r.id,
    name: r.name,
    label: r.label,
    properties: r.properties,
  }));

  // Fuse with RRF and boost dual-source matches
  const fused = boostDualSource(rrfFuse(kwRanked, vecRanked));

  // Count vector-only results (found semantically but not by keywords)
  const vectorOnly = fused.filter((f) => f.sources.length === 1 && f.sources[0] === "vector").length;

  // Convert back to plain row objects for state
  const rows = fused.map((f) => ({
    ...f.properties,
    name: f.name,
    _rrfScore: f.rrfScore,
    _sources: f.sources,
  }));

  return { rows, vectorOnly };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
