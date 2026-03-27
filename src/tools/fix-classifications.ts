/**
 * fix-classifications.ts — Fix misclassified app_class values in the graph.
 */
import { getNeo4jService } from "../services/neo4j-service.js";

const FIXES: Record<string, string> = {
  // Correct misclassifications from the batch scan
  "rocket.chat": "chat_platform",
  "twenty": "crm_platform",
  "root": "ecommerce_platform",           // medusa monorepo root → ecommerce
  "@logto/root": "auth_platform",
  "n8n-monorepo": "workflow_automation",
  "plunk": "email_marketing_platform",
  "umami": "analytics_platform",
  "infisical": "secrets_management",
  "infisical-learn": "secrets_management",
};

async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();

  for (const [name, correctClass] of Object.entries(FIXES)) {
    const result = await neo4j.runCypher(
      `MATCH (a:LearnedApp {name: $name})
       SET a.app_class = $cls
       RETURN a.name AS name, a.app_class AS cls`,
      { name, cls: correctClass },
    );
    if (result.length > 0) {
      console.log(`  ✅ ${name} → ${correctClass}`);
    } else {
      console.log(`  ⏭️  ${name} not found, skipping`);
    }
  }

  // Also fix the "root" node name to "medusa" if it's the ecommerce one
  // Check if "root" has ecommerce-related features
  const rootCheck = await neo4j.runCypher(`
    MATCH (a:LearnedApp {name: "root"})
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    RETURN a.source_url AS url, count(f) AS fc
  `);
  for (const r of rootCheck) {
    console.log(`  ℹ️  "root" node: url=${r.url}, features=${typeof r.fc === "object" ? r.fc.low : r.fc}`);
  }

  // Rename "root" to "medusa" if it came from medusa
  await neo4j.runCypher(
    `MATCH (a:LearnedApp {name: "root"})
     WHERE a.source_url CONTAINS "medusa" OR a.source_path CONTAINS "medusa"
     SET a.name = "medusa"
     RETURN a.name`,
  );

  // Rename "n8n-monorepo" to "n8n"
  await neo4j.runCypher(
    `MATCH (a:LearnedApp {name: "n8n-monorepo"})
     SET a.name = "n8n"
     RETURN a.name`,
  );

  // Rename "@logto/root" to "logto"
  await neo4j.runCypher(
    `MATCH (a:LearnedApp {name: "@logto/root"})
     SET a.name = "logto"
     RETURN a.name`,
  );

  console.log(`\n  Done. Reclassified and renamed.\n`);
  await neo4j.close();
}

main().catch(console.error);
