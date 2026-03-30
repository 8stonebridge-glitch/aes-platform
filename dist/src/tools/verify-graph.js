/**
 * verify-graph.ts — Quick check of Neo4j graph contents.
 * Usage: npx tsx src/tools/verify-graph.ts
 */
import { getNeo4jService } from "../services/neo4j-service.js";
function num(v) {
    return typeof v === "object" && v?.toNumber ? v.toNumber() : Number(v) || 0;
}
async function main() {
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (!ok) {
        console.error("Cannot connect to Neo4j");
        process.exit(1);
    }
    console.log("\n=== NEO4J GRAPH CONTENTS ===\n");
    // Count all node types
    const labels = await neo4j.runCypher(`
    MATCH (n)
    WITH labels(n) AS lbls, count(*) AS cnt
    UNWIND lbls AS label
    RETURN label, sum(cnt) AS cnt ORDER BY cnt DESC
  `);
    console.log("Node counts by label:");
    for (const r of labels) {
        console.log(`  ${String(r.label).padEnd(30)} ${num(r.cnt)}`);
    }
    // Catalog entries detail
    console.log("\n--- CatalogEntry nodes ---");
    const catalog = await neo4j.runCypher(`
    MATCH (c:CatalogEntry)
    RETURN c.id AS id, c.name AS name, c.type AS type, c.category AS category, c.promotion_tier AS tier
    ORDER BY c.category, c.name
  `);
    for (const r of catalog) {
        console.log(`  [${r.category}] ${r.id} — ${r.name} (${r.type}) [${r.tier}]`);
    }
    // Learned apps
    console.log("\n--- LearnedApp nodes ---");
    const apps = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f:LearnedFeature)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
    RETURN a.name AS name, a.app_class AS app_class, a.source_url AS url,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models, count(DISTINCT i) AS integrations
    ORDER BY a.name
  `);
    if (apps.length === 0) {
        console.log("  (none — batch-learn may still be running)");
    }
    for (const r of apps) {
        console.log(`  ${r.name} [${r.app_class}] — ${num(r.features)} features, ${num(r.models)} models, ${num(r.integrations)} integrations`);
        console.log(`    ${r.url}`);
    }
    // Relationships from CatalogEntry
    console.log("\n--- CatalogEntry relationships ---");
    const rels = await neo4j.runCypher(`
    MATCH (c:CatalogEntry)-[r]->(t)
    RETURN type(r) AS rel, labels(t)[0] AS target_type, count(*) AS cnt
    ORDER BY cnt DESC
  `);
    for (const r of rels) {
        console.log(`  ${r.rel} → ${r.target_type}: ${num(r.cnt)}`);
    }
    // Total relationship count
    const totalRels = await neo4j.runCypher(`MATCH ()-[r]->() RETURN count(r) AS cnt`);
    console.log(`\nTotal relationships: ${num(totalRels[0]?.cnt)}`);
    await neo4j.close();
    console.log("\n=== DONE ===\n");
}
main().catch(console.error);
