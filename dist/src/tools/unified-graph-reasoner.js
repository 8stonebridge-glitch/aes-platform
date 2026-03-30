/**
 * unified-graph-reasoner.ts — AES Unified Graph Reasoning Engine
 *
 * Merges three separate tools into one:
 *   1. smart-graph-reader.ts   → auto-synonyms, confidence scoring, cross-app frequency
 *   2. cross-domain-reason.ts  → domain decomposition, best-source-per-domain, composite blueprints
 *   3. think-on-graph.ts       → iterative beam search with hunger-driven exploration
 *
 * Flow:
 *   Step 0: Load AES reasoning rules from graph
 *   Step 1: Decompose request into domains (scheduling, payments, auth, etc.)
 *   Step 2: Auto-generate synonym clusters from graph co-occurrence
 *   Step 3: Domain-aware + synonym-aware seed discovery
 *   Step 4: Hunger-driven beam search with synonym-boosted edge scoring
 *   Step 5: Confidence scoring per concept across all node types
 *   Step 6: Cross-domain composite blueprint with traced paths
 *
 * Usage:
 *   npx tsx src/tools/unified-graph-reasoner.ts "barber shop appointment booking app"
 *   npx tsx src/tools/unified-graph-reasoner.ts "AI-powered invoice management with chat and document signing"
 */
