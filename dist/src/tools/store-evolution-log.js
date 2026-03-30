/**
 * store-evolution-log.ts — Record the full evolution of AES graph reasoning
 * so the system knows what it learned, when, and why.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const now = new Date().toISOString();
    // ─── Evolution timeline ────────────────────────────────────────────
    const events = [
        {
            id: "EVO-001-CODEBASE-SCANNING",
            title: "Learned from 15 real open-source apps via code scanning",
            date: "2026-03-26T01:00:00Z",
            what_happened: "Built learn-app.ts v2 with recursive discovery across 16 layers. Scanned Cal.com, Documenso, Plane, Twenty, Formbricks, Hoppscotch, Trigger.dev, Infisical, LobeChat, Midday, GoBarber, QuickBarber, ARKA Vet Clinic, Modern Booking System, and Vivid. Wrote 3,266 typed nodes to Neo4j.",
            what_we_learned: "Code scanning teaches structure (models, features, integrations, patterns) but not domain intent. It gives 90% coverage on general SaaS patterns but cannot teach domain-specific concepts that no scanned app implements.",
            node_count: 3266,
            app_count: 15,
        },
        {
            id: "EVO-002-NAIVE-TEST-50PCT",
            title: "First test scored 50% — exact string matching failed",
            date: "2026-03-26T02:00:00Z",
            what_happened: "Built learn-loop-perplexity.ts to test graph knowledge against Perplexity research on barber booking apps. Used exact string matching: looked for 'Appointment scheduling with real-time availability' but graph stores it as Booking, Availability, BookingSeat, SelectedSlots across multiple nodes. Scored 37/74 (50%).",
            what_we_learned: "The data was comprehensive. The retrieval was the bottleneck. Exact string matching against a knowledge graph is fundamentally wrong because the graph distributes concepts across many nodes with different names.",
            node_count: 3266,
            app_count: 15,
        },
        {
            id: "EVO-003-FAN-OUT-90PCT",
            title: "Fan-out keyword search scored 90% — same data, better retrieval",
            date: "2026-03-26T03:00:00Z",
            what_happened: "Built graph-only-test.ts that searches each concept using 4-5 synonym keywords across all node types (features, models, integrations, patterns, flows, pages). Same graph, zero new data. Score jumped from 50% to 90%. Only 6 items truly missing from the entire graph.",
            what_we_learned: "Never ask the graph one question and accept the answer. Fan out. Ask the same thing using every synonym, related concept, and adjacent term. The knowledge is distributed — a single query only sees one slice. One query = partial knowledge. Many queries fused = the real picture.",
            node_count: 3266,
            app_count: 15,
        },
        {
            id: "EVO-004-REASONING-RULES-STORED",
            title: "Stored reasoning rules in graph so AES reads them before every build",
            date: "2026-03-26T04:00:00Z",
            what_happened: "Created AESReasoningRule, AESSearchStrategy, AESPreflight, and AESLesson node types. Stored RULE-001-FAN-OUT-SEARCH with 5 strategies (synonym expansion, cross-node search, decompose before search, evidence over absence, quantify confidence). Stored PREFLIGHT-001 as a 7-step checklist. Wired graph-reader.ts to load these FIRST before any search.",
            what_we_learned: "The graph should teach the reader HOW to search, not just WHAT to search for. Reasoning rules are first-class graph citizens with priority ordering.",
            node_count: 3266,
            app_count: 15,
        },
        {
            id: "EVO-005-SMART-READER",
            title: "Built smart graph reader with auto-synonyms, relationship traversal, and confidence scoring",
            date: "2026-03-26T05:00:00Z",
            what_happened: "Built smart-graph-reader.ts with three capabilities: (1) Auto-synonym generation — queries the graph for co-occurring terms instead of using a hardcoded map. (2) Relationship traversal — when a node is found, follows its edges to pull the full connected subgraph (features, models, integrations, patterns, flows). (3) Confidence scoring — counts evidence paths per concept across all node types. Reports HIGH/MEDIUM/LOW/GAP. Also added cross-app frequency analysis. Result: 11 HIGH, 0 MEDIUM, 3 LOW, 0 GAP for barber booking.",
            what_we_learned: "Three layers of graph intelligence: (1) synonym expansion catches what the graph calls things, (2) relationship traversal catches what is connected to what, (3) confidence scoring tells the pipeline where it is strong vs where it needs external research. The system now knows what it knows AND what it does not know.",
            node_count: 3266,
            app_count: 15,
        },
        {
            id: "EVO-006-GRAPH-READER-WIRED",
            title: "Wired graph-reader.ts into the live pipeline with fan-out and learned knowledge queries",
            date: "2026-03-26T05:30:00Z",
            what_happened: "Updated graph-reader.ts: (1) Added 7 new Cypher queries for LearnedFeature, LearnedDataModel, LearnedIntegration, LearnedPattern, LearnedUserFlow, LearnedResearch, LearnedCorrection. (2) Added reasoning rules loader as Step 0. (3) Added synonym expansion via expandKeywords(). (4) Updated state.ts with 7 new graphContext fields. Pipeline now queries 12 parallel Cypher queries (5 original + 7 learned) with expanded keywords.",
            what_we_learned: "The pipeline must consume learned knowledge at the same level as its original Entity/Package/Pattern queries. Learned nodes are not second-class — they are the primary knowledge source for greenfield builds.",
            node_count: 3266,
            app_count: 15,
        },
    ];
    for (const evt of events) {
        await neo4j.runCypher(`
      MERGE (e:AESEvolution {event_id: '${evt.id}'})
      SET e.title = '${evt.title.replace(/'/g, "\\'")}',
          e.date = '${evt.date}',
          e.what_happened = '${evt.what_happened.replace(/'/g, "\\'")}',
          e.what_we_learned = '${evt.what_we_learned.replace(/'/g, "\\'")}',
          e.node_count = ${evt.node_count},
          e.app_count = ${evt.app_count},
          e.recorded_at = '${now}'
    `);
    }
    // Link them in order
    for (let i = 0; i < events.length - 1; i++) {
        await neo4j.runCypher(`
      MATCH (a:AESEvolution {event_id: '${events[i].id}'})
      MATCH (b:AESEvolution {event_id: '${events[i + 1].id}'})
      MERGE (a)-[:LED_TO]->(b)
    `);
    }
    // Link evolution to the reasoning rules it produced
    await neo4j.runCypher(`
    MATCH (e:AESEvolution {event_id: 'EVO-003-FAN-OUT-90PCT'})
    MATCH (r:AESReasoningRule {rule_id: 'RULE-001-FAN-OUT-SEARCH'})
    MERGE (e)-[:PRODUCED]->(r)
  `);
    await neo4j.runCypher(`
    MATCH (e:AESEvolution {event_id: 'EVO-004-REASONING-RULES-STORED'})
    MATCH (c:AESPreflight {checklist_id: 'PREFLIGHT-001-GRAPH-READER'})
    MERGE (e)-[:PRODUCED]->(c)
  `);
    await neo4j.runCypher(`
    MATCH (e:AESEvolution {event_id: 'EVO-002-NAIVE-TEST-50PCT'})
    MATCH (l:AESLesson {lesson_id: 'LESSON-001-RETRIEVAL-NOT-DATA'})
    MERGE (e)-[:PRODUCED]->(l)
  `);
    // ─── Summary query ─────────────────────────────────────────────────
    const timeline = await neo4j.runCypher(`
    MATCH (e:AESEvolution)
    RETURN e.event_id AS id, e.title AS title, e.date AS date
    ORDER BY e.date
  `);
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  AES Evolution Timeline stored in graph`);
    console.log(`${"═".repeat(65)}\n`);
    timeline.forEach((r, i) => {
        console.log(`  ${i + 1}. [${r.date.slice(0, 10)}] ${r.title}`);
    });
    const links = await neo4j.runCypher(`
    MATCH (a:AESEvolution)-[:LED_TO]->(b:AESEvolution)
    RETURN a.event_id AS from, b.event_id AS to
  `);
    console.log(`\n  ${links.length} LED_TO relationships (evolution chain)`);
    const produced = await neo4j.runCypher(`
    MATCH (e:AESEvolution)-[:PRODUCED]->(n)
    RETURN e.event_id AS event, labels(n)[0] AS type, n.title AS title
  `);
    console.log(`  ${produced.length} PRODUCED relationships (what each step created):`);
    produced.forEach((r) => console.log(`    ${r.event} → ${r.type}: ${r.title}`));
    console.log(`\n  Query the full timeline:`);
    console.log(`    MATCH (e:AESEvolution) RETURN e ORDER BY e.date`);
    console.log(`    MATCH p=(e:AESEvolution)-[:LED_TO*]->(last) WHERE NOT (last)-[:LED_TO]->() RETURN p`);
    await neo4j.close();
}
main().catch(console.error);
