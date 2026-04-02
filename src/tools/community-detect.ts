/**
 * community-detect.ts — Auto-discover domain communities from the knowledge graph.
 *
 * Replaces the hardcoded DOMAIN_RULES in unified-graph-reasoner.ts with
 * communities discovered from actual graph structure.
 *
 * Approach: Feature co-occurrence community detection.
 * Two features belong to the same community if they co-occur in the same app
 * more often than expected by chance. We build a co-occurrence matrix,
 * then use a label propagation algorithm to find natural clusters.
 *
 * This is cheaper than Neo4j GDS (no plugin required) and works with
 * the existing graph structure.
 *
 * Usage:
 *   npx tsx src/tools/community-detect.ts                    # discover and display
 *   npx tsx src/tools/community-detect.ts --write            # write communities to graph
 *   npx tsx src/tools/community-detect.ts --export           # export as DOMAIN_RULES replacement
 */

import { getNeo4jService } from "../services/neo4j-service.js";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface Community {
  id: string;
  /** Auto-generated label from the most representative terms */
  label: string;
  /** Member apps */
  apps: string[];
  /** Core feature terms that define this community */
  coreTerms: string[];
  /** Model categories common in this community */
  modelCategories: string[];
  /** Integration types common in this community */
  integrationTypes: string[];
  /** How many apps belong to this community */
  size: number;
  /** Cohesion score: avg internal edge weight / avg external edge weight */
  cohesion: number;
}

export interface CommunityDetectionResult {
  communities: Community[];
  totalApps: number;
  totalFeatures: number;
  modularity: number;
  /** Ready-to-use domain rules matching the format of DOMAIN_RULES */
  domainRules: DomainRule[];
}

