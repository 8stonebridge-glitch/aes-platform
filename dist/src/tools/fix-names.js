import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    // Fix root → novu (it's novu, not medusa — source_url confirms)
    const r1 = await neo4j.runCypher(`
    MATCH (a:LearnedApp {name: "root"})
    WHERE a.source_url CONTAINS "novu"
    SET a.name = "novu", a.app_class = "notification_platform"
    RETURN a.name, a.app_class
  `);
    console.log("novu fix:", r1);
    // Find where medusa ended up
    const all = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    RETURN a.name AS name, a.app_class AS cls, a.source_url AS url
    ORDER BY a.name
  `);
    for (const a of all) {
        console.log(`  ${String(a.name).padEnd(30)} [${String(a.cls).padEnd(25)}] ${a.url || ""}`);
    }
    // Fix any remaining "root" that came from medusa
    await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    WHERE a.source_url CONTAINS "medusa"
    SET a.name = "medusa", a.app_class = "ecommerce_platform"
    RETURN a.name
  `);
    // Also check for medusa by batch-learn path
    await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    WHERE a.source_path CONTAINS "medusa"
    SET a.name = "medusa", a.app_class = "ecommerce_platform"
    RETURN a.name
  `);
    console.log("\nAfter fixes:");
    const after = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i)
    RETURN a.name AS name, a.app_class AS cls,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models, count(DISTINCT i) AS integrations
    ORDER BY count(DISTINCT f) DESC
  `);
    for (const a of after) {
        const f = typeof a.features === "object" ? a.features.low : a.features;
        const m = typeof a.models === "object" ? a.models.low : a.models;
        const i = typeof a.integrations === "object" ? a.integrations.low : a.integrations;
        console.log(`  ${String(a.name).padEnd(30)} [${String(a.cls).padEnd(25)}] f:${String(f).padStart(3)} m:${String(m).padStart(3)} i:${String(i).padStart(3)}`);
    }
    await neo4j.close();
}
main().catch(console.error);
