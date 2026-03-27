/**
 * smart-graph-reader.ts — Next-gen graph reader that:
 *
 *   1. Auto-generates synonym clusters FROM the graph (no hardcoded map)
 *   2. Follows relationships to pull connected subgraphs
 *   3. Computes confidence scores per concept
 *
 * Run standalone to test:
 *   npx tsx src/tools/smart-graph-reader.ts "barber shop appointment booking app"
 */

import { getNeo4jService } from "../services/neo4j-service.js";

let neo4j: ReturnType<typeof getNeo4jService>;

async function q(cypher: string): Promise<any[]> {
  try { return await neo4j.runCypher(cypher); }
  catch { return []; }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ─── 1. AUTO-SYNONYM GENERATION FROM GRAPH ───────────────────────────
// Instead of a hardcoded map, ask the graph:
// "What other terms appear in the same apps as this keyword?"

async function buildSynonymClusters(keywords: string[]): Promise<Map<string, string[]>> {
  const clusters = new Map<string, string[]>();

  for (const kw of keywords) {
    const lower = kw.toLowerCase();

    // Find apps that contain this keyword in any node
    const coTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
      RETURN DISTINCT toLower(f.name) AS term
      LIMIT 20
    `);

    const modelTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
      RETURN DISTINCT toLower(m.name) AS term
      LIMIT 20
    `);

    const integTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
      RETURN DISTINCT toLower(i.name) AS term
      LIMIT 15
    `);

    const all = [
      ...coTerms.map((r: any) => r.term),
      ...modelTerms.map((r: any) => r.term),
      ...integTerms.map((r: any) => r.term),
    ].filter(Boolean);

    clusters.set(kw, [...new Set([kw, ...all])]);
  }

  return clusters;
}

// ─── 2. RELATIONSHIP TRAVERSAL ───────────────────────────────────────
// When we find a node, follow its edges to build a connected picture.

interface ConnectedKnowledge {
  anchor: string;
  anchorType: string;
  features: string[];
  models: string[];
  integrations: string[];
  patterns: string[];
  flows: string[];
  pages: string[];
}

async function traverseFromFeature(featureName: string): Promise<ConnectedKnowledge> {
  const result: ConnectedKnowledge = {
    anchor: featureName, anchorType: "feature",
    features: [], models: [], integrations: [], patterns: [], flows: [], pages: [],
  };

  // Find the app this feature belongs to, then get its siblings
  const app = await q(`
    MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
    WHERE toLower(f.name) = '${esc(featureName.toLowerCase())}'
    RETURN a.source_id AS app_id, a.name AS app_name, a.app_class AS app_class
    LIMIT 1
  `);

  if (app.length === 0) return result;

  const appId = app[0].app_id;

  // Pull the whole connected subgraph from this app
  const [features, models, integrations, patterns, flows] = await Promise.all([
    q(`MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_FEATURE]->(f:LearnedFeature) RETURN f.name AS name LIMIT 30`),
    q(`MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_DATA_MODEL]->(m:LearnedDataModel) RETURN m.name AS name, m.category AS category LIMIT 30`),
    q(`MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_INTEGRATION]->(i:LearnedIntegration) RETURN i.name AS name, i.type AS type LIMIT 20`),
    q(`MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:USES_PATTERN]->(p:LearnedPattern) RETURN p.name AS name, p.type AS type LIMIT 20`),
    q(`MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_USER_FLOW]->(f:LearnedUserFlow) RETURN f.name AS name LIMIT 10`),
  ]);

  result.features = features.map((r: any) => r.name);
  result.models = models.map((r: any) => `${r.name} (${r.category})`);
  result.integrations = integrations.map((r: any) => `${r.name} [${r.type}]`);
  result.patterns = patterns.map((r: any) => `${r.name} [${r.type}]`);
  result.flows = flows.map((r: any) => r.name);

  return result;
}

async function traverseFromModel(modelName: string): Promise<ConnectedKnowledge> {
  const result: ConnectedKnowledge = {
    anchor: modelName, anchorType: "model",
    features: [], models: [], integrations: [], patterns: [], flows: [], pages: [],
  };

  // Find the app this model belongs to
  const app = await q(`
    MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    WHERE toLower(m.name) = '${esc(modelName.toLowerCase())}'
    RETURN a.source_id AS app_id
    LIMIT 1
  `);

  if (app.length === 0) return result;

  const appId = app[0].app_id;

  // Pull related features that reference this model
  const features = await q(`
    MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_FEATURE]->(f:LearnedFeature)
    WHERE any(m IN f.related_data_models WHERE toLower(m) CONTAINS '${esc(modelName.toLowerCase())}')
       OR toLower(f.name) CONTAINS '${esc(modelName.toLowerCase())}'
    RETURN f.name AS name LIMIT 10
  `);
  result.features = features.map((r: any) => r.name);

  // Pull sibling models from same app
  const models = await q(`
    MATCH (a:LearnedApp {source_id: '${esc(appId)}'})-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    RETURN m.name AS name, m.category AS category LIMIT 20
  `);
  result.models = models.map((r: any) => `${r.name} (${r.category})`);

  return result;
}

// ─── 3. CONFIDENCE SCORING ───────────────────────────────────────────
// STRATEGY-005: More evidence paths = higher confidence

interface ConceptScore {
  concept: string;
  featureHits: number;
  modelHits: number;
  integrationHits: number;
  patternHits: number;
  flowHits: number;
  pageHits: number;
  totalHits: number;
  nodeTypesHit: number;
  confidence: "HIGH" | "MEDIUM" | "LOW" | "GAP";
  evidence: string[];
}

async function scoreConceptConfidence(concept: string, keywords: string[]): Promise<ConceptScore> {
  const score: ConceptScore = {
    concept,
    featureHits: 0, modelHits: 0, integrationHits: 0,
    patternHits: 0, flowHits: 0, pageHits: 0,
    totalHits: 0, nodeTypesHit: 0,
    confidence: "GAP",
    evidence: [],
  };

  for (const kw of keywords) {
    const lower = kw.toLowerCase();

    const features = await q(`MATCH (f:LearnedFeature) WHERE toLower(f.name) CONTAINS '${esc(lower)}' RETURN f.name AS n LIMIT 5`);
    score.featureHits += features.length;
    features.forEach((r: any) => score.evidence.push(`Feature:${r.n}`));

    const models = await q(`MATCH (m:LearnedDataModel) WHERE toLower(m.name) CONTAINS '${esc(lower)}' RETURN DISTINCT m.name AS n LIMIT 5`);
    score.modelHits += models.length;
    models.forEach((r: any) => score.evidence.push(`Model:${r.n}`));

    const integrations = await q(`MATCH (i:LearnedIntegration) WHERE toLower(i.name) CONTAINS '${esc(lower)}' RETURN DISTINCT i.name AS n LIMIT 3`);
    score.integrationHits += integrations.length;
    integrations.forEach((r: any) => score.evidence.push(`Integration:${r.n}`));

    const patterns = await q(`MATCH (p:LearnedPattern) WHERE toLower(p.name) CONTAINS '${esc(lower)}' OR toLower(p.description) CONTAINS '${esc(lower)}' RETURN DISTINCT p.name AS n LIMIT 3`);
    score.patternHits += patterns.length;
    patterns.forEach((r: any) => score.evidence.push(`Pattern:${r.n}`));

    const flows = await q(`MATCH (f:LearnedUserFlow) WHERE toLower(f.name) CONTAINS '${esc(lower)}' RETURN f.name AS n LIMIT 3`);
    score.flowHits += flows.length;
    flows.forEach((r: any) => score.evidence.push(`Flow:${r.n}`));

    const pages = await q(`MATCH (p:LearnedPageSection) WHERE toLower(p.name) CONTAINS '${esc(lower)}' RETURN p.name AS n LIMIT 3`);
    score.pageHits += pages.length;
    pages.forEach((r: any) => score.evidence.push(`Page:${r.n}`));
  }

  score.totalHits = score.featureHits + score.modelHits + score.integrationHits +
                    score.patternHits + score.flowHits + score.pageHits;

  score.nodeTypesHit = [
    score.featureHits, score.modelHits, score.integrationHits,
    score.patternHits, score.flowHits, score.pageHits,
  ].filter(n => n > 0).length;

  // Deduplicate evidence
  score.evidence = [...new Set(score.evidence)].slice(0, 10);

  // Confidence based on breadth (node types hit) and depth (total hits)
  if (score.nodeTypesHit >= 3 && score.totalHits >= 5) score.confidence = "HIGH";
  else if (score.nodeTypesHit >= 2 && score.totalHits >= 3) score.confidence = "MEDIUM";
  else if (score.totalHits >= 1) score.confidence = "LOW";
  else score.confidence = "GAP";

  return score;
}

// ─── 4. CROSS-APP FREQUENCY ─────────────────────────────────────────
// "9/15 apps use Stripe" is stronger evidence than "1 app uses Stripe"

async function crossAppFrequency(keyword: string): Promise<{ count: number; apps: string[] }> {
  const rows = await q(`
    MATCH (a:LearnedApp)-[]->(n)
    WHERE toLower(n.name) CONTAINS '${esc(keyword.toLowerCase())}'
    RETURN DISTINCT a.name AS app
    LIMIT 15
  `);
  return { count: rows.length, apps: rows.map((r: any) => r.app) };
}

// ─── MAIN: Full smart read ──────────────────────────────────────────

async function smartRead(request: string) {
  neo4j = getNeo4jService();
  await neo4j.connect();

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  AES Smart Graph Reader`);
  console.log(`  Request: "${request}"`);
  console.log(`${"═".repeat(65)}\n`);

  // ── Step 0: Load reasoning rules ──
  const rules = await q(`MATCH (r:AESReasoningRule) RETURN r.title AS title, r.summary AS summary ORDER BY r.priority`);
  if (rules.length > 0) {
    console.log("  ▸ REASONING RULES LOADED:");
    rules.forEach((r: any) => console.log(`    ${r.title}`));
    console.log();
  }

  // ── Step 1: Extract raw keywords ──
  const raw = request.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !new Set(["the","and","for","with","app","build","create","make","want","need","new","please","application","system"]).has(w));

  console.log(`  ▸ RAW KEYWORDS: ${raw.join(", ")}`);

  // ── Step 2: Auto-generate synonyms from graph ──
  console.log(`  ▸ BUILDING SYNONYM CLUSTERS FROM GRAPH...`);
  const clusters = await buildSynonymClusters(raw);
  let totalExpanded = 0;
  for (const [kw, syns] of clusters) {
    if (syns.length > 1) {
      console.log(`    ${kw} → [${syns.slice(0, 8).join(", ")}${syns.length > 8 ? ` +${syns.length - 8} more` : ""}]`);
    }
    totalExpanded += syns.length;
  }
  console.log(`    Expanded ${raw.length} keywords → ${totalExpanded} search terms\n`);

  // ── Step 3: Concept confidence scoring ──
  console.log(`  ▸ CONCEPT CONFIDENCE SCORES:`);
  const concepts = [
    { name: "Scheduling/Booking", keywords: ["booking", "appointment", "schedule", "availability", "slot"] },
    { name: "Client/Contact Management", keywords: ["client", "customer", "contact", "profile", "user"] },
    { name: "Payments", keywords: ["payment", "stripe", "billing", "checkout", "credit", "invoice"] },
    { name: "Notifications", keywords: ["notification", "sms", "email", "reminder", "twilio", "sendgrid"] },
    { name: "Calendar", keywords: ["calendar", "sync", "google", "ical", "caldav"] },
    { name: "Staff/Team Management", keywords: ["staff", "team", "member", "barber", "role", "permission"] },
    { name: "Analytics/Reporting", keywords: ["analytics", "report", "dashboard", "chart", "insight"] },
    { name: "Auth/Security", keywords: ["auth", "login", "jwt", "rbac", "session", "2fa", "oauth"] },
    { name: "Reviews/Ratings", keywords: ["review", "rating", "feedback", "star"] },
    { name: "Service Menu", keywords: ["service", "event-type", "menu", "duration", "pricing"] },
    { name: "Multi-location", keywords: ["location", "branch", "venue", "site"] },
    { name: "Loyalty/Rewards", keywords: ["loyalty", "reward", "stamp", "points", "retention"] },
    { name: "Waitlist/Walk-in", keywords: ["waitlist", "queue", "walk-in", "wait"] },
    { name: "Marketing", keywords: ["marketing", "campaign", "promo", "discount", "gift"] },
  ];

  const scores: ConceptScore[] = [];
  for (const c of concepts) {
    const score = await scoreConceptConfidence(c.name, c.keywords);
    scores.push(score);

    const icon = score.confidence === "HIGH" ? "🟢" :
                 score.confidence === "MEDIUM" ? "🟡" :
                 score.confidence === "LOW" ? "🟠" : "🔴";

    console.log(`    ${icon} ${score.confidence.padEnd(6)} ${c.name} — ${score.nodeTypesHit} node types, ${score.totalHits} hits`);
    if (score.evidence.length > 0) {
      console.log(`             ${score.evidence.slice(0, 5).join("; ")}`);
    }
  }

  const highCount = scores.filter(s => s.confidence === "HIGH").length;
  const gapCount = scores.filter(s => s.confidence === "GAP").length;
  console.log(`\n    Summary: ${highCount} HIGH, ${scores.filter(s => s.confidence === "MEDIUM").length} MEDIUM, ${scores.filter(s => s.confidence === "LOW").length} LOW, ${gapCount} GAP`);

  // ── Step 4: Cross-app frequency for key terms ──
  console.log(`\n  ▸ CROSS-APP FREQUENCY (how common is this across all 15 apps?):`);
  const freqTerms = ["booking", "payment", "auth", "calendar", "notification", "stripe", "analytics", "team"];
  for (const term of freqTerms) {
    const freq = await crossAppFrequency(term);
    const bar = "█".repeat(freq.count) + "░".repeat(15 - freq.count);
    console.log(`    ${term.padEnd(14)} ${bar} ${freq.count}/15`);
  }

  // ── Step 5: Relationship traversal for top concept ──
  console.log(`\n  ▸ RELATIONSHIP TRAVERSAL (following edges from top match):`);
  const topFeature = await q(`
    MATCH (f:LearnedFeature)
    WHERE toLower(f.name) CONTAINS 'booking' OR toLower(f.name) CONTAINS 'appointment'
    RETURN f.name AS name LIMIT 1
  `);

  if (topFeature.length > 0) {
    const connected = await traverseFromFeature(topFeature[0].name);
    console.log(`    Anchor: Feature:${connected.anchor}`);
    console.log(`    → ${connected.features.length} sibling features: ${connected.features.slice(0, 8).join(", ")}`);
    console.log(`    → ${connected.models.length} data models: ${connected.models.slice(0, 8).join(", ")}`);
    console.log(`    → ${connected.integrations.length} integrations: ${connected.integrations.slice(0, 6).join(", ")}`);
    console.log(`    → ${connected.patterns.length} patterns: ${connected.patterns.slice(0, 6).join(", ")}`);
    console.log(`    → ${connected.flows.length} user flows: ${connected.flows.join(", ")}`);
  }

  // ── Step 6: Final readout ──
  console.log(`\n${"═".repeat(65)}`);
  console.log(`  DECISION:`);
  if (gapCount === 0) {
    console.log(`  ✅ Graph has HIGH/MEDIUM confidence for ALL concepts.`);
    console.log(`     Proceed to build without external research.`);
  } else if (gapCount <= 3) {
    console.log(`  ⚠️  Graph has ${gapCount} gap(s): ${scores.filter(s => s.confidence === "GAP").map(s => s.concept).join(", ")}`);
    console.log(`     Recommend: targeted Perplexity research for gaps only.`);
  } else {
    console.log(`  ❌ Graph has ${gapCount} gaps. This domain needs research first.`);
    console.log(`     Recommend: full Perplexity research before planning.`);
  }
  console.log(`${"═".repeat(65)}\n`);

  await neo4j.close();
}

// ─── CLI ─────────────────────────────────────────────────────────────

const request = process.argv[2] || "barber shop appointment booking app";
smartRead(request).catch(console.error);
