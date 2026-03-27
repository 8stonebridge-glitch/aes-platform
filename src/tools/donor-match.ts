/**
 * Donor Match Engine — auto-matches feature descriptions to donor apps
 * in the Neo4j knowledge graph using multi-signal fusion scoring.
 *
 * Usage:
 *   npx tsx src/tools/donor-match.ts "auth with SSO, MFA, and RBAC"
 *   npx tsx src/tools/donor-match.ts --json '{"name":"auth","description":"SSO with SAML and MFA","required_models":["User","Role"]}'
 *
 * Programmatic:
 *   import { findDonors } from "./donor-match.js";
 *   const matches = await findDonors({ name: "auth", description: "SSO with SAML" });
 */

import { getNeo4jService } from "../services/neo4j-service.js";
import {
  embed,
  vectorSearch,
  isEmbeddingAvailable,
} from "../services/embedding-service.js";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface FeatureQuery {
  name: string;
  description: string;
  required_models?: string[];
  required_integrations?: string[];
  required_patterns?: string[];
  app_class_hint?: string;
}

export interface DonorMatch {
  app_name: string;
  app_class: string;
  overall_score: number;
  feature_score: number;
  model_score: number;
  integration_score: number;
  pattern_score: number;
  matched_features: string[];
  matched_models: string[];
  matched_integrations: string[];
  matched_patterns: string[];
  reuse_suggestions: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// WEIGHTS
// ═══════════════════════════════════════════════════════════════════════

const WEIGHT_FEATURE = 0.35;
const WEIGHT_MODEL = 0.25;
const WEIGHT_INTEGRATION = 0.20;
const WEIGHT_PATTERN = 0.15;
const WEIGHT_CLASS = 0.05;

const TOP_K_VECTOR = 20;
const MAX_RESULTS = 5;
const SUGGESTION_THRESHOLD = 0.3;

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

type CypherRunner = (
  cypher: string,
  params?: Record<string, unknown>,
) => Promise<any[]>;

/** Group vector search results by app_name, averaging scores. */
function groupByApp(
  results: { name: string; score: number; properties: Record<string, any> }[],
): Map<string, { avgScore: number; matched: string[] }> {
  const groups = new Map<string, { total: number; count: number; matched: string[] }>();
  for (const r of results) {
    const raw = r.properties?.app_name || r.properties?.source || "unknown";
    const app = raw.replace(/^learned-/, "");
    if (!groups.has(app)) {
      groups.set(app, { total: 0, count: 0, matched: [] });
    }
    const g = groups.get(app)!;
    g.total += r.score;
    g.count += 1;
    g.matched.push(r.name || r.properties?.name || "unnamed");
  }
  const out = new Map<string, { avgScore: number; matched: string[] }>();
  for (const [app, g] of groups) {
    out.set(app, { avgScore: g.total / g.count, matched: g.matched });
  }
  return out;
}

/** Extract keywords from a description for fallback matching. */
function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
    "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "can", "need", "must",
    "that", "this", "these", "those", "it", "its", "not", "no", "so",
    "if", "then", "else", "when", "where", "how", "what", "which", "who",
    "all", "each", "every", "any", "some", "more", "most", "such", "very",
    "just", "also", "than", "too", "only", "about", "up", "out", "into",
  ]);
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
}

// ═══════════════════════════════════════════════════════════════════════
// SIGNAL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Signal 1: Vector similarity on features.
 * Returns per-app average similarity score and matched feature names.
 */
