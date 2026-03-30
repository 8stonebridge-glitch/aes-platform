/**
 * store-evolution-v2.ts — Record the second phase of AES graph reasoning evolution.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const now = new Date().toISOString();
    const events = [
        {
            id: "EVO-007-UNIFIED-REASONER",
            title: "Built unified graph reasoning engine merging 3 tools into 1 pipeline",
            date: "2026-03-26T06:00:00Z",
            what_happened: "Created unified-graph-reasoner.ts that merges smart-graph-reader (auto-synonyms, confidence scoring), cross-domain-reason (domain decomposition, best-source-per-domain), and think-on-graph (iterative beam search with hunger). Single pipeline: rules -> domains -> synonyms -> seeds -> beam search -> confidence -> blueprint.",
            what_we_learned: "Three separate reasoning tools were doing overlapping work. Merging them means synonyms feed into edge scoring, domains feed into seed placement, and hunger drives exploration toward gaps. The whole is greater than the sum of parts.",
        },
        {
            id: "EVO-008-SYNONYM-NOISE-FIX",
            title: "Fixed synonym noise — require co-occurrence in 2+ apps, filter 3+ char min",
            date: "2026-03-26T06:30:00Z",
            what_happened: "Synonym expansion was pulling every feature/model from any app containing a keyword. 'booking' expanded to 56 terms including 'timezone buddy'. Fixed by requiring terms appear in 2+ apps alongside the keyword. Also added 3-char minimum filter. Synonyms went from 170 to 60 terms for the same query.",
            what_we_learned: "Co-occurrence in a single app is correlation, not synonymy. Co-occurrence in 2+ apps is evidence of a real semantic relationship. Noise reduction improved scoring precision without losing coverage.",
        },
        {
            id: "EVO-009-MODEL-LOOP-FIX",
            title: "Fixed SAME_CATEGORY model loops — capped to 1 per hop, score penalty",
            date: "2026-03-26T06:45:00Z",
            what_happened: "Beam search wasted 3 hops bouncing between CalendarCacheEvent/TaskEvent/TaskEventPartitioned via SAME_CATEGORY edges. Fixed by capping SAME_CATEGORY to 1 result per hop and adding -2 score penalty. Hops went from 28 to 18.",
            what_we_learned: "Not all edges are equal. Some edge types (SAME_CATEGORY) are useful for diversity but should never dominate the beam. Edge type penalties are a simple way to prevent structural loops without breaking the graph topology.",
        },
        {
            id: "EVO-010-ALL-DOMAIN-SEEDING",
            title: "Seed from ALL domains not just PRIMARY — beam now explores 5-7 apps instead of 2",
            date: "2026-03-26T07:00:00Z",
            what_happened: "Seeds were only placed for PRIMARY domains. Multi-domain requests missed SUPPORTING/UNIVERSAL apps entirely. Fixed by seeding from all domains with keyword fallback. Also added generic feature filter (no more Logger, Utils, Types as seeds), app-priority beam (apps explored first), higher hunger thresholds, and app hunger bonus (+5). Apps explored went from 2 to 5-7.",
            what_we_learned: "The beam search is only as good as its starting points. Domain decomposition identifies what apps matter, but if seeds dont include them, the beam will never reach them. Seed quality > beam width.",
        },
        {
            id: "EVO-011-ENRICHED-BLUEPRINT",
            title: "Blueprint now shows specific features, models, and integrations per domain per app",
            date: "2026-03-26T07:15:00Z",
            what_happened: "Blueprint used to say 'Cal.com provides scheduling'. Now says 'Cal.com provides scheduling — features: TravelSchedule, Slots, SelectedSlots; models: CalendarCacheEvent, BookingAudit; integrations: zohocalendar, office365calendar'. Domain source data flows into the blueprint as a concrete spec.",
            what_we_learned: "A blueprint that says 'use App X for Domain Y' is not actionable. A blueprint that says 'use these 6 features, these 6 models, these 4 integrations from App X' is directly executable by the builder.",
        },
        {
            id: "EVO-012-KG-FACT-VALIDATOR",
            title: "Built KG fact-level validator — extracts triples from builder output and verifies against graph",
            date: "2026-03-26T07:30:00Z",
            what_happened: "Created kg-fact-validator.ts from KG+LLM research paper. Extracts factual claims as triples (subject, predicate, object), cross-references each against the knowledge graph. Returns VERIFIED/UNVERIFIED/CONTRADICTED per claim with evidence trails. Tested against mock barber booking output: 28/59 verified (47%), 0 contradicted. Wired into build-verifier.ts VerificationResult type.",
            what_we_learned: "Fact validation catches hallucination at the claim level, not the output level. The builder can produce correct-looking code that references integrations, models, or patterns that dont exist in the knowledge graph. Each claim needs its own evidence trail.",
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
    MATCH (a:AESEvolution {event_id: 'EVO-006-GRAPH-READER-WIRED'})
    MATCH (b:AESEvolution {event_id: 'EVO-007-UNIFIED-REASONER'})
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
    console.log(`\\nAES Evolution Timeline (${timeline.length} events):`);
    timeline.forEach((r, i) => console.log(`  ${i + 1}. ${r.title}`));
    await neo4j.close();
}
main().catch(console.error);
