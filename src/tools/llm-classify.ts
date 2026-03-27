/**
 * llm-classify.ts — Use OpenAI to classify apps in the graph by their
 * features, models, and integrations instead of regex heuristics.
 *
 * Usage:
 *   npx tsx src/tools/llm-classify.ts                  # classify and update
 *   npx tsx src/tools/llm-classify.ts --dry-run        # preview without writing
 *   npx tsx src/tools/llm-classify.ts --update-scanner # emit training-data snippet
 */

import OpenAI from "openai";
import { getNeo4jService } from "../services/neo4j-service.js";

// ─── Known Categories ────────────────────────────────────────────────

const CATEGORIES = [
  "scheduling_platform",
  "ecommerce_platform",
  "crm_platform",
  "notification_platform",
  "chat_platform",
  "auth_platform",
  "analytics_platform",
  "email_marketing_platform",
  "secrets_management",
  "workflow_automation",
  "background_jobs_platform",
  "project_management",
  "document_platform",
  "survey_platform",
  "api_tool",
  "ai_chat_platform",
  "finance_dashboard",
  "marketplace",
  "internal_ops_tool",
  "customer_portal",
] as const;

type AppCategory = (typeof CATEGORIES)[number];

// ─── CLI Flags ───────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const UPDATE_SCANNER = process.argv.includes("--update-scanner");

// ─── Types ───────────────────────────────────────────────────────────

interface AppRecord {
  name: string;
  features: string[];
  models: string[];
  integrations: string[];
  techStack: string | null;
  currentClass: string | null;
}

// ─── Neo4j Queries ───────────────────────────────────────────────────

async function loadApps(): Promise<AppRecord[]> {
  const neo4j = getNeo4jService();

  const rows = await neo4j.runCypher(`
    MATCH (a:LearnedApp)
    OPTIONAL MATCH (a)-[:HAS_FEATURE]->(f)
    OPTIONAL MATCH (a)-[:HAS_MODEL]->(m)
    OPTIONAL MATCH (a)-[:INTEGRATES_WITH]->(i)
    WITH a,
         collect(DISTINCT f.name) AS features,
         collect(DISTINCT m.name) AS models,
         collect(DISTINCT i.name) AS integrations
    RETURN a.name          AS name,
           a.app_class     AS currentClass,
           a.tech_stack    AS techStack,
           features,
           models,
           integrations
    ORDER BY a.name
  `);

  return rows.map((r: any) => ({
    name: r.name,
    features: (r.features ?? []).filter(Boolean).slice(0, 20),
    models: (r.models ?? []).filter(Boolean).slice(0, 10),
    integrations: (r.integrations ?? []).filter(Boolean).slice(0, 10),
    techStack: r.techStack ?? null,
    currentClass: r.currentClass ?? null,
  }));
}

// ─── Summary Builder ─────────────────────────────────────────────────

function buildSummary(app: AppRecord): string {
  const lines: string[] = [`App: ${app.name}`];

  if (app.features.length > 0) {
    lines.push(`Features: ${app.features.join(", ")}`);
  }
  if (app.models.length > 0) {
    lines.push(`Data models: ${app.models.join(", ")}`);
  }
  if (app.integrations.length > 0) {
    lines.push(`Integrations: ${app.integrations.join(", ")}`);
  }
  if (app.techStack) {
    lines.push(`Tech stack: ${app.techStack}`);
  }

  return lines.join("\n");
}

// ─── OpenAI Classification ──────────────────────────────────────────

async function classifyApp(
  client: OpenAI,
  app: AppRecord,
): Promise<AppCategory | null> {
  const summary = buildSummary(app);

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `You are a software classifier. Given an app's features, data models, and integrations, classify it into exactly one category. Respond with ONLY the category slug, nothing else. Categories: ${CATEGORIES.join(", ")}`,
      },
      { role: "user", content: summary },
    ],
    temperature: 0,
    max_tokens: 50,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  const normalized = raw.toLowerCase().replace(/[^a-z_]/g, "");

  if (CATEGORIES.includes(normalized as AppCategory)) {
    return normalized as AppCategory;
  }

  console.warn(
    `  [warn] Unrecognized classification "${raw}" for ${app.name}, skipping`,
  );
  return null;
}

// ─── Neo4j Update ────────────────────────────────────────────────────

async function updateAppClass(
  name: string,
  appClass: string,
): Promise<void> {
  const neo4j = getNeo4jService();
  await neo4j.runCypher(
    `MATCH (a:LearnedApp {name: $name})
     SET a.app_class = $cls, a.classified_by = "llm"
     RETURN a.name`,
    { name, cls: appClass },
  );
}

// ─── Update-Scanner Output ───────────────────────────────────────────

function emitScannerSnippet(
  results: Array<{ name: string; classification: string }>,
): void {
  console.log("\n// ─── Generated classifyApp training data ───");
  console.log("// Paste this into your classifyApp function or lookup table.\n");
  console.log("const LLM_CLASSIFICATIONS: Record<string, string> = {");
  for (const { name, classification } of results) {
    console.log(`  ${JSON.stringify(name)}: ${JSON.stringify(classification)},`);
  }
  console.log("};\n");

  console.log("// Usage in classifyApp:");
  console.log("// function classifyApp(appName: string, features: string[]): string {");
  console.log("//   if (LLM_CLASSIFICATIONS[appName]) return LLM_CLASSIFICATIONS[appName];");
  console.log("//   // ...fall back to regex logic...");
  console.log("// }");
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Error: OPENAI_API_KEY environment variable is required.");
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const neo4j = getNeo4jService();
  await neo4j.connect();

  console.log(DRY_RUN ? "[dry-run] Loading apps...\n" : "Loading apps...\n");

  const apps = await loadApps();
  console.log(`Found ${apps.length} apps to classify.\n`);

  if (apps.length === 0) {
    console.log("No apps found. Exiting.");
    await neo4j.close();
    return;
  }

  const results: Array<{ name: string; classification: string; previous: string | null }> = [];
  let classified = 0;
  let skipped = 0;
  let changed = 0;

  for (const app of apps) {
    process.stdout.write(`  Classifying "${app.name}"... `);

    const category = await classifyApp(client, app);

    if (!category) {
      skipped++;
      console.log("skipped (unrecognized response)");
      continue;
    }

    classified++;
    const isChanged = category !== app.currentClass;
    if (isChanged) changed++;

    const marker = isChanged ? " [CHANGED]" : "";
    console.log(
      `${category}${marker}${app.currentClass ? ` (was: ${app.currentClass})` : ""}`,
    );

    results.push({
      name: app.name,
      classification: category,
      previous: app.currentClass,
    });

    if (!DRY_RUN && isChanged) {
      await updateAppClass(app.name, category);
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────

  console.log("\n─── Summary ───");
  console.log(`  Total apps:    ${apps.length}`);
  console.log(`  Classified:    ${classified}`);
  console.log(`  Changed:       ${changed}`);
  console.log(`  Skipped:       ${skipped}`);
  if (DRY_RUN) {
    console.log("  Mode:          DRY RUN (no graph updates written)");
  }

  // ─── Update-Scanner Output ───────────────────────────────────────

  if (UPDATE_SCANNER && results.length > 0) {
    emitScannerSnippet(results);
  }

  await neo4j.close();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
