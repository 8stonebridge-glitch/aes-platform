/**
 * reasoner-bench-runner.ts — Subprocess runner for autoresearch benchmarking.
 *
 * Called by autoresearch-loop.ts with a query and params (via env var).
 * Runs the unified reasoner and outputs structured JSON to stdout.
 *
 * Usage:
 *   AES_REASONER_PARAMS='{"beamWidth":6,...}' npx tsx src/tools/reasoner-bench-runner.ts "barber booking app"
 */

import { getNeo4jService } from "../services/neo4j-service.js";
import {
  isEmbeddingAvailable, vectorSearch, vectorSearchAll,
  type VectorSearchResult,
} from "../services/embedding-service.js";
import { rrfFuse, boostDualSource, type RankedItem, type FusedResult } from "../services/rrf-fusion.js";

// ═══════════════════════════════════════════════════════════════════════
// LOAD PARAMS FROM ENV
// ═══════════════════════════════════════════════════════════════════════

interface ReasonerParams {
  beamWidth: number;
  maxHops: number;
  hungerFeatures: number;
  hungerModels: number;
  hungerIntegrations: number;
  hungerPatterns: number;
  hungerFlows: number;
  hungerApps: number;
  hungerBonusFeature: number;
  hungerBonusModel: number;
  hungerBonusIntegration: number;
  hungerBonusPattern: number;
  hungerBonusFlow: number;
  hungerBonusApp: number;
  keywordMatchBonus: number;
  modelStructuralBonus: number;
  patternStructuralBonus: number;
  flowStructuralBonus: number;
  complexityBonus: number;
  sameCategoryPenalty: number;
  vectorBoostMultiplier: number;
  synonymCoOccurrenceMin: number;
  synonymMinLength: number;
  synonymMaxPerKeyword: number;
  rrfK: number;
  dualSourceBoost: number;
  maxSeeds: number;
  maxAppSeeds: number;
  universalPatternPercent: number;
}

const DEFAULT_PARAMS: ReasonerParams = {
  beamWidth: 6, maxHops: 5,
  hungerFeatures: 8, hungerModels: 5, hungerIntegrations: 4,
  hungerPatterns: 4, hungerFlows: 3, hungerApps: 3,
  hungerBonusFeature: 3, hungerBonusModel: 3, hungerBonusIntegration: 4,
  hungerBonusPattern: 3, hungerBonusFlow: 5, hungerBonusApp: 5,
  keywordMatchBonus: 2, modelStructuralBonus: 1, patternStructuralBonus: 1,
  flowStructuralBonus: 1, complexityBonus: 1, sameCategoryPenalty: 2,
  vectorBoostMultiplier: 4,
  synonymCoOccurrenceMin: 2, synonymMinLength: 3, synonymMaxPerKeyword: 12,
  rrfK: 60, dualSourceBoost: 1.5, maxSeeds: 14, maxAppSeeds: 8,
  universalPatternPercent: 0.4,
};

const P: ReasonerParams = process.env.AES_REASONER_PARAMS
  ? { ...DEFAULT_PARAMS, ...JSON.parse(process.env.AES_REASONER_PARAMS) }
  : DEFAULT_PARAMS;

// ═══════════════════════════════════════════════════════════════════════
// GRAPH HELPERS (same as unified-graph-reasoner but parameterized)
// ═══════════════════════════════════════════════════════════════════════

let neo4j: ReturnType<typeof getNeo4jService>;
let vectorEnabled = false;

async function q(cypher: string): Promise<any[]> {
  try { return await neo4j.runCypher(cypher); }
  catch { return []; }
}

async function qp(cypher: string, params?: Record<string, any>): Promise<any[]> {
  try { return await neo4j.runCypher(cypher, params); }
  catch { return []; }
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function val(v: any): number {
  return v && typeof v === "object" && "low" in v ? v.low : (typeof v === "number" ? v : 0);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "app", "build", "create", "make", "want",
  "need", "new", "please", "application", "system", "platform", "tool",
  "powered", "based", "using", "open", "source",
]);

function extractKeywords(text: string): string[] {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}

const GENERIC_FEATURES = new Set([
  "utils", "types", "config", "lib", "api", "cache", "logger", "constants",
  "common", "shared", "core", "helpers", "middleware", "server", "client",
  "web", "app", "main", "index", "test", "tests", "scripts", "tools",
  "assets", "styles", "components", "hooks", "decorators",
]);

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

