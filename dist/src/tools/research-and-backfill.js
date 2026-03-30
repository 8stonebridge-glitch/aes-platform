/**
 * research-and-backfill.ts — Use Perplexity to research any app domain,
 * then write findings directly into the knowledge graph as real Learned* nodes.
 *
 * This closes the gap: the scanner learns from code, Perplexity learns from
 * the market. Both write to the same graph so the pipeline can use everything.
 *
 * Usage:
 *   npx tsx src/tools/research-and-backfill.ts "barber shop appointment booking"
 *   npx tsx src/tools/research-and-backfill.ts "freelancer invoicing platform"
 *   npx tsx src/tools/research-and-backfill.ts "AI chatbot builder"
 */
import { getNeo4jService } from "../services/neo4j-service.js";
// ─── Config ──────────────────────────────────────────────────────────
const PERPLEXITY_MCP_AVAILABLE = true; // Set false if running standalone without MCP
// ─── Neo4j helpers ───────────────────────────────────────────────────
let neo4j;
async function q(cypher) {
    try {
        return await neo4j.runCypher(cypher);
    }
    catch (e) {
        console.error(`[neo4j] Query failed: ${e.message}`);
        return [];
    }
}
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
// ─── Perplexity Research ─────────────────────────────────────────────
/**
 * Build the research prompt for Perplexity.
 * We ask for structured JSON so we can parse and write to Neo4j.
 */
function buildResearchPrompt(appDescription) {
    return `Research what a production "${appDescription}" app needs.
Analyze the top 3-5 real-world apps in this category.

Return your findings as a JSON object with EXACTLY this structure (no markdown, just JSON):

{
  "app_description": "${appDescription}",
  "app_class": "<one of: scheduling, document_management, project_management, crm, ecommerce, saas_platform, developer_tools, communication, analytics, ai_ml, finance, healthcare, education, other>",
  "reference_apps": ["App1", "App2", "App3"],
  "features": [
    {"name": "Feature Name", "description": "What it does", "complexity": "simple|moderate|complex"}
  ],
  "data_models": [
    {"name": "ModelName", "category": "auth_identity|scheduling|payments|organization|general|notifications|automation|integration|calendar|routing|audit", "fields": "field1, field2, field3"}
  ],
  "integrations": [
    {"name": "integration-name", "type": "payment|calendar|video_conferencing|crm|email|sms|messaging|analytics|automation|storage|auth|monitoring|cloud|other", "provider": "Human Name", "auth_method": "oauth|api_key|webhook"}
  ],
  "auth_patterns": [
    {"name": "Pattern Name", "description": "How it works"}
  ],
  "tech_stack": [
    {"name": "Technology", "role": "What it's used for"}
  ],
  "user_flows": [
    {"name": "Flow Name", "steps": "step1 -> step2 -> step3"}
  ],
  "ui_patterns": [
    {"name": "Pattern Name", "description": "What it looks like and why"}
  ]
}

Be comprehensive. Include at least:
- 10-15 features
- 10-15 data models with their key fields
- 6-10 integrations
- 4-6 auth patterns
- 5-8 tech stack items
- 4-6 user flows with step breakdowns
- 6-10 UI patterns

Base everything on what REAL production apps in this category actually implement.`;
}
/**
 * Parse the research response into structured data.
 * Handles various Perplexity response formats.
 */
function parseResearchResponse(raw) {
    // Try to extract JSON from the response
    let jsonStr = raw;
    // Strip markdown code fences if present
    const jsonMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
    }
    // Try to find JSON object boundaries
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }
    try {
        const parsed = JSON.parse(jsonStr);
        return parsed;
    }
    catch (e) {
        console.error("[parse] Failed to parse Perplexity JSON response");
        console.error("[parse] Raw response (first 500 chars):", raw.slice(0, 500));
        return null;
    }
}
// ─── Graph Writer ────────────────────────────────────────────────────
/**
 * Write research findings into Neo4j as real Learned* nodes.
 * Creates a LearnedApp node with source "perplexity-research" and
 * links all features, models, integrations, etc.
 */
