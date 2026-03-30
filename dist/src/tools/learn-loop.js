/**
 * learn-loop.ts — Automated learning loop with feedback.
 *
 * Runs test scenarios against the knowledge graph, scores the results,
 * and writes feedback + corrections back to Neo4j so AES learns.
 *
 * Two modes:
 *   1. Auto-test: run predefined scenarios with expected answers
 *   2. Custom: pass a description as CLI arg
 *
 * Usage:
 *   npx tsx src/tools/learn-loop.ts                          # run all test scenarios
 *   npx tsx src/tools/learn-loop.ts "barber shop booking app" # custom query
 */
import { getNeo4jService } from "../services/neo4j-service.js";
// ─── Neo4j ──────────────────────────────────────────────────────────
let neo4j;
async function q(cypher) {
    try {
        return await neo4j.runCypher(cypher);
    }
    catch {
        return [];
    }
}
function val(v) {
    if (v && typeof v === "object" && "low" in v)
        return v.low;
    return v;
}
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
// ─── Keywords ───────────────────────────────────────────────────────
const STOP = new Set(["a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "is", "it", "that", "this", "as", "are", "was", "be", "have", "has", "do", "does", "will", "would", "could", "should", "i", "we", "you", "they", "my", "our", "me", "us", "build", "create", "make", "want", "need", "app", "application", "system", "new", "please", "like", "something", "similar", "where", "their"]);
function keywords(text) {
    return text.toLowerCase().replace(/[^a-z0-9\s-]/g, "").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
}
// ─── Test Scenarios ─────────────────────────────────────────────────
const SCENARIOS = [
    {
        description: "a scheduling app for barber shops where customers book appointments, pick their barber, and pay online",
        expected: {
            stack: ["Next.js", "Prisma", "PostgreSQL"],
            features: ["booking", "payment", "schedule", "calendar"],
            models: ["Booking", "User", "Payment", "Schedule", "Credential"],
            patterns: ["Stripe", "RBAC", "Zod", "Monorepo"],
            integrations: ["Stripe", "Redis", "Nodemailer"],
            auth: ["Role-Based", "Encryption"],
            flows: ["Onboarding", "Booking", "Authentication"],
        },
        corrections: [
            { section: "INTEGRATIONS", correction: "Barbershops use Square more than Stripe for POS integration" },
            { section: "INTEGRATIONS", correction: "MISSING: SMS reminders via Twilio for appointment confirmations" },
            { section: "DATA MODELS", correction: "MISSING: Service model (name, price, duration) and BarberAvailability model" },
            { section: "USER FLOWS", correction: "MISSING: Walk-in check-in flow and loyalty/rewards program flow" },
            { section: "PATTERNS", correction: "MISSING: Waitlist pattern for walk-in customers" },
        ],
    },
    {
        description: "an invoice and expense tracking app for freelancers with receipt scanning and tax reports",
        expected: {
            stack: ["Next.js", "Drizzle"],
            features: ["invoice", "transaction", "expense"],
            models: ["Payment", "Subscription", "Credit"],
            patterns: ["Stripe", "RBAC", "Zod"],
            integrations: ["Stripe", "AWS S3", "Nodemailer"],
            auth: ["Role-Based"],
        },
        corrections: [
            { section: "INTEGRATIONS", correction: "MISSING: OCR service for receipt scanning (e.g., Google Vision, Mindee)" },
            { section: "DATA MODELS", correction: "MISSING: Invoice, Expense, Receipt, TaxCategory, Client models" },
            { section: "FEATURES", correction: "MISSING: Receipt scanning, tax report generation, recurring invoices" },
            { section: "PATTERNS", correction: "MISSING: PDF generation pattern for invoices" },
        ],
    },
    {
        description: "a project management tool like Linear with issues, sprints, and team collaboration",
        expected: {
            stack: ["Next.js"],
            features: ["issue", "project", "team"],
            patterns: ["RBAC", "Monorepo", "Redis", "Real-time"],
            integrations: ["Redis"],
            auth: ["Role-Based"],
        },
        corrections: [
            { section: "DATA MODELS", correction: "MISSING: Issue, Project, Sprint, Label, Priority, Status, Comment models" },
            { section: "PATTERNS", correction: "Need real-time sync via WebSockets for live collaboration" },
            { section: "FEATURES", correction: "MISSING: Kanban board, timeline view, notifications, keyboard shortcuts" },
        ],
    },
    {
        description: "an AI chatbot builder where users create custom bots, train them on documents, and embed on websites",
        expected: {
            stack: ["Next.js"],
            features: ["chat", "agent", "knowledge"],
            patterns: ["Zod", "Docker"],
            integrations: ["OpenAI"],
        },
        corrections: [
            { section: "INTEGRATIONS", correction: "MISSING: Vector database (Pinecone, Qdrant, Weaviate) for document embeddings" },
            { section: "DATA MODELS", correction: "MISSING: Bot, Conversation, Message, Document, Embedding, Widget models" },
            { section: "FEATURES", correction: "MISSING: Document upload + chunking, embedding generation, widget embed code" },
            { section: "PATTERNS", correction: "MISSING: RAG (retrieval augmented generation) pattern, streaming response pattern" },
        ],
    },
    {
        description: "a document signing platform like DocuSign where users upload PDFs, add signature fields, and send for signing",
        expected: {
            stack: ["Next.js", "Prisma"],
            features: ["document", "template", "recipient"],
            models: ["User", "Account"],
            patterns: ["RBAC", "2FA", "Stripe"],
            integrations: ["Stripe", "AWS S3"],
            auth: ["Role-Based", "Two-Factor"],
        },
        corrections: [
            { section: "DATA MODELS", correction: "Should match Documenso: Document, Recipient, Field, Signature, Template models" },
            { section: "PATTERNS", correction: "MISSING: PDF rendering pattern, digital signature verification pattern" },
        ],
    },
];
// ─── Run One Scenario ───────────────────────────────────────────────
async function runScenario(scenario) {
    const kws = keywords(scenario.description);
    const sessionId = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const results = [];
    let totalScore = 0;
    let sectionCount = 0;
    console.log(`\n${"━".repeat(60)}`);
    console.log(`  APP: ${scenario.description}`);
    console.log(`  Keywords: ${kws.join(", ")}`);
    console.log(`${"━".repeat(60)}`);
    // 1. Tech Stack
    const stackRows = await q(`MATCH (a:LearnedApp) RETURN a.framework AS framework, a.database AS db, a.orm AS orm ORDER BY a.total_files DESC`);
    const stackText = stackRows.map(r => `${r.framework} ${r.db} ${r.orm}`).join(" ");
    const stackExpected = scenario.expected.stack || [];
    const stackMatched = stackExpected.filter(e => stackText.toLowerCase().includes(e.toLowerCase()));
    const stackMissed = stackExpected.filter(e => !stackText.toLowerCase().includes(e.toLowerCase()));
    const stackScore = stackExpected.length > 0 ? Math.round((stackMatched.length / stackExpected.length) * 5) : 3;
    results.push({ name: "TECH STACK", rows: stackRows, score: stackScore, matched: stackMatched, missed: stackMissed });
    totalScore += stackScore;
    sectionCount++;
    // 2. Features
    const kwOr = kws.map(k => `toLower(a.name) CONTAINS '${esc(k)}'`).join(" OR ");
    const kwOrClass = kws.map(k => `toLower(a.app_class) CONTAINS '${esc(k)}'`).join(" OR ");
    let featRows = await q(`MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) WHERE ${kwOr} OR ${kwOrClass} RETURN f.name AS feature, f.complexity AS complexity ORDER BY f.file_count DESC LIMIT 20`);
    if (featRows.length === 0)
        featRows = await q(`MATCH (f:LearnedFeature) WHERE f.complexity = 'complex' RETURN f.name AS feature, f.complexity AS complexity ORDER BY f.file_count DESC LIMIT 20`);
    const featText = featRows.map(r => val(r.feature)).join(" ").toLowerCase();
    const featExpected = scenario.expected.features || [];
    const featMatched = featExpected.filter(e => featText.includes(e.toLowerCase()));
    const featMissed = featExpected.filter(e => !featText.includes(e.toLowerCase()));
    const featScore = featExpected.length > 0 ? Math.round((featMatched.length / featExpected.length) * 5) : 3;
    results.push({ name: "FEATURES", rows: featRows, score: featScore, matched: featMatched, missed: featMissed });
    totalScore += featScore;
    sectionCount++;
    // 3. Data Models
    let modelRows = await q(`MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel) WHERE ${kwOr} OR ${kwOrClass} RETURN DISTINCT m.name AS model, m.category AS category, m.field_count AS fields ORDER BY m.field_count DESC LIMIT 15`);
    if (modelRows.length === 0)
        modelRows = await q(`MATCH (m:LearnedDataModel) WHERE m.category IN ['auth_identity','organization','payments','scheduling'] RETURN DISTINCT m.name AS model, m.category AS category, m.field_count AS fields ORDER BY m.field_count DESC LIMIT 15`);
    const modelText = modelRows.map(r => val(r.model)).join(" ").toLowerCase();
    const modelExpected = scenario.expected.models || [];
    const modelMatched = modelExpected.filter(e => modelText.includes(e.toLowerCase()));
    const modelMissed = modelExpected.filter(e => !modelText.includes(e.toLowerCase()));
    const modelScore = modelExpected.length > 0 ? Math.round((modelMatched.length / modelExpected.length) * 5) : 3;
    results.push({ name: "DATA MODELS", rows: modelRows, score: modelScore, matched: modelMatched, missed: modelMissed });
    totalScore += modelScore;
    sectionCount++;
    // 4. Patterns
    const patRows = await q(`MATCH (p:LearnedPattern) WITH p.name AS pattern, p.type AS type, count(*) AS apps ORDER BY apps DESC LIMIT 15 RETURN pattern, type, apps`);
    const patText = patRows.map(r => val(r.pattern)).join(" ").toLowerCase();
    const patExpected = scenario.expected.patterns || [];
    const patMatched = patExpected.filter(e => patText.includes(e.toLowerCase()));
    const patMissed = patExpected.filter(e => !patText.includes(e.toLowerCase()));
    const patScore = patExpected.length > 0 ? Math.round((patMatched.length / patExpected.length) * 5) : 3;
    results.push({ name: "PATTERNS", rows: patRows, score: patScore, matched: patMatched, missed: patMissed });
    totalScore += patScore;
    sectionCount++;
    // 5. Integrations
    const intRows = await q(`MATCH (i:LearnedIntegration) WITH i.provider AS provider, i.type AS type, count(*) AS apps ORDER BY apps DESC LIMIT 12 RETURN provider, type, apps`);
    const intText = intRows.map(r => val(r.provider)).join(" ").toLowerCase();
    const intExpected = scenario.expected.integrations || [];
    const intMatched = intExpected.filter(e => intText.includes(e.toLowerCase()));
    const intMissed = intExpected.filter(e => !intText.includes(e.toLowerCase()));
    const intScore = intExpected.length > 0 ? Math.round((intMatched.length / intExpected.length) * 5) : 3;
    results.push({ name: "INTEGRATIONS", rows: intRows, score: intScore, matched: intMatched, missed: intMissed });
    totalScore += intScore;
    sectionCount++;
    // 6. Auth
    const authRows = await q(`MATCH (p:LearnedPattern) WHERE p.type = 'auth' RETURN p.name AS pattern, count(*) AS apps ORDER BY apps DESC`);
    const authText = authRows.map(r => val(r.pattern)).join(" ").toLowerCase();
    const authExpected = scenario.expected.auth || [];
    const authMatched = authExpected.filter(e => authText.includes(e.toLowerCase()));
    const authMissed = authExpected.filter(e => !authText.includes(e.toLowerCase()));
    const authScore = authExpected.length > 0 ? Math.round((authMatched.length / authExpected.length) * 5) : 3;
    results.push({ name: "AUTH", rows: authRows, score: authScore, matched: authMatched, missed: authMissed });
    totalScore += authScore;
    sectionCount++;
    // 7. Flows
    const flowRows = await q(`MATCH (uf:LearnedUserFlow) RETURN uf.name AS flow, uf.section AS section, uf.steps AS steps`);
    const flowText = flowRows.map(r => `${val(r.flow)} ${val(r.section)}`).join(" ").toLowerCase();
    const flowExpected = scenario.expected.flows || [];
    const flowMatched = flowExpected.filter(e => flowText.includes(e.toLowerCase()));
    const flowMissed = flowExpected.filter(e => !flowText.includes(e.toLowerCase()));
    const flowScore = flowExpected.length > 0 ? Math.round((flowMatched.length / flowExpected.length) * 5) : 3;
    results.push({ name: "USER FLOWS", rows: flowRows, score: flowScore, matched: flowMatched, missed: flowMissed });
    totalScore += flowScore;
    sectionCount++;
    // Print results
    let pass = 0, fail = 0;
    for (const r of results) {
        const icon = r.score >= 4 ? "✅" : r.score >= 3 ? "⚠️" : "❌";
        console.log(`\n  ${icon} ${r.name}: ${r.score}/5 (${r.rows.length} results)`);
        if (r.matched.length > 0)
            console.log(`     ✓ Found: ${r.matched.join(", ")}`);
        if (r.missed.length > 0)
            console.log(`     ✗ Missing: ${r.missed.join(", ")}`);
        if (r.score >= 3)
            pass++;
        else
            fail++;
    }
    const avgScore = totalScore / sectionCount;
    // ── Write feedback to Neo4j ──
    for (const r of results) {
        await q(`
      CREATE (f:LearnedFeedback {
        session_id: '${esc(sessionId)}',
        app_description: '${esc(scenario.description)}',
        section: '${esc(r.name)}',
        score: ${r.score},
        was_useful: ${r.score >= 3},
        matched: '${esc(r.matched.join(", "))}',
        missed: '${esc(r.missed.join(", "))}',
        result_count: ${r.rows.length},
        timestamp: '${esc(new Date().toISOString())}'
      }) RETURN f.session_id
    `);
    }
    // ── Write corrections to Neo4j ──
    for (const c of scenario.corrections) {
        await q(`
      CREATE (c:LearnedCorrection {
        session_id: '${esc(sessionId)}',
        section: '${esc(c.section)}',
        correction: '${esc(c.correction)}',
        app_description: '${esc(scenario.description)}',
        timestamp: '${esc(new Date().toISOString())}'
      }) RETURN c.session_id
    `);
    }
    // ── Write blueprint result ──
    await q(`
    CREATE (b:LearnedBlueprintResult {
      session_id: '${esc(sessionId)}',
      app_description: '${esc(scenario.description)}',
      avg_score: ${avgScore.toFixed(1)},
      pass_count: ${pass},
      fail_count: ${fail},
      correction_count: ${scenario.corrections.length},
      timestamp: '${esc(new Date().toISOString())}'
    }) RETURN b.session_id
  `);
    console.log(`\n  Score: ${avgScore.toFixed(1)}/5 | ${pass} pass, ${fail} fail | ${scenario.corrections.length} corrections written`);
    return { pass, fail, score: avgScore };
}
// ─── Main ───────────────────────────────────────────────────────────
async function main() {
    neo4j = getNeo4jService();
    await neo4j.connect();
    const customDesc = process.argv.slice(2).join(" ");
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  AES Learning Loop — Automated Testing + Feedback");
    console.log("═══════════════════════════════════════════════════════════");
    const scenarios = customDesc
        ? [{ description: customDesc, expected: {}, corrections: [] }]
        : SCENARIOS;
    let totalPass = 0, totalFail = 0, totalScore = 0;
    for (const s of scenarios) {
        const r = await runScenario(s);
        totalPass += r.pass;
        totalFail += r.fail;
        totalScore += r.score;
    }
    const avgAll = totalScore / scenarios.length;
    // Show cumulative stats
    const totalFeedback = await q(`MATCH (f:LearnedFeedback) RETURN count(f) AS total, avg(f.score) AS avg`);
    const totalCorrections = await q(`MATCH (c:LearnedCorrection) RETURN count(c) AS total`);
    const totalSessions = await q(`MATCH (b:LearnedBlueprintResult) RETURN count(b) AS total`);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ALL SCENARIOS COMPLETE`);
    console.log(`${"═".repeat(60)}`);
    console.log(`  Scenarios:     ${scenarios.length}`);
    console.log(`  Avg Score:     ${avgAll.toFixed(1)}/5`);
    console.log(`  Sections:      ${totalPass} pass, ${totalFail} fail`);
    console.log(`\n  ── Knowledge Graph Learning Stats ──`);
    console.log(`  Total sessions:    ${val(totalSessions[0]?.total || 0)}`);
    console.log(`  Total feedback:    ${val(totalFeedback[0]?.total || 0)} records (avg ${Number(totalFeedback[0]?.avg || 0).toFixed(1)}/5)`);
    console.log(`  Total corrections: ${val(totalCorrections[0]?.total || 0)} corrections stored`);
    console.log(`${"═".repeat(60)}\n`);
    await neo4j.close();
}
main().catch(console.error);