interface GraphNode {
  id: string; label: string; name: string; properties: Record<string, any>;
}

interface GraphEdge {
  type: string; targetNode: GraphNode; score: number; reason: string;
}

interface DomainMatch {
  domain: string; relevance: string; keywords: string[];
}

// ═══════════════════════════════════════════════════════════════════════
// DOMAIN DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════

const DOMAIN_RULES = [
  { domain: "scheduling", triggers: ["booking", "appointment", "schedule", "calendar", "availability", "reservation", "slot", "barber", "salon", "clinic"],
    keywords: ["booking", "appointment", "schedule", "availability", "calendar", "slot", "event-type"] },
  { domain: "payments", triggers: ["payment", "invoice", "billing", "subscription", "checkout", "pricing", "stripe", "pos"],
    keywords: ["payment", "billing", "stripe", "checkout", "credit", "invoice", "subscription"] },
  { domain: "crm", triggers: ["crm", "client", "customer", "contact", "lead", "sales", "relationship"],
    keywords: ["contact", "client", "customer", "lead", "deal", "pipeline", "crm"] },
  { domain: "project_management", triggers: ["project", "task", "issue", "kanban", "sprint", "agile", "board", "ticket"],
    keywords: ["project", "task", "issue", "board", "sprint", "cycle", "module"] },
  { domain: "communication", triggers: ["chat", "message", "notification", "email", "sms", "real-time", "collaboration"],
    keywords: ["chat", "message", "notification", "email", "sms", "channel", "thread"] },
  { domain: "document", triggers: ["document", "signing", "pdf", "contract", "template", "editor", "form"],
    keywords: ["document", "template", "signing", "pdf", "editor", "field", "recipient"] },
  { domain: "ai_ml", triggers: ["ai", "chatbot", "llm", "model", "agent", "prompt", "gpt", "intelligence"],
    keywords: ["agent", "model", "prompt", "chat", "llm", "embedding", "inference"] },
  { domain: "auth", triggers: ["auth", "login", "sso", "rbac", "permission", "role", "security", "2fa"],
    keywords: ["auth", "login", "session", "role", "permission", "oauth", "jwt", "2fa"] },
  { domain: "secrets", triggers: ["secret", "vault", "credential", "key", "token", "encrypt", "infisical"],
    keywords: ["secret", "vault", "credential", "key", "token", "encrypt"] },
];

function identifyDomains(request: string): DomainMatch[] {
  const lower = request.toLowerCase();
  const domains: DomainMatch[] = [];
  for (const rule of DOMAIN_RULES) {
    const hits = rule.triggers.filter(t => lower.includes(t)).length;
    if (hits > 0) {
      domains.push({
        domain: rule.domain,
        relevance: hits >= 2 ? "PRIMARY" : "SUPPORTING",
        keywords: rule.keywords,
      });
    }
  }
  if (!domains.find(d => d.domain === "auth")) {
    domains.push({ domain: "auth", relevance: "UNIVERSAL", keywords: ["auth", "login", "session", "role", "permission"] });
  }
  return domains;
}

// ═══════════════════════════════════════════════════════════════════════
// SYNONYM GENERATION (parameterized)
// ═══════════════════════════════════════════════════════════════════════