async function writeToGraph(research) {
    const appId = `research-${research.app_class}-${Date.now()}`;
    const now = new Date().toISOString();
    const stats = {
        features: 0,
        models: 0,
        integrations: 0,
        patterns: 0,
        flows: 0,
        uiPatterns: 0,
        authPatterns: 0,
        techStack: 0,
    };
    // 1. Create the LearnedApp node
    await q(`
    MERGE (a:LearnedApp {source_id: '${esc(appId)}'})
    SET a.name = '${esc(research.app_description)}',
        a.description = 'Perplexity research: ${esc(research.app_description)}. Reference apps: ${esc(research.reference_apps.join(", "))}',
        a.app_class = '${esc(research.app_class)}',
        a.source_url = 'perplexity-research',
        a.source_type = 'research',
        a.reference_apps = '${esc(research.reference_apps.join(", "))}',
        a.learned_at = '${now}',
        a.schema_version = 1
  `);
    // 2. Features
    for (const feat of research.features) {
        const fid = `${appId}-feat-${feat.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        await q(`
      MERGE (f:LearnedFeature {feature_id: '${esc(fid)}'})
      SET f.name = '${esc(feat.name)}',
          f.description = '${esc(feat.description)}',
          f.complexity = '${esc(feat.complexity)}',
          f.source = 'perplexity-research',
          f.file_count = 0,
          f.has_tests = false,
          f.has_api = true
      WITH f
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:HAS_FEATURE]->(f)
    `);
        stats.features++;
    }
    // 3. Data Models
    for (const model of research.data_models) {
        await q(`
      MERGE (m:LearnedDataModel {name: '${esc(model.name)}', app_source: '${esc(appId)}'})
      SET m.category = '${esc(model.category)}',
          m.fields_csv = '${esc(model.fields)}',
          m.field_count = ${model.fields.split(",").length},
          m.source = 'perplexity-research'
      WITH m
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:HAS_DATA_MODEL]->(m)
    `);
        stats.models++;
    }
    // 4. Integrations
    for (const integ of research.integrations) {
        await q(`
      MERGE (i:LearnedIntegration {name: '${esc(integ.name)}', app_source: '${esc(appId)}'})
      SET i.type = '${esc(integ.type)}',
          i.provider = '${esc(integ.provider)}',
          i.auth_method = '${esc(integ.auth_method)}',
          i.source = 'perplexity-research'
      WITH i
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:HAS_INTEGRATION]->(i)
    `);
        stats.integrations++;
    }
    // 5. Auth patterns → LearnedPattern nodes
    for (const auth of research.auth_patterns) {
        await q(`
      MERGE (p:LearnedPattern {name: '${esc(auth.name)}', app_source: '${esc(appId)}'})
      SET p.type = 'auth',
          p.description = '${esc(auth.description)}',
          p.evidence = 'perplexity-research',
          p.source = 'perplexity-research'
      WITH p
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:USES_PATTERN]->(p)
    `);
        stats.authPatterns++;
    }
    // 6. Tech stack → LearnedPattern nodes (architecture type)
    for (const tech of research.tech_stack) {
        await q(`
      MERGE (p:LearnedPattern {name: '${esc(tech.name)}', app_source: '${esc(appId)}'})
      SET p.type = 'architecture',
          p.description = '${esc(tech.role)}',
          p.evidence = 'perplexity-research',
          p.source = 'perplexity-research'
      WITH p
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:USES_PATTERN]->(p)
    `);
        stats.techStack++;
    }
    // 7. User Flows
    for (const flow of research.user_flows) {
        const flowId = `${appId}-flow-${flow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        const stepCount = flow.steps.split("->").length;
        await q(`
      MERGE (f:LearnedUserFlow {flow_id: '${esc(flowId)}'})
      SET f.name = '${esc(flow.name)}',
          f.steps_description = '${esc(flow.steps)}',
          f.step_count = ${stepCount},
          f.source = 'perplexity-research'
      WITH f
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:HAS_USER_FLOW]->(f)
    `);
        stats.flows++;
    }
    // 8. UI Patterns → LearnedPattern (components type)
    for (const ui of research.ui_patterns) {
        await q(`
      MERGE (p:LearnedPattern {name: '${esc(ui.name)}', app_source: '${esc(appId)}'})
      SET p.type = 'components',
          p.description = '${esc(ui.description)}',
          p.evidence = 'perplexity-research',
          p.source = 'perplexity-research'
      WITH p
      MATCH (a:LearnedApp {source_id: '${esc(appId)}'})
      MERGE (a)-[:USES_PATTERN]->(p)
    `);
        stats.uiPatterns++;
    }
    // 9. Also write as LearnedResearch for audit trail
    await q(`
    MERGE (r:LearnedResearch {scenario: '${esc(research.app_description)}', source: 'perplexity-backfill'})
    SET r.app_class = '${esc(research.app_class)}',
        r.reference_apps = '${esc(research.reference_apps.join(", "))}',
        r.feature_count = ${research.features.length},
        r.model_count = ${research.data_models.length},
        r.integration_count = ${research.integrations.length},
        r.created_at = '${now}'
  `);
    return stats;
}
// ─── Standalone Runner (uses fetch to Perplexity API) ────────────────
async function researchViaAPI(appDescription) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) {
        throw new Error("PERPLEXITY_API_KEY not set. Either:\n" +
            "  1. Set it: export PERPLEXITY_API_KEY=pplx-...\n" +
            "  2. Or use this tool via Claude Code with Perplexity MCP");
    }
    console.log("[perplexity] Researching via API...");
    const resp = await fetch("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "sonar-deep-research",
            messages: [
                { role: "system", content: "You are a software product researcher. Return ONLY valid JSON, no markdown." },
                { role: "user", content: buildResearchPrompt(appDescription) },
            ],
        }),
    });
    if (!resp.ok) {
        throw new Error(`Perplexity API error: ${resp.status} ${resp.statusText}`);
    }
    const data = await resp.json();
    return data.choices?.[0]?.message?.content ?? "";
}
// ─── Verify After Backfill ──────────────────────────────────────────
async function verifyBackfill(appId) {
    const counts = await q(`
    MATCH (a:LearnedApp)
    WHERE a.source_id STARTS WITH 'research-'
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
    OPTIONAL MATCH (a)-[:USES_PATTERN]->(p:LearnedPattern)
    OPTIONAL MATCH (a)-[:HAS_USER_FLOW]->(uf:LearnedUserFlow)
    RETURN a.name AS app,
           a.app_class AS class,
           count(DISTINCT f) AS features,
           count(DISTINCT m) AS models,
           count(DISTINCT i) AS integrations,
           count(DISTINCT p) AS patterns,
           count(DISTINCT uf) AS flows
  `);
    console.log("\n  Research-backed apps in graph:");
    for (const row of counts) {
        console.log(`    ${row.app} (${row.class}): ${row.features}F ${row.models}M ${row.integrations}I ${row.patterns}P ${row.flows}UF`);
    }
    const total = await q(`
    MATCH (n)
    WHERE n.source = 'perplexity-research'
    RETURN labels(n)[0] AS label, count(n) AS cnt
    ORDER BY cnt DESC
  `);
    console.log("\n  Total Perplexity-sourced nodes:");
    for (const row of total) {
        console.log(`    ${row.label}: ${row.cnt}`);
    }
}
// ─── Main ────────────────────────────────────────────────────────────
async function main() {
    const appDescription = process.argv[2];
    if (!appDescription) {
        console.error("Usage: npx tsx src/tools/research-and-backfill.ts \"app description\"");
        console.error("Example: npx tsx src/tools/research-and-backfill.ts \"barber shop appointment booking\"");
        process.exit(1);
    }
    neo4j = getNeo4jService();
    await neo4j.connect();
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Perplexity Research → Knowledge Graph Backfill`);
    console.log(`  App: ${appDescription}`);
    console.log(`${"═".repeat(60)}\n`);
    // Step 1: Research via Perplexity API
    console.log("[1/4] Researching via Perplexity...");
    const rawResponse = await researchViaAPI(appDescription);
    console.log(`[1/4] Got ${rawResponse.length} chars from Perplexity`);
    // Step 2: Parse
    console.log("[2/4] Parsing research results...");
    const research = parseResearchResponse(rawResponse);
    if (!research) {
        console.error("[FATAL] Could not parse Perplexity response. Raw:");
        console.error(rawResponse.slice(0, 2000));
        process.exit(1);
    }
    console.log(`[2/4] Parsed: ${research.features.length} features, ${research.data_models.length} models, ${research.integrations.length} integrations`);
    // Step 3: Write to graph
    console.log("[3/4] Writing to knowledge graph...");
    const stats = await writeToGraph(research);
    console.log(`[3/4] Written: ${stats.features}F ${stats.models}M ${stats.integrations}I ${stats.authPatterns}Auth ${stats.techStack}Tech ${stats.flows}UF ${stats.uiPatterns}UI`);
    // Step 4: Verify
    console.log("[4/4] Verifying backfill...");
    await verifyBackfill(research.app_class);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Done. Research written to graph.`);
    console.log(`  The pipeline can now query these via graph-reader.`);
    console.log(`${"═".repeat(60)}\n`);
    await neo4j.close();
}
// ─── Exports (for use from other tools / MCP) ───────────────────────
export { buildResearchPrompt, parseResearchResponse, writeToGraph, verifyBackfill, };
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
