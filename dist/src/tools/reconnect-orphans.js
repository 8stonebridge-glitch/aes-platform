/**
 * Reconnect orphaned nodes in Neo4j by matching their `source` field
 * to LearnedApp nodes, creating missing apps where needed.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
// Map orphan source values → LearnedApp name
const SOURCE_TO_APP = {
    "calcom-monorepo": "calcom-monorepo",
    "learned-n8n-monorepo": "n8n",
    "learned-gobarber-learn": "gobarber",
    "learned-oncut": "oncut",
    "learned-booking": "booking",
    "learned-backend": "backend",
    "learned-src": "src",
    "learned-platform": "platform",
    "learned-arka-weterynaria-full-stack-appointment-booking-and-management-website": "arka-weterynaria",
};
// Map orphan label → relationship type to LearnedApp
const LABEL_TO_REL = {
    LearnedFeature: "HAS_FEATURE",
    LearnedDataModel: "HAS_DATA_MODEL",
    DataModel: "HAS_DATA_MODEL",
    LearnedIntegration: "HAS_INTEGRATION",
    LearnedPattern: "USES_PATTERN",
    LearnedComponentGroup: "HAS_COMPONENTS",
    LearnedPageSection: "HAS_PAGES",
    LearnedApiDomain: "HAS_API_DOMAIN",
    LearnedStatePattern: "HAS_STATE_PATTERN",
    LearnedDesignSystem: "HAS_DESIGN_SYSTEM",
    LearnedUserFlow: "HAS_USER_FLOW",
    LearnedFormPattern: "HAS_FORM_PATTERN",
    LearnedCorrection: "HAS_CORRECTION",
    LearnedFeedback: "HAS_FEEDBACK",
    LearnedResearch: "HAS_RESEARCH",
};
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    let totalCreatedApps = 0;
    let totalCreatedRels = 0;
    // Step 1: Ensure all target LearnedApp nodes exist
    const existingApps = await neo4j.runCypher("MATCH (a:LearnedApp) RETURN a.name AS name");
    const existingNames = new Set(existingApps.map((a) => a.name));
    const neededApps = new Set(Object.values(SOURCE_TO_APP));
    for (const appName of neededApps) {
        if (!existingNames.has(appName)) {
            console.log(`Creating missing LearnedApp: ${appName}`);
            await neo4j.runCypher("CREATE (a:LearnedApp {name: $name, source: 'reconnect-orphans', created_at: $now})", { name: appName, now: new Date().toISOString() });
            totalCreatedApps++;
        }
    }
    // Step 2: For each source → app mapping, reconnect orphans
    for (const [source, appName] of Object.entries(SOURCE_TO_APP)) {
        // Find all orphaned nodes with this source
        const orphans = await neo4j.runCypher(`MATCH (n) WHERE NOT (n)--() AND n.source = $source
       RETURN elementId(n) AS id, labels(n)[0] AS label`, { source });
        if (orphans.length === 0)
            continue;
        console.log(`\nSource "${source}" → App "${appName}": ${orphans.length} orphans`);
        // Group by label for batch connection
        const byLabel = {};
        for (const o of orphans) {
            const label = o.label;
            if (!byLabel[label])
                byLabel[label] = [];
            byLabel[label].push(String(o.id));
        }
        for (const [label, ids] of Object.entries(byLabel)) {
            const relType = LABEL_TO_REL[label];
            if (!relType) {
                console.log(`  Skipping ${ids.length} ${label} — no relationship mapping`);
                continue;
            }
            const query = `
        MATCH (a:LearnedApp {name: $appName})
        UNWIND $ids AS nid
        MATCH (n) WHERE elementId(n) = nid
        MERGE (a)-[:${relType}]->(n)
        RETURN count(*) AS cnt
      `;
            const result = await neo4j.runCypher(query, { appName, ids });
            const cnt = Number(result[0]?.cnt || 0);
            totalCreatedRels += cnt;
            console.log(`  ${label} → ${relType} → ${cnt} connected`);
        }
    }
    // Step 3: Handle perplexity-research orphans — link to a hub node
    const perplexityOrphans = await neo4j.runCypher(`MATCH (n) WHERE NOT (n)--() AND n.source = 'perplexity-research'
     RETURN elementId(n) AS id, labels(n)[0] AS label, count(*) AS cnt`);
    // Group perplexity orphans by their app_description or domain
    const perplexityNodes = await neo4j.runCypher(`MATCH (n) WHERE NOT (n)--() AND n.source = 'perplexity-research'
     RETURN elementId(n) AS id, labels(n)[0] AS label,
            coalesce(n.domain, 'general') AS domain,
            coalesce(n.app_description, '') AS app_desc`);
    if (perplexityNodes.length > 0) {
        console.log(`\nPerplexity research orphans: ${perplexityNodes.length}`);
        // Create a research hub node
        await neo4j.runCypher(`MERGE (h:ResearchHub {name: 'perplexity-research'})
       ON CREATE SET h.created_at = $now, h.source = 'reconnect-orphans'`, { now: new Date().toISOString() });
        for (const label of ['LearnedCorrection', 'LearnedResearch', 'LearnedFeedback']) {
            const relType = LABEL_TO_REL[label];
            if (!relType)
                continue;
            const result = await neo4j.runCypher(`MATCH (h:ResearchHub {name: 'perplexity-research'})
         MATCH (n:${label}) WHERE NOT (n)--() AND n.source = 'perplexity-research'
         MERGE (h)-[:${relType}]->(n)
         RETURN count(*) AS cnt`);
            const cnt = Number(result[0]?.cnt || 0);
            totalCreatedRels += cnt;
            console.log(`  ${label} → ResearchHub: ${cnt} connected`);
        }
    }
    // Step 4: Handle remaining BuildRecord orphans
    const buildOrphans = await neo4j.runCypher(`MATCH (n:BuildRecord) WHERE NOT (n)--()
     RETURN elementId(n) AS id, n.source AS source`);
    if (buildOrphans.length > 0) {
        console.log(`\nBuildRecord orphans: ${buildOrphans.length}`);
        await neo4j.runCypher(`MERGE (h:BuildHistory {name: 'build-records'})
       ON CREATE SET h.created_at = $now
       WITH h
       MATCH (n:BuildRecord) WHERE NOT (n)--()
       MERGE (h)-[:HAS_BUILD]->(n)
       RETURN count(*) AS cnt`, { now: new Date().toISOString() });
        totalCreatedRels += buildOrphans.length;
        console.log(`  Connected ${buildOrphans.length} BuildRecords to BuildHistory hub`);
    }
    // Final report
    console.log(`\n=== DONE ===`);
    console.log(`Created ${totalCreatedApps} new LearnedApp nodes`);
    console.log(`Created ${totalCreatedRels} new relationships`);
    // Verify remaining orphans
    const remaining = await neo4j.runCypher(`MATCH (n) WHERE NOT (n)--()
     RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC`);
    console.log(`\nRemaining orphans:`);
    let totalRemaining = 0;
    for (const r of remaining) {
        console.log(`  ${r.label}: ${Number(r.cnt)}`);
        totalRemaining += Number(r.cnt);
    }
    console.log(`Total remaining: ${totalRemaining}`);
    process.exit(0);
}
main().catch((err) => {
    console.error(err);
    process.exit(1);
});