async function buildSynonymClusters(keywords: string[]): Promise<Map<string, string[]>> {
  const clusters = new Map<string, string[]>();
  for (const kw of keywords) {
    const lower = kw.toLowerCase();
    const coTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n) WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
      WITH toLower(f.name) AS term, count(DISTINCT a) AS appCount
      WHERE appCount >= ${P.synonymCoOccurrenceMin} AND size(term) >= ${P.synonymMinLength}
      RETURN term ORDER BY appCount DESC LIMIT ${P.synonymMaxPerKeyword}
    `);
    const all = coTerms.map((r: any) => r.term).filter(Boolean);
    clusters.set(kw, [...new Set([kw, ...all])]);
  }
  return clusters;
}

function flattenSynonyms(clusters: Map<string, string[]>): string[] {
  const all = new Set<string>();
  for (const syns of Array.from(clusters.values())) {
    for (const s of syns) {
      if (s.length >= P.synonymMinLength) all.add(s);
    }
  }
  return Array.from(all);
}

// ═══════════════════════════════════════════════════════════════════════
// SEED DISCOVERY (parameterized)
// ═══════════════════════════════════════════════════════════════════════

async function findSeedNodes(request: string, domains: DomainMatch[], expandedKws: string[]): Promise<GraphNode[]> {
  const seeds: GraphNode[] = [];
  const seenIds = new Set<string>();

  function addSeed(node: GraphNode): boolean {
    const key = `${node.label}:${node.id}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    seeds.push(node);
    return true;
  }

  // Strategy A: best app per domain
  const domainToClass: Record<string, string[]> = {
    scheduling: ["scheduling"], payments: ["payments", "billing", "finance"],
    crm: ["crm", "sales"], project_management: ["project_management"],
    communication: ["chat_platform", "communication"], document: ["document"],
    auth: ["auth"], secrets: ["secrets"],
  };

  for (const domain of domains) {
    const classes = domainToClass[domain.domain] || [domain.domain];
    let found = false;
    for (const cls of classes) {
      const apps = await q(`
        MATCH (a:LearnedApp) WHERE toLower(a.app_class) CONTAINS '${esc(cls)}'
        OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
        WITH a, count(f) AS fCount
        RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class, fCount
        ORDER BY fCount DESC LIMIT 1
      `);
      for (const r of apps) {
        found = addSeed({ id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.app_class } });
      }
      if (found) break;
    }
    if (!found) {
      const kwFilter = domain.keywords.slice(0, 5).map(kw => `toLower(f.name) CONTAINS '${esc(kw)}'`).join(" OR ");
      if (kwFilter) {
        const apps = await q(`
          MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) WHERE ${kwFilter}
          WITH a, count(DISTINCT f) AS hits
          RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class, hits
          ORDER BY hits DESC LIMIT 1
        `);
        for (const r of apps) addSeed({ id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.app_class } });
      }
    }
  }

  // Strategy B: direct name matching
  const words = extractKeywords(request);
  for (const w of words) {
    if (seeds.length >= P.maxSeeds) break;
    const apps = await q(`
      MATCH (a:LearnedApp) WHERE toLower(a.name) CONTAINS '${esc(w)}'
      RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class LIMIT 2
    `);
    for (const r of apps) addSeed({ id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.app_class } });
  }

  // Strategy C: keyword feature seeds
  for (const kw of words) {
    if (seeds.length >= P.maxSeeds) break;
    if (GENERIC_FEATURES.has(kw.toLowerCase())) continue;
    const features = await q(`
      MATCH (f:LearnedFeature) WHERE toLower(f.name) CONTAINS '${esc(kw.toLowerCase())}'
      RETURN f.feature_id AS id, f.name AS name LIMIT 2
    `);
    for (const r of features) {
      if (!GENERIC_FEATURES.has(r.name.toLowerCase())) {
        addSeed({ id: r.id, label: "LearnedFeature", name: r.name, properties: {} });
      }
    }
  }

  return seeds;
}

// ═══════════════════════════════════════════════════════════════════════
// EDGE DISCOVERY & SCORING (parameterized)
// ═══════════════════════════════════════════════════════════════════════

