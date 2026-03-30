import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const apps = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i)
    RETURN a.name AS name, a.app_class AS cls,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models, count(DISTINCT i) AS integrations
    ORDER BY count(DISTINCT f) DESC
  `);
    console.log(`\nAPPS IN GRAPH (${apps.length}):\n`);
    for (const a of apps) {
        const f = typeof a.features === "object" ? a.features.low : a.features;
        const m = typeof a.models === "object" ? a.models.low : a.models;
        const i = typeof a.integrations === "object" ? a.integrations.low : a.integrations;
        console.log(`  ${String(a.name).padEnd(30)} [${String(a.cls).padEnd(25)}] f:${String(f).padStart(3)} m:${String(m).padStart(3)} i:${String(i).padStart(3)}`);
    }
    await neo4j.close();
}
main().catch(console.error);
