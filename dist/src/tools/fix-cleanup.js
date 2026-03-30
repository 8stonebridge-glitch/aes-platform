import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    // Delete stale/duplicate nodes
    const toDelete = ["platform", "n8n-monorepo"];
    for (const name of toDelete) {
        await neo4j.runCypher(`MATCH (a:LearnedApp {name: $name}) DETACH DELETE a`, { name });
        console.log(`✅ deleted: ${name}`);
    }
    // Merge old "rocket.chat" edges into "rocket-chat" then delete old
    const relTypes = ["HAS_FEATURE", "HAS_DATA_MODEL", "HAS_INTEGRATION", "HAS_PATTERN", "HAS_API_DOMAIN", "HAS_PAGE_SECTION", "HAS_COMPONENT_GROUP", "HAS_NAVIGATION", "HAS_USER_FLOW", "HAS_FORM_PATTERN", "HAS_STATE_PATTERN", "HAS_DESIGN_SYSTEM"];
    const oldName = "rocket.chat";
    const newName = "rocket-chat";
    for (const rel of relTypes) {
        await neo4j.runCypher(`
      MATCH (old:LearnedApp {name: $old})-[r:${rel}]->(n)
      MATCH (target:LearnedApp {name: $new})
      MERGE (target)-[:${rel}]->(n)
      DELETE r
    `, { old: oldName, new: newName });
    }
    await neo4j.runCypher(`MATCH (a:LearnedApp {name: $name}) DETACH DELETE a`, { name: oldName });
    console.log(`✅ merged rocket.chat → rocket-chat`);
    // Final count
    const apps = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    OPTIONAL MATCH (a)-[:HAS_DATA_MODEL]->(m)
    OPTIONAL MATCH (a)-[:HAS_INTEGRATION]->(i)
    RETURN a.name AS name, a.app_class AS cls,
           count(DISTINCT f) AS features, count(DISTINCT m) AS models, count(DISTINCT i) AS integrations
    ORDER BY count(DISTINCT f) DESC
  `);
    const toNum = (v) => typeof v === "object" ? v.low : v;
    let totalF = 0, totalM = 0, totalI = 0;
    console.log(`\nFINAL GRAPH (${apps.length} apps):\n`);
    for (const a of apps) {
        const f = toNum(a.features), m = toNum(a.models), i = toNum(a.integrations);
        totalF += f;
        totalM += m;
        totalI += i;
        console.log(`  ${String(a.name).padEnd(25)} [${String(a.cls).padEnd(25)}] f:${String(f).padStart(3)} m:${String(m).padStart(3)} i:${String(i).padStart(3)}`);
    }
    console.log(`\n  TOTALS: ${totalF} features, ${totalM} models, ${totalI} integrations`);
    await neo4j.close();
}
main().catch(console.error);