async function featureSignal(
  query: FeatureQuery,
  run: CypherRunner,
): Promise<Map<string, { score: number; matched: string[] }>> {
  const useVector = isEmbeddingAvailable();

  if (useVector) {
    const results = await vectorSearch(
      `${query.name}: ${query.description}`,
      "LearnedFeature",
      TOP_K_VECTOR,
      run,
    );
    const grouped = groupByApp(results);
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const [app, g] of grouped) {
      out.set(app, { score: g.avgScore, matched: g.matched });
    }
    return out;
  }

  // Fallback: keyword matching against feature names and descriptions
  const keywords = extractKeywords(`${query.name} ${query.description}`);
  if (keywords.length === 0) return new Map();

  const conditions = keywords.map(
    (_, i) => `(toLower(f.name) CONTAINS $kw${i} OR toLower(f.description) CONTAINS $kw${i})`,
  );
  const params: Record<string, string> = {};
  keywords.forEach((kw, i) => { params[`kw${i}`] = kw; });

  const rows = await run(
    `MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
     WHERE ${conditions.join(" OR ")}
     RETURN a.name AS app, f.name AS feature,
            ${keywords.map((_, i) =>
              `CASE WHEN toLower(f.name) CONTAINS $kw${i} OR toLower(f.description) CONTAINS $kw${i} THEN 1 ELSE 0 END`,
            ).join(" + ")} AS hits`,
    params,
  );

  const groups = new Map<string, { totalHits: number; count: number; matched: string[] }>();
  for (const r of rows) {
    const app = r.app as string;
    if (!groups.has(app)) groups.set(app, { totalHits: 0, count: 0, matched: [] });
    const g = groups.get(app)!;
    g.totalHits += (r.hits as number) || 1;
    g.count += 1;
    g.matched.push(r.feature as string);
  }

  const out = new Map<string, { score: number; matched: string[] }>();
  for (const [app, g] of groups) {
    // Normalize: max possible hits per feature = keyword count
    out.set(app, {
      score: Math.min(1, g.totalHits / (g.count * keywords.length) * (g.count > 1 ? 1.2 : 1)),
      matched: g.matched,
    });
  }
  return out;
}

/**
 * Signal 2: Data model coverage.
 */
async function modelSignal(
  query: FeatureQuery,
  run: CypherRunner,
): Promise<Map<string, { score: number; matched: string[] }>> {
  if (query.required_models && query.required_models.length > 0) {
    const lowerModels = query.required_models.map((m) => m.toLowerCase());
    const rows = await run(
      `MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
       WHERE toLower(m.name) IN $models
       RETURN a.name AS app, collect(m.name) AS matched`,
      { models: lowerModels },
    );
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const r of rows) {
      const matched = (r.matched as string[]) || [];
      out.set(r.app as string, {
        score: matched.length / query.required_models.length,
        matched,
      });
    }
    return out;
  }

  // No explicit models — use vector search on description against LearnedDataModel
  if (isEmbeddingAvailable()) {
    const results = await vectorSearch(
      query.description,
      "LearnedDataModel",
      TOP_K_VECTOR,
      run,
    );
    const grouped = groupByApp(results);
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const [app, g] of grouped) {
      out.set(app, { score: g.avgScore, matched: g.matched });
    }
    return out;
  }

  return new Map();
}

/**
 * Signal 3: Integration overlap.
 */
async function integrationSignal(
  query: FeatureQuery,
  run: CypherRunner,
): Promise<Map<string, { score: number; matched: string[] }>> {
  if (query.required_integrations && query.required_integrations.length > 0) {
    const lowerIntegrations = query.required_integrations.map((i) => i.toLowerCase());
    const rows = await run(
      `MATCH (a:LearnedApp)-[:USES_INTEGRATION]->(i:LearnedIntegration)
       WHERE toLower(i.provider) IN $integrations OR toLower(i.name) IN $integrations
       RETURN a.name AS app, collect(COALESCE(i.provider, i.name)) AS matched`,
      { integrations: lowerIntegrations },
    );
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const r of rows) {
      const matched = (r.matched as string[]) || [];
      out.set(r.app as string, {
        score: matched.length / query.required_integrations.length,
        matched,
      });
    }
    return out;
  }

  // Fallback to vector search
  if (isEmbeddingAvailable()) {
    const results = await vectorSearch(
      query.description,
      "LearnedIntegration",
      TOP_K_VECTOR,
      run,
    );
    const grouped = groupByApp(results);
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const [app, g] of grouped) {
      out.set(app, { score: g.avgScore, matched: g.matched });
    }
    return out;
  }

  return new Map();
}

