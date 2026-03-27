import { getNeo4jService } from "../services/neo4j-service.js";

async function main() {
  const neo4j = getNeo4jService();
  await neo4j.connect();

  const apps = await neo4j.runCypher(`MATCH (a:LearnedApp) RETURN a.name AS name, a.app_class AS class, a.framework AS framework, a.database AS db, a.orm AS orm, a.api_style AS api, a.total_files AS files, a.total_components AS components, a.total_pages AS pages, a.total_models AS models, a.total_integrations AS integrations, a.total_endpoints AS endpoints, a.total_patterns AS patterns ORDER BY a.total_files DESC`);
  console.log("=== APPS ===");
  console.log(JSON.stringify(apps, null, 2));

  const patFreq = await neo4j.runCypher(`MATCH (p:LearnedPattern) RETURN p.name AS pattern, p.type AS type, count(*) AS app_count ORDER BY app_count DESC LIMIT 30`);
  console.log("\n=== PATTERN FREQUENCY ===");
  console.log(JSON.stringify(patFreq, null, 2));

  const stacks = await neo4j.runCypher(`MATCH (a:LearnedApp) RETURN a.framework AS framework, a.orm AS orm, a.database AS db, count(*) AS count ORDER BY count DESC`);
  console.log("\n=== TECH STACKS ===");
  console.log(JSON.stringify(stacks, null, 2));

  const modelCats = await neo4j.runCypher(`MATCH (m:LearnedDataModel) RETURN m.category AS category, count(*) AS count ORDER BY count DESC`);
  console.log("\n=== DATA MODEL CATEGORIES ===");
  console.log(JSON.stringify(modelCats, null, 2));

  const intTypes = await neo4j.runCypher(`MATCH (i:LearnedIntegration) RETURN i.type AS type, count(*) AS count ORDER BY count DESC`);
  console.log("\n=== INTEGRATION TYPES ===");
  console.log(JSON.stringify(intTypes, null, 2));

  const compCats = await neo4j.runCypher(`MATCH (c:LearnedComponentGroup) RETURN c.name AS category, sum(c.count) AS total ORDER BY total DESC`);
  console.log("\n=== COMPONENT CATEGORIES ===");
  console.log(JSON.stringify(compCats, null, 2));

  const featComp = await neo4j.runCypher(`MATCH (f:LearnedFeature) RETURN f.complexity AS complexity, count(*) AS count ORDER BY count DESC`);
  console.log("\n=== FEATURE COMPLEXITY ===");
  console.log(JSON.stringify(featComp, null, 2));

  const flows = await neo4j.runCypher(`MATCH (uf:LearnedUserFlow) RETURN uf.name AS flow, uf.section AS section, uf.step_count AS steps, uf.source AS app ORDER BY uf.name`);
  console.log("\n=== USER FLOWS ===");
  console.log(JSON.stringify(flows, null, 2));

  const states = await neo4j.runCypher(`MATCH (sp:LearnedStatePattern) RETURN sp.type AS type, count(*) AS count ORDER BY count DESC`);
  console.log("\n=== STATE PATTERNS ===");
  console.log(JSON.stringify(states, null, 2));

  const design = await neo4j.runCypher(`MATCH (a:LearnedApp)-[:HAS_DESIGN_SYSTEM]->(d:LearnedDesignSystem) RETURN a.name AS app, d.css_framework AS css, d.component_library AS lib, d.icon_library AS icons, d.has_dark_mode AS dark, d.color_token_count AS colors`);
  console.log("\n=== DESIGN SYSTEMS ===");
  console.log(JSON.stringify(design, null, 2));

  const topModels = await neo4j.runCypher(`MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel) RETURN a.name AS app, m.name AS model, m.category AS category, m.field_count AS fields, m.relation_count AS relations ORDER BY m.field_count DESC LIMIT 30`);
  console.log("\n=== TOP DATA MODELS ===");
  console.log(JSON.stringify(topModels, null, 2));

  const topIntegrations = await neo4j.runCypher(`MATCH (i:LearnedIntegration) RETURN i.provider AS provider, i.type AS type, i.auth_method AS auth, count(*) AS apps ORDER BY apps DESC LIMIT 20`);
  console.log("\n=== TOP INTEGRATIONS ===");
  console.log(JSON.stringify(topIntegrations, null, 2));

  await neo4j.close();
}

main().catch(console.error);
