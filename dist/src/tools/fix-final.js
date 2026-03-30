import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    // Rename @medusajs/medusa → medusa, classify as ecommerce
    await neo4j.runCypher(`
    MATCH (a:LearnedApp {name: "@medusajs/medusa"})
    SET a.name = "medusa", a.app_class = "ecommerce_platform"
    RETURN a.name
  `);
    console.log("✅ @medusajs/medusa → medusa (ecommerce_platform)");
    // Rename "backend" → merge into infisical (move its relationships)
    // First, move all edges from "backend" to "infisical"
    for (const relType of ["HAS_FEATURE", "HAS_DATA_MODEL", "HAS_INTEGRATION", "HAS_PATTERN", "HAS_API_DOMAIN", "HAS_PAGE_SECTION", "HAS_COMPONENT_GROUP", "HAS_NAVIGATION", "HAS_USER_FLOW", "HAS_FORM_PATTERN", "HAS_STATE_PATTERN", "HAS_DESIGN_SYSTEM"]) {
        await neo4j.runCypher(`
      MATCH (old:LearnedApp {name: "backend"})-[r:${relType}]->(n)
      MATCH (target:LearnedApp {name: "infisical"})
      MERGE (target)-[:${relType}]->(n)
      DELETE r
    `);
    }
    await neo4j.runCypher(`MATCH (a:LearnedApp {name: "backend"}) DETACH DELETE a`);
    console.log("✅ backend merged into infisical, node deleted");
    // Rename "src" → merge into umami
    for (const relType of ["HAS_FEATURE", "HAS_DATA_MODEL", "HAS_INTEGRATION", "HAS_PATTERN", "HAS_API_DOMAIN", "HAS_PAGE_SECTION", "HAS_COMPONENT_GROUP", "HAS_NAVIGATION", "HAS_USER_FLOW", "HAS_FORM_PATTERN", "HAS_STATE_PATTERN", "HAS_DESIGN_SYSTEM"]) {
        await neo4j.runCypher(`
      MATCH (old:LearnedApp {name: "src"})-[r:${relType}]->(n)
      MATCH (target:LearnedApp {name: "umami"})
      MERGE (target)-[:${relType}]->(n)
      DELETE r
    `);
    }
    await neo4j.runCypher(`MATCH (a:LearnedApp {name: "src"}) DETACH DELETE a`);
    console.log("✅ src merged into umami, node deleted");
    // Merge infisical-learn into infisical
    for (const relType of ["HAS_FEATURE", "HAS_DATA_MODEL", "HAS_INTEGRATION", "HAS_PATTERN", "HAS_API_DOMAIN", "HAS_PAGE_SECTION", "HAS_COMPONENT_GROUP", "HAS_NAVIGATION", "HAS_USER_FLOW", "HAS_FORM_PATTERN", "HAS_STATE_PATTERN", "HAS_DESIGN_SYSTEM"]) {
        await neo4j.runCypher(`
      MATCH (old:LearnedApp {name: "infisical-learn"})-[r:${relType}]->(n)
      MATCH (target:LearnedApp {name: "infisical"})
      MERGE (target)-[:${relType}]->(n)
      DELETE r
    `);
    }
    await neo4j.runCypher(`MATCH (a:LearnedApp {name: "infisical-learn"}) DETACH DELETE a`);
    console.log("✅ infisical-learn merged into infisical, node deleted");
    // Delete junk apps with no useful data
    for (const junkName of ["gobarber-learn", "oncut", "arka-weterynaria-full-stack-appointment-booking-and-management-website", "booking"]) {
        await neo4j.runCypher(`MATCH (a:LearnedApp {name: $name}) DETACH DELETE a`, { name: junkName });
        console.log(`✅ deleted junk app: ${junkName}`);
    }
    // Final count
    const after = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i)
    RETURN a.name AS name, a.app_class AS cls,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models, count(DISTINCT i) AS integrations
    ORDER BY count(DISTINCT f) DESC
  `);
    console.log(`\nFINAL GRAPH (${after.length} apps):\n`);
    for (const a of after) {
        const f = typeof a.features === "object" ? a.features.low : a.features;
        const m = typeof a.models === "object" ? a.models.low : a.models;
        const i = typeof a.integrations === "object" ? a.integrations.low : a.integrations;
        console.log(`  ${String(a.name).padEnd(25)} [${String(a.cls).padEnd(25)}] f:${String(f).padStart(3)} m:${String(m).padStart(3)} i:${String(i).padStart(3)}`);
    }
    await neo4j.close();
}
main().catch(console.error);
