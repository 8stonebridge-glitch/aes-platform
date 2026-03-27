import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();
  await neo4j.runCypher("MATCH (a:LearnedApp {name: 'typebot-io'}) SET a.app_class = 'form_builder', a.name = 'typebot' RETURN a.name");
  console.log("✅ typebot-io → typebot (form_builder)");
  await neo4j.close();
}
main().catch(console.error);