/**
 * Signal 4: Pattern match.
 */
async function patternSignal(
  query: FeatureQuery,
  run: CypherRunner,
): Promise<Map<string, { score: number; matched: string[] }>> {
  if (query.required_patterns && query.required_patterns.length > 0) {
    const lowerPatterns = query.required_patterns.map((p) => p.toLowerCase());
    const rows = await run(
      `MATCH (a:LearnedApp)-[:HAS_PATTERN]->(p:LearnedPattern)
       WHERE toLower(p.type) IN $patterns OR toLower(p.name) IN $patterns
       RETURN a.name AS app, collect(p.name) AS matched`,
      { patterns: lowerPatterns },
    );
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const r of rows) {
      const matched = (r.matched as string[]) || [];
      out.set(r.app as string, {
        score: matched.length / query.required_patterns.length,
        matched,
      });
    }
    return out;
  }

  // Fallback to vector search
  if (isEmbeddingAvailable()) {
    const results = await vectorSearch(
      query.description,
      "LearnedPattern",
      TOP_K_VECTOR,
      run,
    );
    const grouped = groupByApp(results);
    const out = new Map<string, { score: number; matched: string[] }>();
    for (const [app, g] of grouped) {
      out.set(app, { score: g.avgScore, matched: g.matched });
    }
    return out;
  }

  return new Map();
}

/**
 * Signal 5: Class affinity — loads app classes from the graph.
 */
