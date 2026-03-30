/**
 * dump-graph.ts — Show everything in the learned knowledge graph.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    console.log("=== FEATURES (scheduling apps) ===");
    const f1 = await neo4j.runCypher(`MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) WHERE a.app_class CONTAINS 'scheduling' RETURN f.name AS name, f.description AS desc LIMIT 30`);
    f1.forEach((r) => console.log("  ", r.name, "|", (r.desc || "").slice(0, 80)));
    console.log("\n=== ALL FEATURES (distinct) ===");
    const f2 = await neo4j.runCypher(`MATCH (f:LearnedFeature) WITH DISTINCT f.name AS name, f.description AS desc ORDER BY name RETURN name, desc LIMIT 80`);
    f2.forEach((r) => console.log("  ", r.name, "|", (r.desc || "").slice(0, 80)));
    console.log("\n=== ALL DATA MODELS ===");
    const m = await neo4j.runCypher(`MATCH (m:LearnedDataModel) WITH DISTINCT m.name AS name, m.category AS cat ORDER BY name RETURN name, cat LIMIT 80`);
    m.forEach((r) => console.log("  ", r.name, "(" + r.cat + ")"));
    console.log("\n=== ALL INTEGRATIONS ===");
    const i = await neo4j.runCypher(`MATCH (i:LearnedIntegration) WITH DISTINCT i.name AS name, i.type AS type ORDER BY name RETURN name, type LIMIT 50`);
    i.forEach((r) => console.log("  ", r.name, "|", r.type));
    console.log("\n=== ALL PATTERNS ===");
    const p = await neo4j.runCypher(`MATCH (p:LearnedPattern) WITH DISTINCT p.name AS name, p.type AS type ORDER BY type, name RETURN name, type LIMIT 80`);
    p.forEach((r) => console.log("  [" + r.type + "]", r.name));
    console.log("\n=== ALL USER FLOWS ===");
    const uf = await neo4j.runCypher(`MATCH (f:LearnedUserFlow) RETURN f.name AS name, f.steps_description AS steps LIMIT 30`);
    uf.forEach((r) => console.log("  ", r.name, "|", (r.steps || "").slice(0, 100)));
    console.log("\n=== GRAPH STATS ===");
    const stats = await neo4j.runCypher(`
    MATCH (n) WHERE any(l IN labels(n) WHERE l STARTS WITH 'Learned')
    RETURN labels(n)[0] AS label, count(n) AS cnt ORDER BY cnt DESC
  `);
    stats.forEach((r) => console.log("  ", r.label, ":", r.cnt));
    await neo4j.close();
}
main().catch(console.error);
