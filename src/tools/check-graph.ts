import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();
  const r = await neo4j.runCypher("MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) RETURN a.name AS app, f.name AS feat, f.feature_id AS fid LIMIT 3");
  console.log("Feature join:", JSON.stringify(r, null, 2));
  const r2 = await neo4j.runCypher("MATCH (f:LearnedFeature) RETURN properties(f) AS props LIMIT 1");
  console.log("Feature props:", JSON.stringify(r2, null, 2));
  await neo4j.close();
}
main().catch(console.error);