export interface DomainRule {
  domain: string;
  triggers: string[];
  desc: string;
  keywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// GRAPH QUERIES
// ═══════════════════════════════════════════════════════════════════════

let neo4j: ReturnType<typeof getNeo4jService>;

async function q(cypher: string): Promise<any[]> {
  try { return await neo4j.runCypher(cypher); }
  catch { return []; }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function val(v: any): number {
  return v && typeof v === "object" && "low" in v ? v.low : (typeof v === "number" ? v : 0);
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 1: BUILD APP FEATURE VECTORS
// ═══════════════════════════════════════════════════════════════════════

interface AppVector {
  name: string;
  appClass: string;
  features: Set<string>;
  models: Set<string>;
  modelCategories: Set<string>;
  integrationTypes: Set<string>;
  patternTypes: Set<string>;
}

async function buildAppVectors(): Promise<AppVector[]> {
  const apps = await q(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
    OPTIONAL MATCH (a)-[:USES_PATTERN]->(p:LearnedPattern)
    RETURN a.name AS name, a.app_class AS appClass,
           collect(DISTINCT toLower(f.name)) AS features,
           collect(DISTINCT toLower(m.name)) AS models,
           collect(DISTINCT m.category) AS modelCategories,
           collect(DISTINCT i.type) AS integrationTypes,
           collect(DISTINCT p.type) AS patternTypes
  `);

  return apps.map((r: any) => ({
    name: r.name,
    appClass: r.appClass || "other",
    features: new Set((r.features || []).filter(Boolean)),
    models: new Set((r.models || []).filter(Boolean)),
    modelCategories: new Set((r.modelCategories || []).filter(Boolean)),
    integrationTypes: new Set((r.integrationTypes || []).filter(Boolean)),
    patternTypes: new Set((r.patternTypes || []).filter(Boolean)),
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 2: COMPUTE SIMILARITY MATRIX (Jaccard on feature sets)
// ═══════════════════════════════════════════════════════════════════════

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const item of Array.from(a)) {
    if (b.has(item)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function combinedSimilarity(a: AppVector, b: AppVector): number {
  // Weighted Jaccard across all dimensions
  const featureSim = jaccardSimilarity(a.features, b.features) * 0.4;
  const modelSim = jaccardSimilarity(a.models, b.models) * 0.2;
  const modelCatSim = jaccardSimilarity(a.modelCategories, b.modelCategories) * 0.15;
  const integSim = jaccardSimilarity(a.integrationTypes, b.integrationTypes) * 0.15;
  const patternSim = jaccardSimilarity(a.patternTypes, b.patternTypes) * 0.1;
  return featureSim + modelSim + modelCatSim + integSim + patternSim;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 3: LABEL PROPAGATION CLUSTERING
// ═══════════════════════════════════════════════════════════════════════

/**
 * Label propagation community detection.
 * Each node starts with its own label. Iteratively, each node adopts
 * the label most common among its weighted neighbors.
 * Converges when no labels change.
 *
 * @param similarityThreshold Minimum similarity to form an edge (default 0.1)
 * @param maxIterations Safety cap (default 50)
 */
function labelPropagation(
  apps: AppVector[],
  similarityThreshold: number = 0.08,
  maxIterations: number = 50,
): Map<string, number> {
  const n = apps.length;
  if (n === 0) return new Map();

  // Build adjacency with weights
  const edges: { i: number; j: number; weight: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = combinedSimilarity(apps[i], apps[j]);
      if (sim >= similarityThreshold) {
        edges.push({ i, j, weight: sim });
      }
    }
  }

  // Initialize labels: each app gets its own label
  const labels = new Array(n);
  for (let i = 0; i < n; i++) labels[i] = i;

  // Iterate
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Process in random order
    const order = Array.from({ length: n }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    for (const idx of order) {
      // Count weighted votes from neighbors
      const votes = new Map<number, number>();
      for (const edge of edges) {
        if (edge.i === idx) {
          const lbl = labels[edge.j];
          votes.set(lbl, (votes.get(lbl) || 0) + edge.weight);
        } else if (edge.j === idx) {
          const lbl = labels[edge.i];
          votes.set(lbl, (votes.get(lbl) || 0) + edge.weight);
        }
      }

      if (votes.size === 0) continue;

      // Pick label with highest weighted vote
      let bestLabel = labels[idx];
      let bestWeight = 0;
      for (const [lbl, weight] of Array.from(votes.entries())) {
        if (weight > bestWeight) {
          bestWeight = weight;
          bestLabel = lbl;
        }
      }

      if (bestLabel !== labels[idx]) {
        labels[idx] = bestLabel;
        changed = true;
      }
    }

    if (!changed) break;
  }

  // Map app name → community label
  const result = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    result.set(apps[i].name, labels[i]);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 4: BUILD COMMUNITIES FROM LABELS
// ═══════════════════════════════════════════════════════════════════════

function buildCommunities(
  apps: AppVector[],
  labels: Map<string, number>,
): Community[] {
  // Group apps by label
  const groups = new Map<number, AppVector[]>();
  for (const app of apps) {
    const label = labels.get(app.name) ?? -1;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(app);
  }

  const communities: Community[] = [];
  let communityIdx = 0;

  for (const [, members] of Array.from(groups.entries())) {
    if (members.length === 0) continue;

    // Find core terms — features that appear in 50%+ of community members
    const featureFreq = new Map<string, number>();
    for (const app of members) {
      for (const f of Array.from(app.features)) {
        featureFreq.set(f, (featureFreq.get(f) || 0) + 1);
      }
    }
    const threshold = Math.max(1, Math.floor(members.length * 0.4));
    const coreTerms = Array.from(featureFreq.entries())
      .filter(([, count]) => count >= threshold)
      .sort((a, b) => b[1] - a[1])
      .map(([term]) => term)
      .slice(0, 15);

    // Aggregate model categories and integration types
    const catFreq = new Map<string, number>();
    const integFreq = new Map<string, number>();
    for (const app of members) {
      for (const cat of Array.from(app.modelCategories)) {
        catFreq.set(cat, (catFreq.get(cat) || 0) + 1);
      }
      for (const t of Array.from(app.integrationTypes)) {
        integFreq.set(t, (integFreq.get(t) || 0) + 1);
      }
    }

    // Auto-label from app_class majority or core terms
    const classFreq = new Map<string, number>();
    for (const app of members) {
      classFreq.set(app.appClass, (classFreq.get(app.appClass) || 0) + 1);
    }
    let label = "community_" + communityIdx;
    let bestClassCount = 0;
    for (const [cls, count] of Array.from(classFreq.entries())) {
      if (count > bestClassCount && cls !== "other") {
        bestClassCount = count;
        label = cls;
      }
    }
    // If no clear class winner, use top core terms
    if (bestClassCount < members.length * 0.5 && coreTerms.length > 0) {
      label = coreTerms.slice(0, 2).join("_");
    }

    // Compute cohesion — avg internal similarity vs avg external similarity
    let internalSum = 0;
    let internalCount = 0;
    let externalSum = 0;
    let externalCount = 0;
    const memberNames = new Set(members.map(m => m.name));

    for (const app of members) {
      for (const other of apps) {
        if (app.name === other.name) continue;
        const sim = combinedSimilarity(app, other);
        if (memberNames.has(other.name)) {
          internalSum += sim;
          internalCount++;
        } else {
          externalSum += sim;
          externalCount++;
        }
      }
    }

    const avgInternal = internalCount > 0 ? internalSum / internalCount : 0;
    const avgExternal = externalCount > 0 ? externalSum / externalCount : 0.001;

    communities.push({
      id: `community-${communityIdx}`,
      label,
      apps: members.map(m => m.name),
      coreTerms,
      modelCategories: Array.from(catFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([cat]) => cat)
        .slice(0, 5),
      integrationTypes: Array.from(integFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([t]) => t)
        .slice(0, 5),
      size: members.length,
      cohesion: avgInternal / avgExternal,
    });

    communityIdx++;
  }

  // Sort by size descending
  communities.sort((a, b) => b.size - a.size);
  return communities;
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 5: GENERATE DOMAIN RULES FROM COMMUNITIES
// ═══════════════════════════════════════════════════════════════════════

function generateDomainRules(communities: Community[]): DomainRule[] {
  return communities.map(c => ({
    domain: c.label,
    triggers: c.coreTerms.slice(0, 10),
    desc: `Auto-discovered community: ${c.apps.slice(0, 3).join(", ")}${c.apps.length > 3 ? ` +${c.apps.length - 3} more` : ""}`,
    keywords: [...c.coreTerms.slice(0, 7), ...c.modelCategories.slice(0, 3)],
  }));
}

// ═══════════════════════════════════════════════════════════════════════
// STEP 6: COMPUTE MODULARITY
// ═══════════════════════════════════════════════════════════════════════

function computeModularity(apps: AppVector[], labels: Map<string, number>): number {
  // Newman-Girvan modularity: Q = (1/2m) * Σ [A_ij - k_i*k_j/2m] * δ(c_i, c_j)
  const n = apps.length;
  if (n < 2) return 0;

  // Build full similarity matrix
  let totalWeight = 0;
  const degrees = new Array(n).fill(0);
  const simMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const sim = combinedSimilarity(apps[i], apps[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
      totalWeight += sim;
      degrees[i] += sim;
      degrees[j] += sim;
    }
  }

  if (totalWeight === 0) return 0;
  const m2 = 2 * totalWeight;

  let modularity = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const ci = labels.get(apps[i].name) ?? -1;
      const cj = labels.get(apps[j].name) ?? -2;
      if (ci === cj) {
        modularity += simMatrix[i][j] - (degrees[i] * degrees[j]) / m2;
      }
    }
  }

  return modularity / m2;
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN: DETECT COMMUNITIES
// ═══════════════════════════════════════════════════════════════════════

export async function detectCommunities(): Promise<CommunityDetectionResult> {
  const apps = await buildAppVectors();
  const totalFeatures = apps.reduce((sum, a) => sum + a.features.size, 0);

  // Run label propagation multiple times and pick best modularity
  let bestLabels = new Map<string, number>();
  let bestModularity = -Infinity;

  for (let run = 0; run < 5; run++) {
    const labels = labelPropagation(apps);
    const mod = computeModularity(apps, labels);
    if (mod > bestModularity) {
      bestModularity = mod;
      bestLabels = labels;
    }
  }

  const communities = buildCommunities(apps, bestLabels);
  const domainRules = generateDomainRules(communities);

  return {
    communities,
    totalApps: apps.length,
    totalFeatures,
    modularity: bestModularity,
    domainRules,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GRAPH WRITER — persist communities to Neo4j
// ═══════════════════════════════════════════════════════════════════════

async function writeCommunities(result: CommunityDetectionResult): Promise<void> {
  const now = new Date().toISOString();

  for (const community of result.communities) {
    await q(`
      MERGE (c:GraphCommunity {community_id: '${esc(community.id)}'})
      SET c.label = '${esc(community.label)}',
          c.size = ${community.size},
          c.cohesion = ${community.cohesion.toFixed(4)},
          c.core_terms = '${esc(community.coreTerms.join(","))}',
          c.model_categories = '${esc(community.modelCategories.join(","))}',
          c.integration_types = '${esc(community.integrationTypes.join(","))}',
          c.detected_at = '${now}'
    `);

    // Link apps to their community
    for (const appName of community.apps) {
      await q(`
        MATCH (a:LearnedApp {name: '${esc(appName)}'})
        MATCH (c:GraphCommunity {community_id: '${esc(community.id)}'})
        MERGE (a)-[:BELONGS_TO_COMMUNITY]->(c)
      `);
    }
  }

  // Store modularity as a graph property, linked to the first community as anchor
  await q(`
    MERGE (m:GraphMetric {name: 'community_modularity'})
    SET m.value = ${result.modularity.toFixed(6)},
        m.community_count = ${result.communities.length},
        m.total_apps = ${result.totalApps},
        m.computed_at = '${now}'
    WITH m
    OPTIONAL MATCH (c:GraphCommunity)
    WITH m, collect(c) AS communities
    FOREACH (c IN communities |
      MERGE (m)-[:MEASURES]->(c)
    )
  `);
}

// ═══════════════════════════════════════════════════════════════════════
// CLI RUNNER
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const writeMode = process.argv.includes("--write");
  const exportMode = process.argv.includes("--export");

  neo4j = getNeo4jService();
  await neo4j.connect();

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  AES GRAPH COMMUNITY DETECTION`);
  console.log(`  Algorithm: Weighted Label Propagation (5 runs, best modularity)`);
  console.log(`  Similarity: Weighted Jaccard (features 40%, models 20%, categories 15%, integrations 15%, patterns 10%)`);
  console.log(`${"═".repeat(65)}\n`);

  const result = await detectCommunities();

  console.log(`  ▸ GRAPH STATS`);
  console.log(`    Apps: ${result.totalApps}`);
  console.log(`    Features: ${result.totalFeatures}`);
  console.log(`    Communities found: ${result.communities.length}`);
  console.log(`    Modularity: ${result.modularity.toFixed(4)} (higher = better separation)\n`);

  for (const c of result.communities) {
    console.log(`  ▸ COMMUNITY: ${c.label} (${c.size} apps, cohesion: ${c.cohesion.toFixed(2)})`);
    console.log(`    Apps: ${c.apps.join(", ")}`);
    if (c.coreTerms.length > 0) console.log(`    Core terms: ${c.coreTerms.slice(0, 8).join(", ")}`);
    if (c.modelCategories.length > 0) console.log(`    Model categories: ${c.modelCategories.join(", ")}`);
    if (c.integrationTypes.length > 0) console.log(`    Integration types: ${c.integrationTypes.join(", ")}`);
    console.log();
  }

  if (exportMode) {
    console.log(`  ▸ EXPORTED DOMAIN RULES (drop-in replacement for DOMAIN_RULES):\n`);
    console.log(`const AUTO_DOMAIN_RULES = ${JSON.stringify(result.domainRules, null, 2)};\n`);
  }

  if (writeMode) {
    console.log(`  ▸ WRITING COMMUNITIES TO GRAPH...`);
    await writeCommunities(result);
    console.log(`    ✅ ${result.communities.length} communities persisted`);
  }

  console.log(`${"═".repeat(65)}\n`);
  await neo4j.close();
}

main().catch(console.error);