async function loadAppClasses(
  run: CypherRunner,
): Promise<Map<string, string>> {
  const rows = await run(
    `MATCH (a:LearnedApp)
     RETURN a.name AS name, a.app_class AS app_class`,
  );
  const out = new Map<string, string>();
  for (const r of rows) {
    out.set(r.name as string, (r.app_class as string) || "unknown");
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// REUSE SUGGESTION GENERATION
// ═══════════════════════════════════════════════════════════════════════

async function generateSuggestions(
  appName: string,
  matchedFeatures: string[],
  matchedModels: string[],
  matchedPatterns: string[],
  run: CypherRunner,
): Promise<string[]> {
  const suggestions: string[] = [];

  // Feature suggestions with descriptions
  if (matchedFeatures.length > 0) {
    const featureDetails = await run(
      `MATCH (a:LearnedApp {name: $app})-[:HAS_FEATURE]->(f:LearnedFeature)
       WHERE f.name IN $features
       RETURN f.name AS name, f.description AS description`,
      { app: appName, features: matchedFeatures },
    );
    for (const f of featureDetails) {
      const desc = f.description ? ` (${(f.description as string).slice(0, 80)})` : "";
      suggestions.push(`Reuse ${appName}'s ${f.name} feature${desc}`);
    }
    // If Cypher returned nothing (name mismatch etc), still mention them
    if (featureDetails.length === 0) {
      for (const feat of matchedFeatures.slice(0, 3)) {
        suggestions.push(`Reuse ${appName}'s ${feat} feature`);
      }
    }
  }

  // Model suggestions with field counts
  if (matchedModels.length > 0) {
    const modelDetails = await run(
      `MATCH (a:LearnedApp {name: $app})-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
       WHERE m.name IN $models
       RETURN m.name AS name, m.field_count AS fields`,
      { app: appName, models: matchedModels },
    );
    for (const m of modelDetails) {
      const fields = m.fields ? ` (${m.fields} fields)` : "";
      suggestions.push(`Adopt ${appName}'s ${m.name} data model${fields}`);
    }
    if (modelDetails.length === 0) {
      for (const model of matchedModels.slice(0, 3)) {
        suggestions.push(`Adopt ${appName}'s ${model} data model`);
      }
    }
  }

  // Pattern suggestions
  for (const pat of matchedPatterns.slice(0, 3)) {
    suggestions.push(`Copy ${appName}'s ${pat} pattern`);
  }

  return suggestions;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════

/**
 * Find the best donor apps from the knowledge graph for a given feature spec.
 *
 * Uses multi-signal fusion:
 *  - Vector similarity on features (0.35)
 *  - Data model coverage (0.25)
 *  - Integration overlap (0.20)
 *  - Pattern match (0.15)
 *  - Class affinity bonus (0.05)
 */
export async function findDonors(
  query: FeatureQuery,
): Promise<DonorMatch[]> {
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();
  if (!ok) {
    console.warn("[donor-match] Neo4j unavailable — returning empty results");
    return [];
  }

  const run: CypherRunner = (cypher, params) => neo4j.runCypher(cypher, params);

  // Run all signals in parallel
  const [featureSig, modelSig, integrationSig, patternSig, appClasses] =
    await Promise.all([
      featureSignal(query, run),
      modelSignal(query, run),
      integrationSignal(query, run),
      patternSignal(query, run),
      loadAppClasses(run),
    ]);

  // Collect all app names seen across any signal
  const allApps = new Set<string>();
  for (const sig of [featureSig, modelSig, integrationSig, patternSig]) {
    for (const app of sig.keys()) allApps.add(app);
  }
  // Also include apps from the class map in case class affinity is the only signal
  if (query.app_class_hint) {
    for (const app of appClasses.keys()) allApps.add(app);
  }

  // Score each app
  const scored: DonorMatch[] = [];
  for (const app of allApps) {
    if (app === "unknown") continue;

    const fs = featureSig.get(app) || { score: 0, matched: [] };
    const ms = modelSig.get(app) || { score: 0, matched: [] };
    const is_ = integrationSig.get(app) || { score: 0, matched: [] };
    const ps = patternSig.get(app) || { score: 0, matched: [] };

    const classAffinity =
      query.app_class_hint &&
      appClasses.get(app)?.toLowerCase() === query.app_class_hint.toLowerCase()
        ? 1.0
        : 0.0;

    const overall =
      WEIGHT_FEATURE * fs.score +
      WEIGHT_MODEL * ms.score +
      WEIGHT_INTEGRATION * is_.score +
      WEIGHT_PATTERN * ps.score +
      WEIGHT_CLASS * classAffinity;

    if (overall <= 0) continue;

    scored.push({
      app_name: app,
      app_class: appClasses.get(app) || "unknown",
      overall_score: Math.round(overall * 1000) / 1000,
      feature_score: Math.round(fs.score * 1000) / 1000,
      model_score: Math.round(ms.score * 1000) / 1000,
      integration_score: Math.round(is_.score * 1000) / 1000,
      pattern_score: Math.round(ps.score * 1000) / 1000,
      matched_features: fs.matched,
      matched_models: ms.matched,
      matched_integrations: is_.matched,
      matched_patterns: ps.matched,
      reuse_suggestions: [], // filled below for top results
    });
  }

  // Sort descending by overall score
  scored.sort((a, b) => b.overall_score - a.overall_score);

  // Take top N
  const top = scored.slice(0, MAX_RESULTS);

  // Generate reuse suggestions for donors above threshold
  await Promise.all(
    top.map(async (donor) => {
      if (donor.overall_score >= SUGGESTION_THRESHOLD) {
        donor.reuse_suggestions = await generateSuggestions(
          donor.app_name,
          donor.matched_features,
          donor.matched_models,
          donor.matched_patterns,
          run,
        );
      }
    }),
  );

  return top;
}

// ═══════════════════════════════════════════════════════════════════════
// CLI FORMATTING
// ═══════════════════════════════════════════════════════════════════════

function printResults(query: FeatureQuery, results: DonorMatch[]): void {
  console.log();
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║                    AES DONOR MATCH ENGINE                   ║");
  console.log("╚══════════════════════════════════════════════════════════════╝");
  console.log();
  console.log(`  Query:  ${query.name}`);
  console.log(`  Desc:   ${query.description}`);
  if (query.required_models?.length)
    console.log(`  Models: ${query.required_models.join(", ")}`);
  if (query.required_integrations?.length)
    console.log(`  Integrations: ${query.required_integrations.join(", ")}`);
  if (query.required_patterns?.length)
    console.log(`  Patterns: ${query.required_patterns.join(", ")}`);
  if (query.app_class_hint)
    console.log(`  Class hint: ${query.app_class_hint}`);
  console.log();

  if (results.length === 0) {
    console.log("  No matching donors found.");
    console.log();
    return;
  }

  // Table header
  console.log(
    "  ┌─────┬──────────────────────────┬──────────┬────────────────────────────────┐",
  );
  console.log(
    "  │ #   │ App                      │ Score    │ Signals (F/M/I/P)              │",
  );
  console.log(
    "  ├─────┼──────────────────────────┼──────────┼────────────────────────────────┤",
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const rank = String(i + 1).padStart(2);
    const name = r.app_name.padEnd(24).slice(0, 24);
    const score = (r.overall_score.toFixed(3)).padStart(7);
    const signals = `${r.feature_score.toFixed(2)}/${r.model_score.toFixed(2)}/${r.integration_score.toFixed(2)}/${r.pattern_score.toFixed(2)}`;
    console.log(
      `  │ ${rank}  │ ${name} │ ${score}  │ ${signals.padEnd(30)} │`,
    );
  }

  console.log(
    "  └─────┴──────────────────────────┴──────────┴────────────────────────────────┘",
  );
  console.log();

  // Detailed breakdown for each donor
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    console.log(`  ── #${i + 1} ${r.app_name} (${r.app_class}) ──`);
    if (r.matched_features.length > 0)
      console.log(`     Features:     ${r.matched_features.join(", ")}`);
    if (r.matched_models.length > 0)
      console.log(`     Models:       ${r.matched_models.join(", ")}`);
    if (r.matched_integrations.length > 0)
      console.log(`     Integrations: ${r.matched_integrations.join(", ")}`);
    if (r.matched_patterns.length > 0)
      console.log(`     Patterns:     ${r.matched_patterns.join(", ")}`);
    if (r.reuse_suggestions.length > 0) {
      console.log("     Suggestions:");
      for (const s of r.reuse_suggestions) {
        console.log(`       → ${s}`);
      }
    }
    console.log();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CLI ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage:");
    console.log('  npx tsx src/tools/donor-match.ts "auth with SSO, MFA, and RBAC"');
    console.log(
      '  npx tsx src/tools/donor-match.ts --json \'{"name":"auth","description":"SSO with SAML"}\'',
    );
    process.exit(1);
  }

  let query: FeatureQuery;

  if (args[0] === "--json") {
    const jsonStr = args.slice(1).join(" ");
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.name || !parsed.description) {
        console.error("JSON must include at least 'name' and 'description'.");
        process.exit(1);
      }
      query = parsed as FeatureQuery;
    } catch {
      console.error("Invalid JSON input.");
      process.exit(1);
    }
  } else {
    const description = args.join(" ");
    const name = description.split(/[\s,]+/)[0].toLowerCase();
    query = { name, description };
  }

  console.log("[donor-match] Searching knowledge graph...");

  const results = await findDonors(query);
  printResults(query, results);

  // Clean shutdown
  const neo4j = getNeo4jService();
  await neo4j.close();
}

// Run CLI if executed directly
const isMain =
  process.argv[1]?.endsWith("donor-match.ts") ||
  process.argv[1]?.endsWith("donor-match.js");

if (isMain) {
  main().catch((err) => {
    console.error("[donor-match] Fatal:", err);
    process.exit(1);
  });
}
