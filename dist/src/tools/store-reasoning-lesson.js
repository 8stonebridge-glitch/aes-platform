/**
 * store-reasoning-lesson.ts — Write the fan-out reasoning lesson
 * into the knowledge graph so AES sees it before every build.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const now = new Date().toISOString();
    // ─── 1. Core reasoning rule ────────────────────────────────────────
    await neo4j.runCypher(`
    MERGE (r:AESReasoningRule {rule_id: 'RULE-001-FAN-OUT-SEARCH'})
    SET r.title = 'Fan-Out Search: Never ask the graph one question and accept the answer',
        r.summary = 'The knowledge graph stores concepts under many names. A single query only sees one slice. Decompose every concept into synonyms, related terms, and adjacent domains. Search each one. Fuse the results. One query = partial knowledge. Many queries fused = the real picture.',
        r.priority = 1,
        r.category = 'graph-reasoning',
        r.learned_from = 'barber-booking-test-2026-03-26',
        r.evidence = 'Test scored 50% with exact match (1 query per concept). Same graph scored 90% with keyword fan-out (4-5 queries per concept). Zero new data was added. The knowledge was already there.',
        r.created_at = '${now}',
        r.version = 1
  `);
    // ─── 2. Specific search strategy rules ─────────────────────────────
    const strategies = [
        {
            id: 'STRATEGY-001-SYNONYM-EXPANSION',
            title: 'Expand every search term into 3-5 synonyms before querying',
            description: 'The graph stores "Appointment" as Booking, BookingSeat, BookingReference. It stores "Staff" as Member, Team, Agent, Membership. Always generate synonym sets before searching.',
            example: 'appointment → [booking, appointment, schedule, reservation, slot]',
        },
        {
            id: 'STRATEGY-002-CROSS-NODE-SEARCH',
            title: 'Search across ALL node types, not just the obvious one',
            description: 'A "feature" might be stored as a LearnedFeature, a LearnedPageSection, a LearnedDataModel, or a LearnedPattern. A "payment" concept appears in Features (Billing), Models (Payment, CreditBalance), Integrations (stripe), and Patterns (Stripe Payment Integration). Search all of them.',
            example: 'payment → search Features + Models + Integrations + Patterns + Pages',
        },
        {
            id: 'STRATEGY-003-DECOMPOSE-BEFORE-SEARCH',
            title: 'Decompose the user request into atomic concepts before any graph query',
            description: 'When the user says "barber shop booking app", decompose into: booking, scheduling, appointment, availability, calendar, staff, service, payment, notification, review, location, auth, dashboard, analytics. Search each atomic concept independently, then fuse results.',
            example: '"barber booking app" → 14 atomic concepts → 14 independent searches → fused result',
        },
        {
            id: 'STRATEGY-004-EVIDENCE-OVER-ABSENCE',
            title: 'Absence of a direct match does not mean absence of knowledge',
            description: 'If you search for "loyalty program" and find nothing, search for "reward", "points", "stamp", "incentive", "retention". If you search for "waitlist" and find nothing, search for "queue", "wait", "walk-in", "check-in". The graph rarely has zero knowledge — it just uses different words.',
            example: '"loyalty program" not found → search reward, points, stamp → still not found → THEN it is a real gap',
        },
        {
            id: 'STRATEGY-005-QUANTIFY-CONFIDENCE',
            title: 'More evidence paths = higher confidence in the answer',
            description: 'If "payment" is found in Features (Billing), Models (Payment, CreditBalance, CreditPurchaseLog), Integrations (stripe, stripepayment), AND Patterns (Stripe Payment Integration), confidence is very high. If found in only one node type with one match, confidence is low. Report both the answer and the evidence depth.',
            example: 'payment: 4 node types, 7 matches = HIGH confidence. loyalty: 0 node types, 0 matches = genuine gap.',
        },
    ];
    for (const s of strategies) {
        await neo4j.runCypher(`
      MERGE (s:AESSearchStrategy {strategy_id: '${s.id}'})
      SET s.title = '${s.title.replace(/'/g, "\\'")}',
          s.description = '${s.description.replace(/'/g, "\\'")}',
          s.example = '${s.example.replace(/'/g, "\\'")}',
          s.category = 'graph-reasoning',
          s.created_at = '${now}'
      WITH s
      MATCH (r:AESReasoningRule {rule_id: 'RULE-001-FAN-OUT-SEARCH'})
      MERGE (r)-[:HAS_STRATEGY]->(s)
    `);
    }
    // ─── 3. Graph-reader pre-flight checklist ──────────────────────────
    await neo4j.runCypher(`
    MERGE (c:AESPreflight {checklist_id: 'PREFLIGHT-001-GRAPH-READER'})
    SET c.title = 'Graph Reader Pre-Flight Checklist',
        c.description = 'Before executing any build, the graph reader MUST complete these steps in order.',
        c.priority = 0,
        c.category = 'graph-reasoning',
        c.created_at = '${now}',
        c.steps = 'STEP 1: Read all AESReasoningRule nodes (priority 0 = read first).\\nSTEP 2: Decompose the user request into atomic domain concepts.\\nSTEP 3: For each concept, generate 3-5 synonym keywords.\\nSTEP 4: For each keyword, search across ALL Learned* node types.\\nSTEP 5: Fuse results. Count evidence paths per concept.\\nSTEP 6: Report what the graph knows (with confidence) and what is genuinely missing.\\nSTEP 7: Only flag a gap if ALL synonym searches returned zero results.'
    WITH c
    MATCH (r:AESReasoningRule {rule_id: 'RULE-001-FAN-OUT-SEARCH'})
    MERGE (c)-[:IMPLEMENTS]->(r)
  `);
    // ─── 4. The origin story — so AES knows WHY this rule exists ───────
    await neo4j.runCypher(`
    MERGE (l:AESLesson {lesson_id: 'LESSON-001-RETRIEVAL-NOT-DATA'})
    SET l.title = 'The retrieval was broken, not the data',
        l.summary = 'On 2026-03-26 we tested the knowledge graph against Perplexity research for a barber booking app. With exact string matching the graph scored 50%. With fan-out keyword search it scored 90%. The graph had 3,266 nodes across 15 real apps. The data was comprehensive. The retrieval strategy was the bottleneck. This lesson changed how AES queries the graph.',
        l.before_score = 50,
        l.after_score = 90,
        l.total_nodes = 3266,
        l.total_apps = 15,
        l.date = '2026-03-26',
        l.category = 'graph-reasoning',
        l.created_at = '${now}'
    WITH l
    MATCH (r:AESReasoningRule {rule_id: 'RULE-001-FAN-OUT-SEARCH'})
    MERGE (l)-[:DISCOVERED]->(r)
  `);
    // ─── Verify ────────────────────────────────────────────────────────
    const rules = await neo4j.runCypher(`MATCH (r:AESReasoningRule) RETURN r.rule_id AS id, r.title AS title`);
    const strats = await neo4j.runCypher(`MATCH (s:AESSearchStrategy) RETURN s.strategy_id AS id, s.title AS title`);
    const checks = await neo4j.runCypher(`MATCH (c:AESPreflight) RETURN c.checklist_id AS id, c.title AS title`);
    const lessons = await neo4j.runCypher(`MATCH (l:AESLesson) RETURN l.lesson_id AS id, l.title AS title`);
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  Reasoning lessons stored in graph`);
    console.log(`${"═".repeat(60)}\n`);
    console.log(`  Rules:`);
    rules.forEach((r) => console.log(`    ${r.id}: ${r.title}`));
    console.log(`\n  Strategies:`);
    strats.forEach((r) => console.log(`    ${r.id}: ${r.title}`));
    console.log(`\n  Pre-flight:`);
    checks.forEach((r) => console.log(`    ${r.id}: ${r.title}`));
    console.log(`\n  Lessons:`);
    lessons.forEach((r) => console.log(`    ${r.id}: ${r.title}`));
    console.log(`\n  Total: ${rules.length} rules, ${strats.length} strategies, ${checks.length} checklists, ${lessons.length} lessons`);
    console.log(`\n  These are now queryable at pipeline start via:`);
    console.log(`    MATCH (r:AESReasoningRule) RETURN r ORDER BY r.priority`);
    console.log(`    MATCH (c:AESPreflight) RETURN c ORDER BY c.priority`);
    await neo4j.close();
}
main().catch(console.error);
