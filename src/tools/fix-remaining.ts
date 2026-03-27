import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();

  const fixes: [string, string][] = [
    ["@lobehub/lobehub", "ai_chat_platform"],
    ["formbricks", "survey_platform"],
    ["hoppscotch-app", "api_tool"],
    ["plane", "project_management"],
    ["midday", "finance_dashboard"],
    ["@documenso/root", "document_platform"],
    ["timelish", "scheduling_platform"],
  ];

  for (const [name, cls] of fixes) {
    await neo4j.runCypher(
      `MATCH (a:LearnedApp {name: $name}) SET a.app_class = $cls RETURN a.name`,
      { name, cls },
    );
    console.log(`  ✅ ${name} → ${cls}`);
  }

  // Rename @documenso/root → documenso
  await neo4j.runCypher(`
    MATCH (a:LearnedApp {name: "@documenso/root"}) SET a.name = "documenso" RETURN a.name
  `);
  console.log("  ✅ @documenso/root → documenso");

  // Rename @lobehub/lobehub → lobechat
  await neo4j.runCypher(`
    MATCH (a:LearnedApp {name: "@lobehub/lobehub"}) SET a.name = "lobechat" RETURN a.name
  `);
  console.log("  ✅ @lobehub/lobehub → lobechat");

  await neo4j.close();
}
main().catch(console.error);