async function discoverEdges(node: GraphNode): Promise<GraphEdge[]> {
  const edges: GraphEdge[] = [];

  if (node.label === "LearnedApp") {
    const [features, models, integrations, patterns, flows] = await Promise.all([
      q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_FEATURE]->(f:LearnedFeature)
         RETURN f.feature_id AS id, f.name AS name, f.complexity AS complexity LIMIT 15`),
      q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
         RETURN m.name AS name, m.category AS category LIMIT 15`),
      q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_INTEGRATION]->(i:LearnedIntegration)
         RETURN i.name AS name, i.type AS type LIMIT 15`),
      q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:USES_PATTERN]->(p:LearnedPattern)
         RETURN p.name AS name, p.type AS type LIMIT 15`),
      q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_USER_FLOW]->(f:LearnedUserFlow)
         RETURN f.name AS name LIMIT 10`),
    ]);
    for (const r of features) edges.push({ type: "HAS_FEATURE", targetNode: { id: r.id, label: "LearnedFeature", name: r.name, properties: { complexity: r.complexity } }, score: 0, reason: "" });
    for (const r of models) edges.push({ type: "HAS_DATA_MODEL", targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category } }, score: 0, reason: "" });
    for (const r of integrations) edges.push({ type: "HAS_INTEGRATION", targetNode: { id: r.name, label: "LearnedIntegration", name: r.name, properties: { type: r.type } }, score: 0, reason: "" });
    for (const r of patterns) edges.push({ type: "USES_PATTERN", targetNode: { id: r.name, label: "LearnedPattern", name: r.name, properties: { type: r.type } }, score: 0, reason: "" });
    for (const r of flows) edges.push({ type: "HAS_USER_FLOW", targetNode: { id: r.name, label: "LearnedUserFlow", name: r.name, properties: {} }, score: 0, reason: "" });
  }

  if (node.label === "LearnedFeature") {
    const app = await q(`MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature {feature_id: '${esc(node.id)}'}) RETURN a.source_id AS id, a.name AS name LIMIT 1`);
    if (app.length > 0) edges.push({ type: "BELONGS_TO_APP", targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: {} }, score: 0, reason: "" });
  }

  if (node.label === "LearnedDataModel") {
    const app = await q(`MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel {name: '${esc(node.name)}'}) RETURN a.source_id AS id, a.name AS name LIMIT 1`);
    if (app.length > 0) edges.push({ type: "BELONGS_TO_APP", targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: {} }, score: 0, reason: "" });
    const related = await q(`MATCH (m:LearnedDataModel {name: '${esc(node.name)}'}) MATCH (m2:LearnedDataModel) WHERE m2.category = m.category AND m2.name <> m.name RETURN DISTINCT m2.name AS name, m2.category AS category LIMIT 1`);
    for (const r of related) edges.push({ type: "SAME_CATEGORY", targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category } }, score: 0, reason: "" });
  }

  if (node.label === "LearnedPattern") {
    const apps = await q(`MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern {name: '${esc(node.name)}'}) RETURN a.source_id AS id, a.name AS name LIMIT 3`);
    for (const r of apps) edges.push({ type: "USED_BY_APP", targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: {} }, score: 0, reason: "" });
  }

  if (node.label === "LearnedIntegration") {
    const apps = await q(`MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration {name: '${esc(node.name)}'}) RETURN a.source_id AS id, a.name AS name LIMIT 3`);
    for (const r of apps) edges.push({ type: "USED_BY_APP", targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: {} }, score: 0, reason: "" });
  }

  return edges;
}

function scoreEdges(edges: GraphEdge[], allKeywords: string[], hungerBonus: Map<string, number>): GraphEdge[] {
  for (const edge of edges) {
    let score = 0;
    const target = edge.targetNode;
    const targetText = `${target.name} ${target.properties.category || ""} ${target.properties.type || ""}`.toLowerCase();

    for (const kw of allKeywords) {
      if (kw.length >= P.synonymMinLength && targetText.includes(kw.toLowerCase())) {
        score += P.keywordMatchBonus;
      }
    }

    if (target.label === "LearnedDataModel") score += P.modelStructuralBonus;
    if (target.label === "LearnedPattern") score += P.patternStructuralBonus;
    if (target.label === "LearnedUserFlow") score += P.flowStructuralBonus;
    if (target.properties.complexity === "complex") score += P.complexityBonus;
    if (edge.type === "HAS_DATA_MODEL") score += P.modelStructuralBonus;
    if (edge.type === "HAS_USER_FLOW") score += P.flowStructuralBonus;
    if (edge.type === "USES_PATTERN") score += P.patternStructuralBonus;
    if (edge.type === "SAME_CATEGORY") score -= P.sameCategoryPenalty;

    const bonus = hungerBonus.get(target.label) || 0;
    if (bonus > 0) score += bonus;

    edge.score = Math.max(0, score);
    edge.reason = score > 0 ? "relevant" : "low";
  }
  return edges.sort((a, b) => b.score - a.score);
}

// ═══════════════════════════════════════════════════════════════════════
// BEAM SEARCH (parameterized)
// ═══════════════════════════════════════════════════════════════════════

async function beamSearch(
  request: string, seedNodes: GraphNode[], expandedKeywords: string[],
): Promise<{ discoveredKnowledge: Map<string, Set<string>>; tracedPaths: string[]; hopCount: number }> {
  const discoveredKnowledge = new Map<string, Set<string>>([
    ["features", new Set<string>()], ["models", new Set<string>()],
    ["integrations", new Set<string>()], ["patterns", new Set<string>()],
    ["flows", new Set<string>()], ["apps", new Set<string>()],
  ]);
  const tracedPaths: string[] = [];
  const visited = new Set<string>();
  const seen = new Set<string>();
  let hopCount = 0;

  const appSeeds = seedNodes.filter(s => s.label === "LearnedApp");
  const featureSeeds = seedNodes.filter(s => s.label !== "LearnedApp");
  let currentBeam = [...appSeeds.slice(0, P.maxAppSeeds), ...featureSeeds.slice(0, 2)];
  for (const s of seedNodes) seen.add(`${s.label}:${s.name}`);

  for (let hop = 0; hop < P.maxHops; hop++) {
    const nextBeam: GraphNode[] = [];
    hopCount++;

    const hungerBonus = new Map<string, number>();
    const cats = discoveredKnowledge;
    if (cats.get("features")!.size < P.hungerFeatures) hungerBonus.set("LearnedFeature", P.hungerBonusFeature);
    if (cats.get("models")!.size < P.hungerModels) hungerBonus.set("LearnedDataModel", P.hungerBonusModel);
    if (cats.get("integrations")!.size < P.hungerIntegrations) hungerBonus.set("LearnedIntegration", P.hungerBonusIntegration);
    if (cats.get("patterns")!.size < P.hungerPatterns) hungerBonus.set("LearnedPattern", P.hungerBonusPattern);
    if (cats.get("flows")!.size < P.hungerFlows) hungerBonus.set("LearnedUserFlow", P.hungerBonusFlow);
    if (cats.get("apps")!.size < P.hungerApps) hungerBonus.set("LearnedApp", P.hungerBonusApp);

    for (const node of currentBeam) {
      const nodeKey = `${node.label}:${node.name}`;
      if (visited.has(nodeKey)) continue;
      visited.add(nodeKey);

      // Record discovery
      switch (node.label) {
        case "LearnedApp": cats.get("apps")!.add(node.name); break;
        case "LearnedFeature": cats.get("features")!.add(node.name); break;
        case "LearnedDataModel": cats.get("models")!.add(node.name); break;
        case "LearnedIntegration": cats.get("integrations")!.add(node.name); break;
        case "LearnedPattern": cats.get("patterns")!.add(node.name); break;
        case "LearnedUserFlow": cats.get("flows")!.add(node.name); break;
      }

      const rawEdges = await discoverEdges(node);
      const scoredEdges = scoreEdges(rawEdges, expandedKeywords, hungerBonus);
      const fresh = scoredEdges.filter(e => !seen.has(`${e.targetNode.label}:${e.targetNode.name}`));
      const relevant = fresh.filter(e => e.score > 0);

      // Diversity beam
      const bestEdges: GraphEdge[] = [];
      const seenTypes = new Set<string>();
      for (const e of relevant) {
        if (!seenTypes.has(e.targetNode.label) && bestEdges.length < P.beamWidth) {
          bestEdges.push(e); seenTypes.add(e.targetNode.label);
        }
      }
      for (const e of relevant) {
        if (!bestEdges.includes(e) && bestEdges.length < P.beamWidth) bestEdges.push(e);
      }

      for (const edge of bestEdges) {
        tracedPaths.push(`${nodeKey} →[${edge.type}]→ ${edge.targetNode.label}:${edge.targetNode.name}`);
        seen.add(`${edge.targetNode.label}:${edge.targetNode.name}`);
        nextBeam.push(edge.targetNode);
      }
    }

    if (nextBeam.length === 0) break;

    const uniqueNext: GraphNode[] = [];
    const nextSeen = new Set<string>();
    for (const n of nextBeam) {
      const k = `${n.label}:${n.name}`;
      if (!nextSeen.has(k) && !visited.has(k)) { uniqueNext.push(n); nextSeen.add(k); }
    }
    const nextApps = uniqueNext.filter(n => n.label === "LearnedApp");
    const nextOther = uniqueNext.filter(n => n.label !== "LearnedApp");
    currentBeam = [...nextApps, ...nextOther].slice(0, P.beamWidth * 2);
  }

  return { discoveredKnowledge, tracedPaths, hopCount };
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN — run one query, output JSON
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const query = process.argv[2];
  if (!query) { process.exit(1); }

  neo4j = getNeo4jService();
  await neo4j.connect();

  // Domains
  const domains = identifyDomains(query);

  // Synonyms
  const rawKws = extractKeywords(query);
  const domainKws = domains.flatMap(d => d.keywords);
  const seedKws = [...new Set([...rawKws, ...domainKws])];
  const clusters = await buildSynonymClusters(seedKws.slice(0, 10));
  const expandedKws = flattenSynonyms(clusters);

  // Seeds
  const seeds = await findSeedNodes(query, domains, expandedKws);

  // Beam search
  const { discoveredKnowledge, tracedPaths, hopCount } = await beamSearch(query, seeds, expandedKws);

  // Post-walk sweep for missing categories
  const discoveredApps = Array.from(discoveredKnowledge.get("apps") || []);
  if (discoveredKnowledge.get("flows")!.size < 3 && discoveredApps.length > 0) {
    for (const appName of discoveredApps.slice(0, 3)) {
      const flows = await q(`MATCH (a:LearnedApp)-[:HAS_USER_FLOW]->(f:LearnedUserFlow) WHERE a.name = '${esc(appName)}' RETURN f.name AS name LIMIT 5`);
      for (const r of flows) discoveredKnowledge.get("flows")!.add(r.name);
    }
  }
  if (discoveredKnowledge.get("integrations")!.size < 3 && discoveredApps.length > 0) {
    for (const appName of discoveredApps.slice(0, 3)) {
      const integs = await q(`MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration) WHERE a.name = '${esc(appName)}' RETURN i.name AS name LIMIT 5`);
      for (const r of integs) discoveredKnowledge.get("integrations")!.add(r.name);
    }
  }
  if (discoveredKnowledge.get("patterns")!.size < 3 && discoveredApps.length > 0) {
    for (const appName of discoveredApps.slice(0, 3)) {
      const pats = await q(`MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern) WHERE a.name = '${esc(appName)}' RETURN p.name AS name LIMIT 5`);
      for (const r of pats) discoveredKnowledge.get("patterns")!.add(r.name);
    }
  }

  // Concept confidence
  const conceptScores: { concept: string; confidence: string }[] = [];
  for (const domain of domains) {
    let totalHits = 0;
    let nodeTypesHit = 0;
    for (const kw of domain.keywords.slice(0, 3)) {
      const [f, m, i] = await Promise.all([
        q(`MATCH (f:LearnedFeature) WHERE toLower(f.name) CONTAINS '${esc(kw)}' RETURN count(f) AS c`),
        q(`MATCH (m:LearnedDataModel) WHERE toLower(m.name) CONTAINS '${esc(kw)}' RETURN count(m) AS c`),
        q(`MATCH (i:LearnedIntegration) WHERE toLower(i.name) CONTAINS '${esc(kw)}' RETURN count(i) AS c`),
      ]);
      const fh = f[0] ? val(f[0].c) : 0;
      const mh = m[0] ? val(m[0].c) : 0;
      const ih = i[0] ? val(i[0].c) : 0;
      totalHits += fh + mh + ih;
      if (fh > 0) nodeTypesHit++;
      if (mh > 0) nodeTypesHit++;
      if (ih > 0) nodeTypesHit++;
    }
    let conf = "GAP";
    if (nodeTypesHit >= 3 && totalHits >= 5) conf = "HIGH";
    else if (nodeTypesHit >= 2 && totalHits >= 3) conf = "MEDIUM";
    else if (totalHits >= 1) conf = "LOW";
    conceptScores.push({ concept: domain.domain, confidence: conf });
  }

  // Coverage
  const categories = Array.from(discoveredKnowledge.values());
  const nonEmpty = categories.filter(s => s.size > 0).length;
  const coveragePercent = Math.round((nonEmpty / categories.length) * 100);

  // Output
  const output = {
    coveragePercent,
    discoveredApps: Array.from(discoveredKnowledge.get("apps") || []),
    discoveredFeatures: Array.from(discoveredKnowledge.get("features") || []),
    discoveredModels: Array.from(discoveredKnowledge.get("models") || []),
    discoveredIntegrations: Array.from(discoveredKnowledge.get("integrations") || []),
    discoveredPatterns: Array.from(discoveredKnowledge.get("patterns") || []),
    discoveredFlows: Array.from(discoveredKnowledge.get("flows") || []),
    domainCount: domains.length,
    conceptScores,
    tracedPathCount: tracedPaths.length,
    expandedKeywordCount: expandedKws.length,
    seedCount: seeds.length,
    hopCount,
  };

  await neo4j.close();

  // Print JSON to stdout for the loop to parse
  console.log(JSON.stringify(output));
}

main().catch(() => process.exit(1));