import { getNeo4jService } from "../services/neo4j-service.js";
import { isEmbeddingAvailable, vectorSearch, vectorSearchAll, } from "../services/embedding-service.js";
import { rrfFuse, boostDualSource } from "../services/rrf-fusion.js";
let neo4j;
let vectorEnabled = false;
async function q(cypher) {
    try {
        return await neo4j.runCypher(cypher);
    }
    catch {
        return [];
    }
}
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function val(v) {
    return v && typeof v === "object" && "low" in v ? v.low : (typeof v === "number" ? v : 0);
}
const STOP_WORDS = new Set([
    "the", "and", "for", "with", "app", "build", "create", "make", "want",
    "need", "new", "please", "application", "system", "platform", "tool",
    "powered", "based", "using", "open", "source",
]);
function extractKeywords(text) {
    return text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 0: LOAD REASONING RULES
// ═══════════════════════════════════════════════════════════════════════
async function loadReasoningRules() {
    const rules = await q(`
    MATCH (r:AESReasoningRule)
    RETURN r.title AS title, r.summary AS summary
    ORDER BY r.priority
  `);
    return rules.map((r) => r.title || r.summary);
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 1: CROSS-DOMAIN DECOMPOSITION
// ═══════════════════════════════════════════════════════════════════════
const DOMAIN_RULES = [
    { domain: "scheduling", triggers: ["booking", "appointment", "schedule", "calendar", "availability", "reservation", "slot", "barber", "salon", "clinic"],
        desc: "Time-based booking and scheduling", keywords: ["booking", "appointment", "schedule", "availability", "calendar", "slot", "event-type"] },
    { domain: "payments", triggers: ["payment", "invoice", "billing", "subscription", "checkout", "pricing", "stripe", "pos"],
        desc: "Payment processing and billing", keywords: ["payment", "billing", "stripe", "checkout", "credit", "invoice", "subscription"] },
    { domain: "crm", triggers: ["crm", "client", "customer", "contact", "lead", "sales", "relationship"],
        desc: "Customer relationship management", keywords: ["contact", "client", "customer", "lead", "deal", "pipeline", "crm"] },
    { domain: "project_management", triggers: ["project", "task", "issue", "kanban", "sprint", "agile", "board", "ticket"],
        desc: "Project and task management", keywords: ["project", "task", "issue", "board", "sprint", "cycle", "module"] },
    { domain: "communication", triggers: ["chat", "message", "notification", "email", "sms", "real-time", "collaboration"],
        desc: "Real-time communication and notifications", keywords: ["chat", "message", "notification", "email", "sms", "channel", "thread"] },
    { domain: "document", triggers: ["document", "signing", "pdf", "contract", "template", "editor", "form"],
        desc: "Document management and signing", keywords: ["document", "template", "signing", "pdf", "editor", "field", "recipient"] },
    { domain: "ai_ml", triggers: ["ai", "chatbot", "llm", "model", "agent", "prompt", "gpt", "intelligence"],
        desc: "AI/ML features and integrations", keywords: ["agent", "model", "prompt", "chat", "llm", "embedding", "inference"] },
    { domain: "api_devtools", triggers: ["api", "endpoint", "developer", "testing", "request", "response", "rest", "graphql", "sdk"],
        desc: "API development and testing tools", keywords: ["api", "request", "endpoint", "collection", "environment", "test", "response"] },
    { domain: "analytics", triggers: ["analytics", "dashboard", "report", "metric", "chart", "insight", "tracking"],
        desc: "Analytics and reporting", keywords: ["analytics", "dashboard", "report", "chart", "metric", "insight", "tracking"] },
    { domain: "auth", triggers: ["auth", "login", "sso", "rbac", "permission", "role", "security", "2fa"],
        desc: "Authentication and authorization", keywords: ["auth", "login", "session", "role", "permission", "oauth", "jwt", "2fa"] },
    { domain: "forms_survey", triggers: ["form", "survey", "quiz", "feedback", "poll", "response"],
        desc: "Forms and survey collection", keywords: ["form", "survey", "response", "question", "submission", "field"] },
    { domain: "automation", triggers: ["workflow", "automation", "trigger", "cron", "queue", "job", "pipeline"],
        desc: "Workflow automation and job scheduling", keywords: ["workflow", "trigger", "job", "queue", "cron", "automation", "run"] },
    { domain: "secrets", triggers: ["secret", "vault", "credential", "key", "token", "encrypt", "infisical"],
        desc: "Secrets and credential management", keywords: ["secret", "vault", "credential", "key", "token", "encrypt"] },
];
function identifyDomains(request) {
    const lower = request.toLowerCase();
    const domains = [];
    for (const rule of DOMAIN_RULES) {
        const matchCount = rule.triggers.filter(t => lower.includes(t)).length;
        if (matchCount > 0) {
            domains.push({
                domain: rule.domain,
                relevance: matchCount >= 2 ? "PRIMARY" : "SUPPORTING",
                description: rule.desc,
                keywords: rule.keywords,
            });
        }
    }
    // Auth is always universal
    if (!domains.find(d => d.domain === "auth")) {
        domains.push({ domain: "auth", relevance: "UNIVERSAL", description: "Authentication and authorization",
            keywords: ["auth", "login", "session", "role", "permission", "oauth", "jwt"] });
    }
    // Analytics is always supporting
    if (!domains.find(d => d.domain === "analytics")) {
        domains.push({ domain: "analytics", relevance: "SUPPORTING", description: "Analytics and reporting",
            keywords: ["analytics", "dashboard", "report"] });
    }
    return domains;
}
async function findBestSourceForDomain(domain) {
    const appScores = await q(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
      WHERE ${domain.keywords.map(kw => `toLower(f.name) CONTAINS '${esc(kw)}'`).join(" OR ")}
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
      WHERE ${domain.keywords.map(kw => `toLower(m.name) CONTAINS '${esc(kw)}'`).join(" OR ")}
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
      WHERE ${domain.keywords.map(kw => `toLower(i.name) CONTAINS '${esc(kw)}'`).join(" OR ")}
    RETURN a.name AS app, a.app_class AS appClass,
           count(DISTINCT f) AS fHits, count(DISTINCT m) AS mHits, count(DISTINCT i) AS iHits,
           collect(DISTINCT f.name) AS features,
           collect(DISTINCT m.name) AS models,
           collect(DISTINCT i.name) AS integrations
    ORDER BY count(DISTINCT f) + count(DISTINCT m) + count(DISTINCT i) DESC
    LIMIT 5
  `);
    if (appScores.length === 0) {
        return { domain: domain.domain, bestApp: "NONE", appClass: "", score: 0,
            matchedFeatures: [], matchedModels: [], matchedIntegrations: [], alternateApps: [] };
    }
    const best = appScores[0];
    return {
        domain: domain.domain,
        bestApp: best.app,
        appClass: best.appClass || "",
        score: val(best.fHits) + val(best.mHits) + val(best.iHits),
        matchedFeatures: (best.features || []).slice(0, 8),
        matchedModels: (best.models || []).slice(0, 8),
        matchedIntegrations: (best.integrations || []).slice(0, 6),
        alternateApps: appScores.slice(1).map((r) => r.app),
    };
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 2: AUTO-SYNONYM GENERATION FROM GRAPH
// ═══════════════════════════════════════════════════════════════════════
async function buildSynonymClusters(keywords) {
    const clusters = new Map();
    for (const kw of keywords) {
        const lower = kw.toLowerCase();
        // FIX 2: Only keep co-occurring terms that appear in 2+ apps alongside this keyword.
        // This filters out noise like "timezone buddy" co-occurring with "booking" in just Cal.com.
        const coTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
      WITH toLower(f.name) AS term, count(DISTINCT a) AS appCount
      WHERE appCount >= 2 AND size(term) >= 3
      RETURN term
      ORDER BY appCount DESC
      LIMIT 12
    `);
        const modelTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
      WITH toLower(m.name) AS term, count(DISTINCT a) AS appCount
      WHERE appCount >= 2 AND size(term) >= 3
      RETURN term
      ORDER BY appCount DESC
      LIMIT 12
    `);
        const integTerms = await q(`
      MATCH (a:LearnedApp)-[]->(n)
      WHERE toLower(n.name) CONTAINS '${esc(lower)}'
      WITH a
      MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
      WITH toLower(i.name) AS term, count(DISTINCT a) AS appCount
      WHERE appCount >= 2 AND size(term) >= 3
      RETURN term
      ORDER BY appCount DESC
      LIMIT 8
    `);
        const all = [
            ...coTerms.map((r) => r.term),
            ...modelTerms.map((r) => r.term),
            ...integTerms.map((r) => r.term),
        ].filter(Boolean);
        clusters.set(kw, [...new Set([kw, ...all])]);
    }
    return clusters;
}
function flattenSynonyms(clusters) {
    const all = new Set();
    for (const syns of clusters.values()) {
        for (const s of syns) {
            // FIX 1: Filter out short/noisy terms — must be 3+ chars
            if (s.length >= 3)
                all.add(s);
        }
    }
    return Array.from(all);
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 2b: HYBRID KEYWORD + VECTOR SEARCH (RRF)
// ═══════════════════════════════════════════════════════════════════════
/** Parameterized Cypher runner for vectorSearch */
async function qp(cypher, params) {
    try {
        return await neo4j.runCypher(cypher, params);
    }
    catch {
        return [];
    }
}
/**
 * Hybrid search: runs keyword (Cypher CONTAINS) and vector (cosine similarity)
 * in parallel, then fuses with RRF. Returns ranked items combining both signals.
 */
async function hybridSearch(queryText, keywords, nodeType, topK = 10) {
    // Build keyword Cypher based on node type
    const kwFilter = keywords
        .filter(kw => kw.length >= 3)
        .slice(0, 8)
        .map(kw => `toLower(n.name) CONTAINS '${esc(kw.toLowerCase())}'`)
        .join(" OR ");
    if (!kwFilter)
        return [];
    const labelToIdField = {
        LearnedFeature: "feature_id",
        LearnedDataModel: "name",
        LearnedIntegration: "name",
        LearnedPattern: "name",
        LearnedUserFlow: "name",
    };
    const idField = labelToIdField[nodeType] || "name";
    // Run keyword and vector in parallel
    const [keywordRows, vectorResults] = await Promise.all([
        q(`
      MATCH (n:${nodeType})
      WHERE ${kwFilter}
      RETURN n.${idField} AS id, n.name AS name, properties(n) AS props
      LIMIT ${topK * 2}
    `),
        vectorEnabled
            ? vectorSearch(queryText, nodeType, topK, qp)
            : Promise.resolve([]),
    ]);
    // Convert to RankedItem format
    const keywordRanked = keywordRows.map((r) => ({
        id: r.id || r.name,
        name: r.name,
        label: nodeType,
        properties: r.props || {},
    }));
    const vectorRanked = vectorResults.map(r => ({
        id: r.id,
        name: r.name,
        label: r.label,
        properties: r.properties,
    }));
    // Fuse with RRF and boost dual-source hits
    const fused = rrfFuse(keywordRanked, vectorRanked);
    return boostDualSource(fused);
}
/**
 * Hybrid search across ALL node types. Returns top results per type.
 */
async function hybridSearchAll(queryText, keywords, topKPerType = 8) {
    const types = [
        "LearnedFeature", "LearnedDataModel", "LearnedIntegration",
        "LearnedPattern", "LearnedUserFlow",
    ];
    const resultMap = new Map();
    const searchPromises = [];
    for (const t of types) {
        searchPromises.push(hybridSearch(queryText, keywords, t, topKPerType).then(results => {
            resultMap.set(t, results);
        }));
    }
    await Promise.all(searchPromises);
    return resultMap;
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 3: DOMAIN-AWARE + SYNONYM-AWARE SEED DISCOVERY
// ═══════════════════════════════════════════════════════════════════════
// Generic feature names that should never be seeds — they match everywhere and teach nothing
const GENERIC_FEATURES = new Set([
    "utils", "types", "config", "lib", "api", "cache", "logger", "constants",
    "common", "shared", "core", "helpers", "middleware", "server", "client",
    "web", "app", "main", "index", "test", "tests", "scripts", "tools",
    "assets", "styles", "components", "hooks", "decorators",
]);
async function findSeedNodes(request, domains, expandedKeywords) {
    const words = extractKeywords(request);
    const seeds = [];
    const seenIds = new Set();
    function addSeed(node) {
        const key = `${node.label}:${node.id}`;
        if (seenIds.has(key))
            return false;
        seenIds.add(key);
        seeds.push(node);
        return true;
    }
    // STRATEGY A: Find best app per domain — ALL domains, not just PRIMARY.
    // This is the most important seeding strategy. Each domain gets its richest app.
    const domainToClass = {
        scheduling: ["scheduling"],
        payments: ["payments", "billing", "finance"],
        crm: ["crm", "sales"],
        project_management: ["project_management"],
        communication: ["chat_platform", "communication"],
        document: ["document"],
        ai_ml: ["marketplace", "ai"],
        api_devtools: ["api", "devtools"],
        analytics: ["analytics"],
        auth: ["auth"],
        forms_survey: ["forms", "survey"],
        automation: ["automation"],
        secrets: ["secrets"],
    };
    // Also use domain keyword matching as fallback when app_class doesn't match
    for (const domain of domains) {
        const classes = domainToClass[domain.domain] || [domain.domain];
        // Try by app_class first
        let found = false;
        for (const cls of classes) {
            const apps = await q(`
        MATCH (a:LearnedApp)
        WHERE toLower(a.app_class) CONTAINS '${esc(cls)}'
        OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
        WITH a, count(f) AS fCount
        RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class, fCount
        ORDER BY fCount DESC LIMIT 1
      `);
            for (const r of apps) {
                found = addSeed({ id: r.id, label: "LearnedApp", name: r.name,
                    properties: { app_class: r.app_class, feature_count: val(r.fCount), source: `domain:${domain.domain}` } });
            }
            if (found)
                break;
        }
        // Fallback: find app with most keyword hits for this domain
        if (!found) {
            const kwFilter = domain.keywords.slice(0, 5).map(kw => `toLower(f.name) CONTAINS '${esc(kw)}'`).join(" OR ");
            const apps = await q(`
        MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
        WHERE ${kwFilter}
        WITH a, count(DISTINCT f) AS hits
        RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class, hits
        ORDER BY hits DESC LIMIT 1
      `);
            for (const r of apps) {
                addSeed({ id: r.id, label: "LearnedApp", name: r.name,
                    properties: { app_class: r.app_class, source: `domain-kw:${domain.domain}` } });
            }
        }
    }
    // STRATEGY B: Direct name matching on apps
    for (const w of words) {
        if (seeds.length >= 10)
            break;
        const apps = await q(`
      MATCH (a:LearnedApp)
      WHERE toLower(a.name) CONTAINS '${esc(w)}'
      RETURN a.source_id AS id, a.name AS name, a.app_class AS app_class
      LIMIT 2
    `);
        for (const r of apps) {
            addSeed({ id: r.id, label: "LearnedApp", name: r.name,
                properties: { app_class: r.app_class, source: `name:${w}` } });
        }
    }
    // STRATEGY C: Synonym-based feature seeds — ONLY domain-relevant features, not generic ones
    const rawWords = extractKeywords(request);
    for (const kw of rawWords) {
        if (seeds.length >= 12)
            break;
        // Skip if it's a generic term
        if (GENERIC_FEATURES.has(kw.toLowerCase()))
            continue;
        const features = await q(`
      MATCH (f:LearnedFeature)
      WHERE toLower(f.name) CONTAINS '${esc(kw.toLowerCase())}'
        AND NOT toLower(f.name) IN ['utils', 'types', 'config', 'lib', 'api', 'cache', 'logger', 'core', 'web', 'app']
      RETURN f.feature_id AS id, f.name AS name, f.complexity AS complexity, f.description AS desc
      LIMIT 2
    `);
        for (const r of features) {
            // Skip generic single-word features
            if (GENERIC_FEATURES.has(r.name.toLowerCase()))
                continue;
            addSeed({ id: r.id, label: "LearnedFeature", name: r.name,
                properties: { complexity: r.complexity, description: r.desc, source: `keyword:${kw}` } });
        }
    }
    // STRATEGY D: Hybrid RRF seeds — vector similarity catches semantic matches
    // that keyword matching misses (e.g. "scheduling" → "availability-management")
    if (vectorEnabled && seeds.length < 12) {
        const hybridResults = await hybridSearchAll(request, expandedKeywords.slice(0, 10), 5);
        const hybridTypes = ["LearnedFeature", "LearnedDataModel", "LearnedIntegration", "LearnedPattern", "LearnedUserFlow"];
        for (const nodeType of hybridTypes) {
            const results = hybridResults.get(nodeType) || [];
            for (const r of results) {
                if (seeds.length >= 14)
                    break;
                // Only add if it's a genuinely new seed found by vector (not already keyword-seeded)
                if (r.sources.includes("vector") && !GENERIC_FEATURES.has(r.name.toLowerCase())) {
                    addSeed({
                        id: r.id,
                        label: nodeType,
                        name: r.name,
                        properties: {
                            ...r.properties,
                            source: `hybrid-rrf:${r.sources.join("+")}`,
                            rrfScore: r.rrfScore,
                        },
                    });
                }
            }
        }
    }
    return seeds;
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 4: THINK-ON-GRAPH BEAM SEARCH (with synonyms + hunger)
// ═══════════════════════════════════════════════════════════════════════
async function discoverEdges(node) {
    const edges = [];
    if (node.label === "LearnedApp") {
        const [features, models, integrations, patterns, flows] = await Promise.all([
            q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_FEATURE]->(f:LearnedFeature)
         RETURN f.feature_id AS id, f.name AS name, f.complexity AS complexity, f.description AS desc, f.file_count AS fc
         ORDER BY f.file_count DESC LIMIT 15`),
            q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
         RETURN m.name AS name, m.category AS category, m.field_count AS fc, m.fields_csv AS fields
         ORDER BY m.field_count DESC LIMIT 15`),
            q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_INTEGRATION]->(i:LearnedIntegration)
         RETURN i.name AS name, i.type AS type, i.provider AS provider, i.auth_method AS auth
         LIMIT 15`),
            q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:USES_PATTERN]->(p:LearnedPattern)
         RETURN p.name AS name, p.type AS type, p.description AS desc
         LIMIT 15`),
            q(`MATCH (a:LearnedApp {source_id: '${esc(node.id)}'})-[:HAS_USER_FLOW]->(f:LearnedUserFlow)
         RETURN f.name AS name, f.steps_description AS steps, f.step_count AS stepCount
         LIMIT 10`),
        ]);
        for (const r of features)
            edges.push({ type: "HAS_FEATURE", targetNode: { id: r.id, label: "LearnedFeature", name: r.name, properties: { complexity: r.complexity, description: r.desc } }, score: 0, reason: "" });
        for (const r of models)
            edges.push({ type: "HAS_DATA_MODEL", targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category, fields: r.fields } }, score: 0, reason: "" });
        for (const r of integrations)
            edges.push({ type: "HAS_INTEGRATION", targetNode: { id: r.name, label: "LearnedIntegration", name: r.name, properties: { type: r.type, provider: r.provider, auth_method: r.auth } }, score: 0, reason: "" });
        for (const r of patterns)
            edges.push({ type: "USES_PATTERN", targetNode: { id: r.name, label: "LearnedPattern", name: r.name, properties: { type: r.type, description: r.desc } }, score: 0, reason: "" });
        for (const r of flows)
            edges.push({ type: "HAS_USER_FLOW", targetNode: { id: r.name, label: "LearnedUserFlow", name: r.name, properties: { steps: r.steps, step_count: r.stepCount } }, score: 0, reason: "" });
    }
    if (node.label === "LearnedFeature") {
        const app = await q(`
      MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature {feature_id: '${esc(node.id)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass LIMIT 1
    `);
        if (app.length > 0) {
            edges.push({ type: "BELONGS_TO_APP", targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: { app_class: app[0].appClass } }, score: 0, reason: "" });
        }
    }
    if (node.label === "LearnedDataModel") {
        const app = await q(`
      MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass LIMIT 1
    `);
        if (app.length > 0) {
            edges.push({ type: "BELONGS_TO_APP", targetNode: { id: app[0].id, label: "LearnedApp", name: app[0].name, properties: { app_class: app[0].appClass } }, score: 0, reason: "" });
        }
        // FIX 3: Cap SAME_CATEGORY to 1 per hop — prevents model cluster loops
        // (CalendarCacheEvent → TaskEvent → TaskEventPartitioned was wasting hops)
        const related = await q(`
      MATCH (m:LearnedDataModel {name: '${esc(node.name)}'})
      MATCH (m2:LearnedDataModel) WHERE m2.category = m.category AND m2.name <> m.name
      RETURN DISTINCT m2.name AS name, m2.category AS category, m2.field_count AS fc
      ORDER BY m2.field_count DESC LIMIT 1
    `);
        for (const r of related)
            edges.push({ type: "SAME_CATEGORY", targetNode: { id: r.name, label: "LearnedDataModel", name: r.name, properties: { category: r.category } }, score: 0, reason: "" });
    }
    if (node.label === "LearnedPattern") {
        const apps = await q(`
      MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass LIMIT 3
    `);
        for (const r of apps)
            edges.push({ type: "USED_BY_APP", targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.appClass } }, score: 0, reason: "" });
    }
    if (node.label === "LearnedIntegration") {
        const apps = await q(`
      MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration {name: '${esc(node.name)}'})
      RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass LIMIT 3
    `);
        for (const r of apps)
            edges.push({ type: "USED_BY_APP", targetNode: { id: r.id, label: "LearnedApp", name: r.name, properties: { app_class: r.appClass } }, score: 0, reason: "" });
    }
    return edges;
}
let llmScorer = null;
/** Call this to enable LLM-based edge re-ranking in the beam search */
export function setLLMScorer(scorer) {
    llmScorer = scorer;
}
// Vector similarity cache — populated once per beam search run by querying
// the vector index with the request text. Edges whose targets appear in this
// cache get a bonus proportional to their cosine similarity.
let vectorSimCache = new Map();
async function warmVectorCache(request) {
    if (!vectorEnabled)
        return;
    vectorSimCache.clear();
    try {
        const results = await vectorSearchAll(request, 20, qp);
        for (const r of results) {
            const key = `${r.label}:${r.name}`;
            vectorSimCache.set(key, r.score);
        }
    }
    catch {
        // Graceful — vector search is optional
    }
}
function scoreEdges(edges, allKeywords, hungerBonus) {
    for (const edge of edges) {
        let score = 0;
        const target = edge.targetNode;
        const targetText = `${target.name} ${target.properties.description || ""} ${target.properties.category || ""} ${target.properties.type || ""} ${target.properties.fields || ""}`.toLowerCase();
        // Score against ALL expanded keywords (synonyms included)
        // FIX 1: only match keywords 3+ chars to avoid "d", "a" pollution
        const matchedKws = [];
        for (const kw of allKeywords) {
            const kwLower = kw.toLowerCase();
            if (kwLower.length >= 3 && targetText.includes(kwLower)) {
                score += 2;
                matchedKws.push(kw);
            }
        }
        // Structural bonuses
        if (target.label === "LearnedDataModel")
            score += 1;
        if (target.label === "LearnedPattern")
            score += 1;
        if (target.label === "LearnedUserFlow")
            score += 1;
        if (target.properties.complexity === "complex")
            score += 1;
        if (edge.type === "HAS_DATA_MODEL")
            score += 1;
        if (edge.type === "HAS_USER_FLOW")
            score += 1;
        if (edge.type === "USES_PATTERN")
            score += 1;
        // FIX 3b: Penalize SAME_CATEGORY edges — useful for diversity but shouldn't dominate
        if (edge.type === "SAME_CATEGORY")
            score -= 2;
        // HUNGER BONUS — edges leading to under-explored categories score higher
        const bonus = hungerBonus.get(target.label) || 0;
        if (bonus > 0) {
            score += bonus;
        }
        // VECTOR SIMILARITY BONUS — if this target was found by vector search,
        // add a bonus proportional to cosine similarity (0-1 range → 0-4 bonus).
        // This catches semantic matches that keyword matching misses entirely.
        const targetKey = `${target.label}:${target.name}`;
        const vecSim = vectorSimCache.get(targetKey) || 0;
        let vecBonus = 0;
        if (vecSim > 0) {
            vecBonus = Math.round(vecSim * 4); // 0.9 sim → +4, 0.5 sim → +2
            score += vecBonus;
        }
        edge.score = Math.max(0, score);
        const parts = [];
        if (matchedKws.length > 0)
            parts.push(`kw: ${matchedKws.slice(0, 3).join(", ")}`);
        if (vecBonus > 0)
            parts.push(`vec: +${vecBonus}`);
        if (bonus > 0)
            parts.push(`hunger: +${bonus}`);
        edge.reason = parts.length > 0
            ? parts.join(" | ")
            : score > 0
                ? `structural (${target.label})`
                : "low relevance";
    }
    return edges.sort((a, b) => b.score - a.score);
}
/**
 * FIX 6: LLM re-ranking pass — applied after heuristic scoring on the top candidates.
 * Only called when llmScorer is set. Re-ranks the top-K edges using semantic understanding.
 */
async function maybeReRankWithLLM(request, edges) {
    if (!llmScorer || edges.length === 0)
        return edges;
    // Only send top candidates to LLM to save tokens
    const topK = edges.slice(0, 8);
    const rest = edges.slice(8);
    const reRanked = await llmScorer(request, topK);
    return [...reRanked, ...rest];
}
function recordDiscovery(knowledge, node) {
    switch (node.label) {
        case "LearnedApp":
            knowledge.get("apps").add(node.name);
            break;
        case "LearnedFeature":
            knowledge.get("features").add(node.name);
            break;
        case "LearnedDataModel":
            knowledge.get("models").add(`${node.name} (${node.properties.category || "general"})`);
            break;
        case "LearnedIntegration":
            knowledge.get("integrations").add(`${node.name} [${node.properties.type || "other"}]`);
            break;
        case "LearnedPattern":
            knowledge.get("patterns").add(`${node.name} [${node.properties.type || "unknown"}]`);
            break;
        case "LearnedUserFlow":
            knowledge.get("flows").add(node.name);
            break;
    }
}
async function beamSearch(request, seedNodes, expandedKeywords, maxHops, beamWidth) {
    // Warm the vector similarity cache ONCE before beam search starts.
    // This pre-computes cosine similarity for the top-20 nodes per type,
    // so scoreEdges() can add vector bonuses without per-edge API calls.
    await warmVectorCache(request);
    const hops = [];
    const discoveredKnowledge = new Map([
        ["features", new Set()],
        ["models", new Set()],
        ["integrations", new Set()],
        ["patterns", new Set()],
        ["flows", new Set()],
        ["apps", new Set()],
    ]);
    const tracedPaths = [];
    const visited = new Set();
    const seen = new Set();
    // Start with ALL app seeds — apps are the most valuable starting points.
    // Feature seeds go into a secondary queue explored after apps.
    const appSeeds = seedNodes.filter(s => s.label === "LearnedApp");
    const featureSeeds = seedNodes.filter(s => s.label !== "LearnedApp");
    let currentBeam = [...appSeeds.slice(0, beamWidth + 2), ...featureSeeds.slice(0, 2)];
    for (const s of seedNodes)
        seen.add(`${s.label}:${s.name}`);
    for (let hop = 0; hop < maxHops; hop++) {
        const nextBeam = [];
        // HUNGER CHECK — raised thresholds. 3 features is nothing, we want 8+.
        const hungerBonus = new Map();
        const cats = discoveredKnowledge;
        if (cats.get("features").size < 8)
            hungerBonus.set("LearnedFeature", 3);
        if (cats.get("models").size < 5)
            hungerBonus.set("LearnedDataModel", 3);
        if (cats.get("integrations").size < 4)
            hungerBonus.set("LearnedIntegration", 4);
        if (cats.get("patterns").size < 4)
            hungerBonus.set("LearnedPattern", 3);
        if (cats.get("flows").size < 3)
            hungerBonus.set("LearnedUserFlow", 5);
        // Apps are the most valuable — each one opens 50+ edges.
        // Keep hungry for apps until we've explored enough.
        if (cats.get("apps").size < 3)
            hungerBonus.set("LearnedApp", 5);
        for (const node of currentBeam) {
            const nodeKey = `${node.label}:${node.name}`;
            if (visited.has(nodeKey))
                continue;
            visited.add(nodeKey);
            recordDiscovery(discoveredKnowledge, node);
            const rawEdges = await discoverEdges(node);
            let scoredEdges = scoreEdges(rawEdges, expandedKeywords, hungerBonus);
            // FIX 6: Optional LLM re-ranking of top candidates
            scoredEdges = await maybeReRankWithLLM(request, scoredEdges);
            // Filter already-seen targets (loop prevention)
            const fresh = scoredEdges.filter(e => !seen.has(`${e.targetNode.label}:${e.targetNode.name}`));
            const relevant = fresh.filter(e => e.score > 0);
            // DIVERSITY BEAM — one per node type first, then fill
            const bestEdges = [];
            const seenTypes = new Set();
            for (const e of relevant) {
                if (!seenTypes.has(e.targetNode.label) && bestEdges.length < beamWidth) {
                    bestEdges.push(e);
                    seenTypes.add(e.targetNode.label);
                }
            }
            for (const e of relevant) {
                if (!bestEdges.includes(e) && bestEdges.length < beamWidth) {
                    bestEdges.push(e);
                }
            }
            hops.push({
                hop: hop + 1,
                fromNode: nodeKey,
                edges: scoredEdges.slice(0, 8),
                bestEdges,
                reasoning: bestEdges.length > 0
                    ? `${scoredEdges.length} edges, ${fresh.length} fresh, ${bestEdges.length} selected. Hunger: [${Array.from(hungerBonus.entries()).map(([k, v]) => `${k.replace("Learned", "")}+${v}`).join(", ")}]`
                    : `${scoredEdges.length} edges, ${fresh.length} fresh. Dead end.`,
                path: `${nodeKey}${bestEdges[0] ? ` →[${bestEdges[0].type}]→ ${bestEdges[0].targetNode.label}:${bestEdges[0].targetNode.name}` : ""}`,
            });
            for (const edge of bestEdges) {
                tracedPaths.push(`${nodeKey} →[${edge.type}]→ ${edge.targetNode.label}:${edge.targetNode.name}`);
                seen.add(`${edge.targetNode.label}:${edge.targetNode.name}`);
                nextBeam.push(edge.targetNode);
            }
        }
        if (nextBeam.length === 0)
            break;
        // Deduplicate next beam
        const uniqueNext = [];
        const nextSeen = new Set();
        for (const n of nextBeam) {
            const k = `${n.label}:${n.name}`;
            if (!nextSeen.has(k) && !visited.has(k)) {
                uniqueNext.push(n);
                nextSeen.add(k);
            }
        }
        // Prioritize app nodes in next beam — they open the most edges
        const nextApps = uniqueNext.filter(n => n.label === "LearnedApp");
        const nextOther = uniqueNext.filter(n => n.label !== "LearnedApp");
        currentBeam = [...nextApps, ...nextOther].slice(0, beamWidth * 2);
    }
    return { hops, discoveredKnowledge, tracedPaths };
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 5: CONFIDENCE SCORING
// ═══════════════════════════════════════════════════════════════════════
async function scoreConceptConfidence(concept, keywords) {
    const score = {
        concept,
        featureHits: 0, modelHits: 0, integrationHits: 0,
        patternHits: 0, flowHits: 0, pageHits: 0,
        totalHits: 0, nodeTypesHit: 0,
        confidence: "GAP",
        evidence: [],
    };
    for (const kw of keywords) {
        const lower = kw.toLowerCase();
        const [features, models, integrations, patterns, flows, pages] = await Promise.all([
            q(`MATCH (f:LearnedFeature) WHERE toLower(f.name) CONTAINS '${esc(lower)}' RETURN f.name AS n LIMIT 5`),
            q(`MATCH (m:LearnedDataModel) WHERE toLower(m.name) CONTAINS '${esc(lower)}' RETURN DISTINCT m.name AS n LIMIT 5`),
            q(`MATCH (i:LearnedIntegration) WHERE toLower(i.name) CONTAINS '${esc(lower)}' RETURN DISTINCT i.name AS n LIMIT 3`),
            q(`MATCH (p:LearnedPattern) WHERE toLower(p.name) CONTAINS '${esc(lower)}' OR toLower(p.description) CONTAINS '${esc(lower)}' RETURN DISTINCT p.name AS n LIMIT 3`),
            q(`MATCH (f:LearnedUserFlow) WHERE toLower(f.name) CONTAINS '${esc(lower)}' RETURN f.name AS n LIMIT 3`),
            q(`MATCH (p:LearnedPageSection) WHERE toLower(p.name) CONTAINS '${esc(lower)}' RETURN p.name AS n LIMIT 3`),
        ]);
        score.featureHits += features.length;
        score.modelHits += models.length;
        score.integrationHits += integrations.length;
        score.patternHits += patterns.length;
        score.flowHits += flows.length;
        score.pageHits += pages.length;
        features.forEach((r) => score.evidence.push(`Feature:${r.n}`));
        models.forEach((r) => score.evidence.push(`Model:${r.n}`));
        integrations.forEach((r) => score.evidence.push(`Integration:${r.n}`));
        patterns.forEach((r) => score.evidence.push(`Pattern:${r.n}`));
        flows.forEach((r) => score.evidence.push(`Flow:${r.n}`));
        pages.forEach((r) => score.evidence.push(`Page:${r.n}`));
    }
    score.totalHits = score.featureHits + score.modelHits + score.integrationHits +
        score.patternHits + score.flowHits + score.pageHits;
    score.nodeTypesHit = [score.featureHits, score.modelHits, score.integrationHits,
        score.patternHits, score.flowHits, score.pageHits].filter(n => n > 0).length;
    score.evidence = [...new Set(score.evidence)].slice(0, 10);
    if (score.nodeTypesHit >= 3 && score.totalHits >= 5)
        score.confidence = "HIGH";
    else if (score.nodeTypesHit >= 2 && score.totalHits >= 3)
        score.confidence = "MEDIUM";
    else if (score.totalHits >= 1)
        score.confidence = "LOW";
    return score;
}
// ═══════════════════════════════════════════════════════════════════════
// STEP 6: UNIVERSAL PATTERNS
// ═══════════════════════════════════════════════════════════════════════
async function findUniversalPatterns() {
    const patterns = await q(`
    MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern)
    WITH p.name AS name, p.type AS type, count(DISTINCT a) AS appCount
    MATCH (total:LearnedApp)
    WITH name, type, appCount, count(DISTINCT total) AS totalApps
    WHERE appCount >= totalApps * 0.4
    RETURN name, type, appCount, totalApps
    ORDER BY appCount DESC
  `);
    return patterns.map((r) => ({
        name: r.name, type: r.type,
        percentage: Math.round((val(r.appCount) / val(r.totalApps)) * 100),
    }));
}
// ═══════════════════════════════════════════════════════════════════════
// MAIN: UNIFIED REASONING ENGINE
// ═══════════════════════════════════════════════════════════════════════
async function unifiedReason(request) {
    const result = {
        request,
        rulesLoaded: [],
        domains: [],
        domainSources: [],
        synonymClusters: new Map(),
        expandedKeywords: [],
        seedNodes: [],
        hops: [],
        discoveredKnowledge: new Map(),
        tracedPaths: [],
        conceptScores: [],
        universalPatterns: [],
        hybridSeedCount: 0,
        vectorCacheSize: 0,
        coveragePercent: 0,
        gaps: [],
        blueprint: [],
    };
    // ── Step 0: Load reasoning rules ──
    result.rulesLoaded = await loadReasoningRules();
    // ── Step 1: Cross-domain decomposition ──
    result.domains = identifyDomains(request);
    // ── Step 2: Auto-synonym generation from graph ──
    const rawKeywords = extractKeywords(request);
    // Also include domain-specific keywords from identified domains
    const domainKws = result.domains.flatMap(d => d.keywords);
    const seedKeywords = [...new Set([...rawKeywords, ...domainKws])];
    result.synonymClusters = await buildSynonymClusters(seedKeywords.slice(0, 10));
    result.expandedKeywords = flattenSynonyms(result.synonymClusters);
    // ── Step 3: Domain-aware + synonym-aware seed discovery ──
    result.seedNodes = await findSeedNodes(request, result.domains, result.expandedKeywords);
    // ── Step 4: Hunger-driven beam search with synonym scoring ──
    // Wider beam (6) and more hops (5) for richer multi-app exploration
    const searchResult = await beamSearch(request, result.seedNodes, result.expandedKeywords, 5, 6);
    result.hops = searchResult.hops;
    result.discoveredKnowledge = searchResult.discoveredKnowledge;
    result.tracedPaths = searchResult.tracedPaths;
    // Record hybrid search stats
    result.hybridSeedCount = result.seedNodes.filter(s => s.properties.source?.startsWith("hybrid-rrf")).length;
    result.vectorCacheSize = vectorSimCache.size;
    // Post-walk sweep — if beam search missed any category,
    // do targeted queries using the apps we already discovered
    const discoveredApps = Array.from(result.discoveredKnowledge.get("apps") || []);
    // Sweep features — grab domain-relevant features from discovered apps
    if (result.discoveredKnowledge.get("features").size < 8 && discoveredApps.length > 0) {
        const domainKws = result.domains.flatMap(d => d.keywords).slice(0, 10);
        const kwFilter = domainKws.map(kw => `toLower(f.name) CONTAINS '${esc(kw)}'`).join(" OR ");
        for (const appName of discoveredApps.slice(0, 5)) {
            const features = await q(`
        MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
        WHERE a.name = '${esc(appName)}' AND (${kwFilter})
        RETURN f.name AS name LIMIT 8
      `);
            for (const r of features) {
                if (!GENERIC_FEATURES.has(r.name.toLowerCase())) {
                    result.discoveredKnowledge.get("features").add(r.name);
                    result.tracedPaths.push(`LearnedApp:${appName} →[HAS_FEATURE]→ LearnedFeature:${r.name} (sweep)`);
                }
            }
        }
    }
    // Sweep flows
    if (result.discoveredKnowledge.get("flows").size < 3 && discoveredApps.length > 0) {
        for (const appName of discoveredApps.slice(0, 3)) {
            const flows = await q(`
        MATCH (a:LearnedApp)-[:HAS_USER_FLOW]->(f:LearnedUserFlow)
        WHERE a.name = '${esc(appName)}'
        RETURN f.name AS name LIMIT 5
      `);
            for (const r of flows) {
                result.discoveredKnowledge.get("flows").add(r.name);
                result.tracedPaths.push(`LearnedApp:${appName} →[HAS_USER_FLOW]→ LearnedUserFlow:${r.name} (sweep)`);
            }
        }
    }
    // Sweep models
    if (result.discoveredKnowledge.get("models").size < 5 && discoveredApps.length > 0) {
        const domainKws = result.domains.flatMap(d => d.keywords).slice(0, 10);
        const kwFilter = domainKws.map(kw => `toLower(m.name) CONTAINS '${esc(kw)}'`).join(" OR ");
        for (const appName of discoveredApps.slice(0, 5)) {
            const models = await q(`
        MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
        WHERE a.name = '${esc(appName)}' AND (${kwFilter})
        RETURN m.name AS name, m.category AS category LIMIT 8
      `);
            for (const r of models) {
                result.discoveredKnowledge.get("models").add(`${r.name} (${r.category || "general"})`);
                result.tracedPaths.push(`LearnedApp:${appName} →[HAS_DATA_MODEL]→ LearnedDataModel:${r.name} (sweep)`);
            }
        }
    }
    // Sweep integrations
    if (result.discoveredKnowledge.get("integrations").size < 3 && discoveredApps.length > 0) {
        for (const appName of discoveredApps.slice(0, 3)) {
            const integs = await q(`
        MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
        WHERE a.name = '${esc(appName)}'
        RETURN i.name AS name, i.type AS type LIMIT 5
      `);
            for (const r of integs) {
                result.discoveredKnowledge.get("integrations").add(`${r.name} [${r.type || "other"}]`);
                result.tracedPaths.push(`LearnedApp:${appName} →[HAS_INTEGRATION]→ LearnedIntegration:${r.name} (sweep)`);
            }
        }
    }
    if (result.discoveredKnowledge.get("patterns").size < 3 && discoveredApps.length > 0) {
        for (const appName of discoveredApps.slice(0, 3)) {
            const pats = await q(`
        MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern)
        WHERE a.name = '${esc(appName)}'
        RETURN p.name AS name, p.type AS type LIMIT 5
      `);
            for (const r of pats) {
                result.discoveredKnowledge.get("patterns").add(`${r.name} [${r.type || "unknown"}]`);
                result.tracedPaths.push(`LearnedApp:${appName} →[USES_PATTERN]→ LearnedPattern:${r.name} (sweep)`);
            }
        }
    }
    // ── Step 5: Find best source per domain ──
    for (const domain of result.domains) {
        result.domainSources.push(await findBestSourceForDomain(domain));
    }
    // ── Step 6: Confidence scoring ──
    // Build concept list from domains
    for (const domain of result.domains) {
        const score = await scoreConceptConfidence(domain.description, domain.keywords);
        result.conceptScores.push(score);
    }
    // ── Step 7: Universal patterns ──
    result.universalPatterns = await findUniversalPatterns();
    // ── Calculate coverage ──
    const categories = Array.from(result.discoveredKnowledge.values());
    const nonEmpty = categories.filter(s => s.size > 0).length;
    result.coveragePercent = Math.round((nonEmpty / categories.length) * 100);
    result.gaps = result.conceptScores.filter(s => s.confidence === "GAP").map(s => s.concept);
    // FIX 4: Enrich blueprint with specific features/models/integrations per domain
    const usedApps = new Map();
    for (const source of result.domainSources) {
        if (source.score > 0) {
            if (!usedApps.has(source.bestApp))
                usedApps.set(source.bestApp, { domains: [], features: [], models: [], integrations: [] });
            const entry = usedApps.get(source.bestApp);
            entry.domains.push(source.domain);
            entry.features.push(...source.matchedFeatures);
            entry.models.push(...source.matchedModels);
            entry.integrations.push(...source.matchedIntegrations);
        }
    }
    for (const [app, data] of usedApps) {
        const lines = [`${app} → ${data.domains.join(", ")}`];
        if (data.features.length > 0)
            lines.push(`  features: ${[...new Set(data.features)].slice(0, 6).join(", ")}`);
        if (data.models.length > 0)
            lines.push(`  models: ${[...new Set(data.models)].slice(0, 6).join(", ")}`);
        if (data.integrations.length > 0)
            lines.push(`  integrations: ${[...new Set(data.integrations)].slice(0, 4).join(", ")}`);
        result.blueprint.push(...lines);
    }
    return result;
}
// ═══════════════════════════════════════════════════════════════════════
// CLI RUNNER
// ═══════════════════════════════════════════════════════════════════════
async function main() {
    const request = process.argv[2] || "barber shop appointment booking app";
    neo4j = getNeo4jService();
    await neo4j.connect();
    // Detect vector search availability
    vectorEnabled = isEmbeddingAvailable();
    if (vectorEnabled) {
        // Quick check: does at least one vector index exist?
        try {
            const indexes = await neo4j.runCypher(`SHOW INDEXES WHERE type = 'VECTOR'`);
            if (indexes.length === 0) {
                console.log(`  ⚠️  No vector indexes found. Run: npx tsx src/tools/index-graph-embeddings.ts`);
                vectorEnabled = false;
            }
        }
        catch {
            vectorEnabled = false;
        }
    }
    console.log(`\n${"═".repeat(75)}`);
    console.log(`  AES UNIFIED GRAPH REASONER`);
    console.log(`  Request: "${request}"`);
    console.log(`  Engine: cross-domain + auto-synonyms + Think-on-Graph beam search`);
    console.log(`  Vector: ${vectorEnabled ? "✅ ENABLED (hybrid keyword+vector RRF)" : "⚠️ DISABLED (keyword only — set OPENAI_API_KEY to enable)"}`);
    console.log(`${"═".repeat(75)}\n`);
    const result = await unifiedReason(request);
    // ── Print Step 0: Rules ──
    if (result.rulesLoaded.length > 0) {
        console.log(`  ▸ STEP 0: REASONING RULES LOADED`);
        result.rulesLoaded.forEach(r => console.log(`    • ${r}`));
        console.log();
    }
    // ── Print Step 1: Domains ──
    console.log(`  ▸ STEP 1: CROSS-DOMAIN DECOMPOSITION (${result.domains.length} domains)`);
    for (const d of result.domains) {
        const icon = d.relevance === "PRIMARY" ? "🔵" : d.relevance === "SUPPORTING" ? "🟡" : "⚪";
        console.log(`    ${icon} ${d.relevance.padEnd(10)} ${d.domain.padEnd(20)} ${d.description}`);
    }
    // ── Print Step 2: Synonyms ──
    console.log(`\n  ▸ STEP 2: AUTO-SYNONYM EXPANSION (${result.expandedKeywords.length} total terms)`);
    for (const [kw, syns] of result.synonymClusters) {
        if (syns.length > 1) {
            console.log(`    ${kw} → [${syns.slice(0, 6).join(", ")}${syns.length > 6 ? ` +${syns.length - 6} more` : ""}]`);
        }
    }
    // ── Print Step 3: Seeds ──
    console.log(`\n  ▸ STEP 3: SEED NODES (${result.seedNodes.length} starting points)`);
    for (const seed of result.seedNodes) {
        console.log(`    ${seed.label}:${seed.name} [${seed.properties.source || "direct"}]`);
    }
    // ── Print Step 4: Beam search hops ──
    console.log(`\n  ▸ STEP 4: THINK-ON-GRAPH BEAM SEARCH (${result.hops.length} hops)`);
    for (const hop of result.hops) {
        console.log(`    ── Hop ${hop.hop} from ${hop.fromNode} ──`);
        console.log(`    ${hop.reasoning}`);
        const topEdges = hop.edges.filter(e => e.score > 0).slice(0, 4);
        for (const e of topEdges) {
            const icon = e.score >= 5 ? "🟢" : e.score >= 3 ? "🟡" : "⚪";
            console.log(`      ${icon} [${e.score}] →[${e.type}]→ ${e.targetNode.label}:${e.targetNode.name} (${e.reason})`);
        }
    }
    // ── Print traced paths ──
    const uniquePaths = [...new Set(result.tracedPaths)];
    console.log(`\n  ▸ TRACED REASONING PATHS (${uniquePaths.length} total)`);
    for (const path of uniquePaths.slice(0, 25)) {
        console.log(`    ${path}`);
    }
    // ── Print discovered knowledge (includes post-walk sweep) ──
    console.log(`\n  ▸ DISCOVERED KNOWLEDGE (beam search + sweep)`);
    for (const [category, items] of result.discoveredKnowledge) {
        if (items.size > 0) {
            const arr = Array.from(items);
            console.log(`\n    ${category.toUpperCase()} (${items.size}):`);
            for (const item of arr.slice(0, 8))
                console.log(`      • ${item}`);
            if (arr.length > 8)
                console.log(`      ... +${arr.length - 8} more`);
        }
    }
    // ── Print Step 5: Domain sources ──
    console.log(`\n  ▸ STEP 5: BEST SOURCE PER DOMAIN`);
    for (const source of result.domainSources) {
        const icon = source.score >= 5 ? "🟢" : source.score >= 2 ? "🟡" : source.score > 0 ? "🟠" : "🔴";
        console.log(`    ${icon} ${source.domain.padEnd(20)} ← ${source.bestApp || "NONE"} (${source.score} matches)`);
        if (source.matchedFeatures.length > 0)
            console.log(`       Features: ${source.matchedFeatures.slice(0, 5).join(", ")}`);
        if (source.matchedModels.length > 0)
            console.log(`       Models:   ${source.matchedModels.slice(0, 5).join(", ")}`);
        if (source.alternateApps.length > 0)
            console.log(`       Also in:  ${source.alternateApps.slice(0, 3).join(", ")}`);
    }
    // ── Print Step 6: Confidence ──
    console.log(`\n  ▸ STEP 6: CONCEPT CONFIDENCE`);
    for (const score of result.conceptScores) {
        const icon = score.confidence === "HIGH" ? "🟢" : score.confidence === "MEDIUM" ? "🟡" : score.confidence === "LOW" ? "🟠" : "🔴";
        console.log(`    ${icon} ${score.confidence.padEnd(6)} ${score.concept} — ${score.nodeTypesHit} types, ${score.totalHits} hits`);
        if (score.evidence.length > 0)
            console.log(`             ${score.evidence.slice(0, 5).join("; ")}`);
    }
    // ── Print universals ──
    if (result.universalPatterns.length > 0) {
        console.log(`\n  ▸ UNIVERSAL PATTERNS (40%+ of apps)`);
        for (const p of result.universalPatterns.slice(0, 8)) {
            console.log(`    ${p.percentage}% [${p.type}] ${p.name}`);
        }
    }
    // ── Print blueprint ──
    console.log(`\n  ▸ COMPOSITE BLUEPRINT`);
    console.log(`  ┌────────────────────────────────────────────────────────────────────┐`);
    console.log(`  │  To build: "${request}"`);
    console.log(`  │  Domains: ${result.domains.length} | Sources: ${result.domainSources.filter(s => s.score > 0).length} apps`);
    console.log(`  ├────────────────────────────────────────────────────────────────────┤`);
    for (const line of result.blueprint) {
        // FIX 4b: indented sub-lines for features/models/integrations
        if (line.startsWith("  ")) {
            console.log(`  │       ${line}`);
        }
        else {
            console.log(`  │  📦 ${line}`);
        }
    }
    if (result.gaps.length > 0) {
        console.log(`  │`);
        console.log(`  │  ⚠️  GAPS (need external research): ${result.gaps.join(", ")}`);
    }
    console.log(`  │`);
    console.log(`  │  🔧 UNIVERSAL: ${result.universalPatterns.slice(0, 4).map(p => `${p.name} (${p.percentage}%)`).join(", ")}`);
    console.log(`  └────────────────────────────────────────────────────────────────────┘`);
    // ── Final summary ──
    const totalItems = Array.from(result.discoveredKnowledge.values()).reduce((sum, s) => sum + s.size, 0);
    const highCount = result.conceptScores.filter(s => s.confidence === "HIGH").length;
    const gapCount = result.gaps.length;
    console.log(`\n${"═".repeat(75)}`);
    console.log(`  RESULT: ${result.coveragePercent}% category coverage | ${totalItems} knowledge items | ${uniquePaths.length} traced paths`);
    console.log(`  Confidence: ${highCount} HIGH, ${result.conceptScores.filter(s => s.confidence === "MEDIUM").length} MEDIUM, ${result.conceptScores.filter(s => s.confidence === "LOW").length} LOW, ${gapCount} GAP`);
    console.log(`  Synonyms: ${result.expandedKeywords.length} terms from ${result.synonymClusters.size} seed keywords`);
    console.log(`  Domains: ${result.domains.filter(d => d.relevance === "PRIMARY").length} primary, ${result.domains.filter(d => d.relevance === "SUPPORTING").length} supporting, ${result.domains.filter(d => d.relevance === "UNIVERSAL").length} universal`);
    console.log(`  Vector: ${vectorEnabled ? `✅ hybrid RRF (${vectorSimCache.size} cached similarities)` : "⚠️ keyword-only"}`);
    if (gapCount === 0) {
        console.log(`  ✅ All concepts covered. Ready to build from graph knowledge.`);
    }
    else {
        console.log(`  ⚠️  ${gapCount} gap(s) need targeted Perplexity research: ${result.gaps.join(", ")}`);
    }
    console.log(`${"═".repeat(75)}\n`);
    await neo4j.close();
}
main().catch(console.error);
