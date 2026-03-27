/**
 * store-evolution-v3.ts — Record the third phase of AES graph reasoning evolution.
 */
import { getNeo4jService } from "../services/neo4j-service.js";

async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();

  const now = new Date().toISOString();

  const events = [
    {
      id: "EVO-013-VECTOR-SEARCH",
      title: "Built vector search — OpenAI embeddings on Neo4j vector indexes for semantic matching",
      date: "2026-03-26T08:00:00Z",
      what_happened: "Created embedding-service.ts with text-embedding-3-small (1536 dims). Added vectorSearch() and vectorSearchAll() functions that embed a query and run db.index.vector.queryNodes() against Neo4j vector indexes. Created index-graph-embeddings.ts to populate 5 vector indexes (feature, model, integration, pattern, flow). Graceful degradation when no API key.",
      what_we_learned: "Vector similarity catches semantic relationships that keyword matching misses entirely. 'scheduling' finds 'availability-management' even though they share no characters. But vector alone has precision issues — it returns vaguely similar things. Need both signals.",
    },
    {
      id: "EVO-014-RRF-FUSION",
      title: "Built Reciprocal Rank Fusion — merges keyword and vector results without score normalization",
      date: "2026-03-26T08:30:00Z",
      what_happened: "Created rrf-fusion.ts implementing RRF: score = sum(1/(k+rank)) across keyword and vector lists. k=60 constant. boostDualSource() gives 1.5x to items found by BOTH methods. Integrated into unified-graph-reasoner.ts in three places: (1) hybridSearch for seed discovery, (2) warmVectorCache for beam search edge scoring, (3) vector similarity bonus in scoreEdges (+0 to +4 based on cosine similarity).",
      what_we_learned: "RRF is elegant because it needs no score normalization between keyword (count-based) and vector (cosine-based) scores. Rank is the universal currency. Dual-source items are the highest confidence matches — if both keyword AND vector agree, the match is almost certainly relevant.",
    },
    {
      id: "EVO-015-POST-BUILD-EXTRACT",
      title: "Built post-build graph extraction — graph grows with every build",
      date: "2026-03-26T09:00:00Z",
      what_happened: "Created post-build-extract.ts that analyzes BuilderRunRecord and extracts: tech signals (framework, db, styling from file patterns), inferred models (from schema/model directories), inferred integrations (stripe, clerk, etc. from file names), detected patterns (middleware, hooks, layouts, error handling). Writes as BuildExtracted* nodes linked to BuildExtraction event node. Cross-links to existing Learned* nodes via MATCHES_LEARNED edges.",
      what_we_learned: "Every build is a learning opportunity. The builder produces real code with real file structures — those structures encode knowledge about what tech, models, integrations, and patterns were actually used. This closes the loop: learn from donors -> reason -> build -> extract from builds -> graph grows.",
    },
    {
      id: "EVO-016-COMMUNITY-DETECT",
      title: "Built community detection — label propagation replaces hardcoded DOMAIN_RULES",
      date: "2026-03-26T09:30:00Z",
      what_happened: "Created community-detect.ts using weighted label propagation. Builds app feature vectors (features, models, model categories, integration types, pattern types). Computes weighted Jaccard similarity (features 40%, models 20%, categories 15%, integrations 15%, patterns 10%). Runs 5 label propagation iterations, picks best modularity. Generates domain rules from discovered communities with auto-labeling from app_class majority or core terms. Can export as drop-in DOMAIN_RULES replacement.",
      what_we_learned: "Hardcoded domain rules assumed we knew all possible domains upfront. But the graph contains apps we never anticipated. Community detection discovers groupings from actual graph structure — if two apps share features, models, and integrations, they belong together regardless of what we named them. Label propagation is simple, requires no GDS plugin, and converges fast on small graphs.",
    },
    {
      id: "EVO-017-TEMPORAL-SUCCESS",
      title: "Built temporal success tracking — graph learns which paths lead to good builds",
      date: "2026-03-26T10:00:00Z",
      what_happened: "Created temporal-success.ts with BuildOutcome nodes that track: which apps, features, models, patterns, integrations were used, whether the build succeeded, verification and fact validation scores, and the full reasoning path chain. getPathSuccessScores() computes temporally-decayed success rates per source. getSuccessBonus() returns a +3 to -2 bonus map for beam search scoring. getLeaderboard() shows best/worst sources and patterns. Trend detection (improving/stable/declining) from first-half vs second-half comparison.",
      what_we_learned: "The graph should not treat all sources as equally reliable. If Cal.com features lead to 90% build success but another source leads to 30%, the reasoner should prefer Cal.com. Temporal decay ensures recent outcomes matter more than old ones — the graph adapts as builder quality improves. The success bonus integrates directly into the beam search edge scorer, closing the full reasoning-build-feedback loop.",
    },
  ];

  for (const evt of events) {
    await neo4j.runCypher(`
      MERGE (e:AESEvolution {event_id: '${evt.id}'})
      SET e.title = '${evt.title.replace(/'/g, "\\'")}',
          e.date = '${evt.date}',
          e.what_happened = '${evt.what_happened.replace(/'/g, "\\'")}',
          e.what_we_learned = '${evt.what_we_learned.replace(/'/g, "\\'")}',
          e.recorded_at = '${now}'
    `);
  }

  // Link to previous chain
  await neo4j.runCypher(`
    MATCH (a:AESEvolution {event_id: 'EVO-012-KG-FACT-VALIDATOR'})
    MATCH (b:AESEvolution {event_id: 'EVO-013-VECTOR-SEARCH'})
    MERGE (a)-[:LED_TO]->(b)
  `);

  // Link new events in order
  for (let i = 0; i < events.length - 1; i++) {
    await neo4j.runCypher(`
      MATCH (a:AESEvolution {event_id: '${events[i].id}'})
      MATCH (b:AESEvolution {event_id: '${events[i + 1].id}'})
      MERGE (a)-[:LED_TO]->(b)
    `);
  }

  // Verify
  const timeline = await neo4j.runCypher(`
    MATCH (e:AESEvolution) RETURN e.event_id AS id, e.title AS title ORDER BY e.date
  `);
  console.log(`\nAES Evolution Timeline (${timeline.length} events):`);
  timeline.forEach((r: any, i: number) => console.log(`  ${i + 1}. ${r.title}`));

  await neo4j.close();
}

main().catch(console.error);
