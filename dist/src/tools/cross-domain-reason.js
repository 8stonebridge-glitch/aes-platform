/**
 * cross-domain-reason.ts — Reason ACROSS app domains in the knowledge graph.
 *
 * Instead of searching within one app, this asks:
 *   - Which domains does this request touch?
 *   - Which apps are the BEST source for each domain?
 *   - What patterns transfer across domains?
 *   - What's universal vs domain-specific?
 *   - What combination of apps gives the most complete blueprint?
 *
 * Usage:
 *   npx tsx src/tools/cross-domain-reason.ts "barber shop appointment booking app"
 *   npx tsx src/tools/cross-domain-reason.ts "AI-powered invoice management platform"
 *   npx tsx src/tools/cross-domain-reason.ts "open source project management tool with real-time chat"
 */
import { getNeo4jService } from "../services/neo4j-service.js";
let neo4j;
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
async function mapAllDomains() {
    const apps = await q(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
    OPTIONAL MATCH (a)-[:USES_PATTERN]->(p:LearnedPattern)
    OPTIONAL MATCH (a)-[:HAS_USER_FLOW]->(uf:LearnedUserFlow)
    RETURN a.source_id AS id, a.name AS name, a.app_class AS appClass,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models,
           count(DISTINCT i) AS integrations, count(DISTINCT p) AS patterns,
           count(DISTINCT uf) AS flows
    ORDER BY count(DISTINCT f) + count(DISTINCT m) + count(DISTINCT i) DESC
  `);
    return apps.map((r) => ({
        appId: r.id,
        name: r.name,
        appClass: r.appClass || "unknown",
        featureCount: val(r.features),
        modelCount: val(r.models),
        integrationCount: val(r.integrations),
        patternCount: val(r.patterns),
        flowCount: val(r.flows),
        totalNodes: val(r.features) + val(r.models) + val(r.integrations) + val(r.patterns) + val(r.flows),
        strengths: [],
    }));
}
function identifyDomains(request) {
    const lower = request.toLowerCase();
    const domains = [];
    // Domain detection rules
    const domainRules = [
        { domain: "scheduling", triggers: ["booking", "appointment", "schedule", "calendar", "availability", "reservation", "slot"],
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
    ];
    for (const rule of domainRules) {
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
        domains.push({ domain: "auth", relevance: "UNIVERSAL", description: "Authentication and authorization", keywords: ["auth", "login", "session", "role", "permission", "oauth", "jwt"] });
    }
    // Analytics is always supporting
    if (!domains.find(d => d.domain === "analytics")) {
        domains.push({ domain: "analytics", relevance: "SUPPORTING", description: "Analytics and reporting", keywords: ["analytics", "dashboard", "report"] });
    }
    return domains;
}
async function findBestSourceForDomain(domain) {
    // Score each app by how many of the domain's keywords match its content
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
        return {
            domain: domain.domain, bestApp: "NONE", appClass: "", score: 0,
            matchedFeatures: [], matchedModels: [], matchedIntegrations: [], alternateApps: [],
        };
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
        name: r.name,
        type: r.type,
        appCount: val(r.appCount),
        totalApps: val(r.totalApps),
        percentage: Math.round((val(r.appCount) / val(r.totalApps)) * 100),
    }));
}
// ─── 5. FIND CROSS-DOMAIN MODELS (appear in 3+ app classes) ─────────
async function findCrossDomainModels() {
    const models = await q(`
    MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    WITH m.name AS name, collect(DISTINCT m.category) AS categories, collect(DISTINCT a.app_class) AS appClasses
    WHERE size(appClasses) >= 3
    RETURN name, categories, appClasses
    ORDER BY size(appClasses) DESC
    LIMIT 20
  `);
    return models.map((r) => ({
        name: r.name,
        categories: r.categories || [],
        appClasses: r.appClasses || [],
    }));
}
// ─── MAIN ────────────────────────────────────────────────────────────
async function main() {
    const request = process.argv[2] || "barber shop appointment booking app";
    neo4j = getNeo4jService();
    await neo4j.connect();
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  AES Cross-Domain Reasoning`);
    console.log(`  Request: "${request}"`);
    console.log(`${"═".repeat(70)}\n`);
    // ── Step 1: Map all domains in graph ──
    console.log("  ▸ STEP 1: DOMAIN MAP (what does the graph know?)");
    const allApps = await mapAllDomains();
    for (const app of allApps) {
        console.log(`    ${app.name.padEnd(30)} [${app.appClass}] ${app.featureCount}F ${app.modelCount}M ${app.integrationCount}I ${app.patternCount}P = ${app.totalNodes} nodes`);
    }
    // ── Step 2: Identify which domains this request touches ──
    console.log(`\n  ▸ STEP 2: DOMAIN DECOMPOSITION (what domains does "${request}" need?)`);
    const domains = identifyDomains(request);
    for (const d of domains) {
        const icon = d.relevance === "PRIMARY" ? "🔵" : d.relevance === "SUPPORTING" ? "🟡" : "⚪";
        console.log(`    ${icon} ${d.relevance.padEnd(10)} ${d.domain.padEnd(20)} ${d.description}`);
    }
    // ── Step 3: Find best source app for each domain ──
    console.log(`\n  ▸ STEP 3: BEST SOURCE PER DOMAIN (which app teaches each domain best?)`);
    const sources = [];
    for (const domain of domains) {
        const source = await findBestSourceForDomain(domain);
        sources.push(source);
        const icon = source.score >= 5 ? "🟢" : source.score >= 2 ? "🟡" : source.score > 0 ? "🟠" : "🔴";
        console.log(`    ${icon} ${domain.domain.padEnd(20)} ← ${source.bestApp || "NONE"} (${source.score} matches)`);
        if (source.matchedFeatures.length > 0)
            console.log(`       Features: ${source.matchedFeatures.slice(0, 5).join(", ")}`);
        if (source.matchedModels.length > 0)
            console.log(`       Models:   ${source.matchedModels.slice(0, 5).join(", ")}`);
        if (source.matchedIntegrations.length > 0)
            console.log(`       Integrations: ${source.matchedIntegrations.slice(0, 4).join(", ")}`);
        if (source.alternateApps.length > 0)
            console.log(`       Also in:  ${source.alternateApps.slice(0, 3).join(", ")}`);
    }
    // ── Step 4: Universal patterns ──
    console.log(`\n  ▸ STEP 4: UNIVERSAL PATTERNS (what patterns appear across most apps?)`);
    const universals = await findUniversalPatterns();
    for (const p of universals) {
        const bar = "█".repeat(p.appCount) + "░".repeat(p.totalApps - p.appCount);
        console.log(`    ${bar} ${p.appCount}/${p.totalApps} (${p.percentage}%) [${p.type}] ${p.name}`);
    }
    // ── Step 5: Cross-domain models ──
    console.log(`\n  ▸ STEP 5: CROSS-DOMAIN DATA MODELS (models that appear in 3+ app types)`);
    const crossModels = await findCrossDomainModels();
    if (crossModels.length > 0) {
        for (const m of crossModels.slice(0, 15)) {
            console.log(`    ${m.name.padEnd(25)} in ${m.appClasses.length} app types: ${m.appClasses.join(", ")}`);
        }
    }
    else {
        console.log(`    (no cross-domain models found — model names are too app-specific)`);
    }
    // ── Step 6: Composite blueprint ──
    console.log(`\n  ▸ STEP 6: COMPOSITE BLUEPRINT`);
    console.log(`  ┌─────────────────────────────────────────────────────────────────┐`);
    console.log(`  │  To build: "${request}"`);
    console.log(`  │  Pull from ${new Set(sources.filter(s => s.score > 0).map(s => s.bestApp)).size} different apps across ${domains.length} domains:      │`);
    console.log(`  ├─────────────────────────────────────────────────────────────────┤`);
    const usedApps = new Map();
    for (const source of sources) {
        if (source.score > 0) {
            if (!usedApps.has(source.bestApp))
                usedApps.set(source.bestApp, []);
            usedApps.get(source.bestApp).push(source.domain);
        }
    }
    for (const [app, domainList] of usedApps) {
        console.log(`  │  📦 ${app}`);
        console.log(`  │     provides: ${domainList.join(", ")}`);
    }
    const gaps = sources.filter(s => s.score === 0);
    if (gaps.length > 0) {
        console.log(`  │`);
        console.log(`  │  ⚠️  GAPS (need external research):`);
        gaps.forEach(g => console.log(`  │     ${g.domain}`));
    }
    console.log(`  │`);
    console.log(`  │  🔧 UNIVERSAL (apply to ALL apps):`);
    universals.slice(0, 6).forEach(p => console.log(`  │     ${p.name} (${p.percentage}% of apps)`));
    console.log(`  └─────────────────────────────────────────────────────────────────┘`);
    // ── Step 7: Store this reasoning as a graph node ──
    const blueprintId = `blueprint-${Date.now()}`;
    const appSources = sources.filter(s => s.score > 0).map(s => `${s.domain}:${s.bestApp}`).join("; ");
    const gapList = gaps.map(g => g.domain).join(", ") || "none";
    await q(`
    MERGE (b:AESBlueprint {request: '${esc(request)}'})
    SET b.blueprint_id = '${blueprintId}',
        b.domains_identified = ${domains.length},
        b.domains_covered = ${sources.filter(s => s.score > 0).length},
        b.domains_gap = ${gaps.length},
        b.app_sources = '${esc(appSources)}',
        b.gaps = '${esc(gapList)}',
        b.universal_patterns = ${universals.length},
        b.created_at = '${new Date().toISOString()}'
  `);
    console.log(`\n  Blueprint stored as AESBlueprint node: ${blueprintId}`);
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  Cross-domain reasoning complete.`);
    console.log(`  The system combined ${new Set(sources.filter(s => s.score > 0).map(s => s.bestApp)).size} apps to cover ${sources.filter(s => s.score > 0).length}/${domains.length} domains.`);
    if (gaps.length > 0) {
        console.log(`  ${gaps.length} domain(s) need Perplexity research: ${gapList}`);
    }
    else {
        console.log(`  All domains covered by graph knowledge.`);
    }
    console.log(`${"═".repeat(70)}\n`);
    await neo4j.close();
}
main().catch(console.error);
