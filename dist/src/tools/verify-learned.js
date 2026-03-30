/**
 * Quick verification of what AES learned from reverse-engineering.
 */
import { getNeo4jService } from "../services/neo4j-service.js";
async function verify() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    console.log("\n═══ AES Learned Knowledge Verification ═══\n");
    const entities = await neo4j.runCypher(`
    MATCH (e:Entity {system: 'aes-learned'})
    RETURN e.entity_type AS type, count(*) AS count
    ORDER BY count DESC
  `);
    console.log("Entities by type:", entities);
    const patterns = await neo4j.runCypher(`
    MATCH (p:Pattern)
    RETURN p.name AS name, p.type AS type
    ORDER BY p.name
  `);
    console.log("\nPatterns learned:", patterns);
    const integrations = await neo4j.runCypher(`
    MATCH (c:CatalogEntry)
    RETURN c.category AS category, count(*) AS count
    ORDER BY count DESC
  `);
    console.log("\nIntegrations by category:", integrations);
    const models = await neo4j.runCypher(`
    MATCH (dm:DataModelGroup)
    RETURN dm.name AS category, dm.model_count AS models
    ORDER BY dm.model_count DESC
  `);
    console.log("\nData model groups:", models);
    // Simulate what graph-reader would find for "scheduling app"
    const test = await neo4j.runCypher(`
    MATCH (e:Entity)-[:HAS_FEATURE]->(f:Entity)
    WHERE toLower(f.name) CONTAINS 'booking'
    RETURN f.name AS feature, f.complexity AS complexity, f.file_count AS files
  `);
    console.log("\nGraph-reader test (search: booking):", test);
    // Test pattern discovery
    const patternTest = await neo4j.runCypher(`
    MATCH (p:Pattern)
    WHERE toLower(p.name) CONTAINS 'workflow' OR toLower(p.name) CONTAINS 'auth'
    RETURN p.name AS pattern, p.description AS description
  `);
    console.log("\nPattern test (workflow/auth):", patternTest);
    const total = await neo4j.runCypher(`
    MATCH (n)
    WHERE n:Entity OR n:Pattern OR n:CatalogEntry OR n:DataModelGroup OR n:DataModel
    RETURN labels(n)[0] AS label, count(*) AS count
    ORDER BY count DESC
  `);
    console.log("\nTotal graph nodes:", total);
    await neo4j.close();
}
verify().catch(console.error);
