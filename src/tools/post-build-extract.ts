/**
 * post-build-extract.ts — Extract knowledge from builder output back into the graph.
 *
 * After every successful build, this tool analyzes the BuilderRunRecord
 * and writes discovered patterns, models, integrations, and features
 * back into the Neo4j knowledge graph as BuildExtracted* nodes.
 *
 * This creates a feedback loop: the graph grows with every build,
 * compounding the system's knowledge over time.
 *
 * Usage:
 *   Called automatically after build verification passes.
 *   Can also be run standalone:
 *     npx tsx src/tools/post-build-extract.ts <run-record.json>
 */

import { getNeo4jService } from "../services/neo4j-service.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";

// ═══════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface ExtractedKnowledge {
  extractionId: string;
  runId: string;
  featureName: string;
  extractedAt: string;

  /** Tech signals found in created files */
  techSignals: TechSignal[];
  /** Data models inferred from file names and paths */
  inferredModels: InferredModel[];
  /** Integration signals from file names */
  inferredIntegrations: InferredIntegration[];
  /** Patterns detected from file structure */
  detectedPatterns: DetectedPattern[];
  /** Build outcome metadata */
  buildOutcome: BuildOutcome;
}

interface TechSignal {
  name: string;
  category: "framework" | "database" | "styling" | "testing" | "api" | "auth" | "state" | "other";
  evidence: string;
}

interface InferredModel {
  name: string;
  source: string; // file that suggests this model
  category: string;
}

interface InferredIntegration {
  name: string;
  type: string;
  evidence: string;
}

interface DetectedPattern {
  name: string;
  type: string;
  evidence: string;
}

interface BuildOutcome {
  status: string;
  filesCreated: number;
  filesModified: number;
  testsRun: number;
  testsPassed: number;
  checksPassed: string[];
  checksFailed: string[];
  durationMs: number;
  builderModel: string;
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRACTION RULES
// ═══════════════════════════════════════════════════════════════════════

const FILE_PATTERN_RULES: { pattern: RegExp; signal: (match: string) => TechSignal | null }[] = [
  // Frameworks
  { pattern: /\.tsx?$/, signal: () => ({ name: "TypeScript", category: "framework", evidence: "TypeScript files" }) },
  { pattern: /next\.config/, signal: () => ({ name: "Next.js", category: "framework", evidence: "next.config" }) },
  { pattern: /convex\//, signal: () => ({ name: "Convex", category: "database", evidence: "convex/ directory" }) },
  { pattern: /prisma\//, signal: () => ({ name: "Prisma", category: "database", evidence: "prisma/ directory" }) },
  { pattern: /drizzle/, signal: () => ({ name: "Drizzle", category: "database", evidence: "drizzle files" }) },

  // Styling
  { pattern: /tailwind/, signal: () => ({ name: "Tailwind CSS", category: "styling", evidence: "tailwind config/usage" }) },
  { pattern: /\.module\.css/, signal: () => ({ name: "CSS Modules", category: "styling", evidence: ".module.css files" }) },

  // Testing
  { pattern: /\.test\.|\.spec\./, signal: () => ({ name: "Tests", category: "testing", evidence: "test files created" }) },
  { pattern: /playwright/, signal: () => ({ name: "Playwright", category: "testing", evidence: "playwright files" }) },
  { pattern: /vitest|jest/, signal: () => ({ name: "Unit Tests", category: "testing", evidence: "vitest/jest config" }) },

  // API patterns
  { pattern: /api\//, signal: (m) => ({ name: "API Route", category: "api", evidence: m }) },
  { pattern: /trpc/, signal: () => ({ name: "tRPC", category: "api", evidence: "tRPC files" }) },
  { pattern: /graphql/, signal: () => ({ name: "GraphQL", category: "api", evidence: "GraphQL files" }) },

  // Auth
  { pattern: /auth|clerk|middleware/, signal: (m) => ({ name: "Auth", category: "auth", evidence: m }) },

  // State
  { pattern: /store|zustand|redux/, signal: (m) => ({ name: "State Management", category: "state", evidence: m }) },
];

const MODEL_INFERENCE_RULES: { pattern: RegExp; category: string }[] = [
  { pattern: /schema\.(ts|prisma|sql)/, category: "schema" },
  { pattern: /model[s]?\/([\w-]+)/, category: "entity" },
  { pattern: /types?\/([\w-]+)/, category: "type" },
  { pattern: /convex\/([\w-]+)\.ts/, category: "convex_table" },
];

const INTEGRATION_RULES: { pattern: RegExp; type: string }[] = [
  { pattern: /stripe/i, type: "payment" },
  { pattern: /clerk/i, type: "auth" },
  { pattern: /resend|sendgrid|mailgun/i, type: "email" },
  { pattern: /twilio/i, type: "sms" },
  { pattern: /openai|anthropic|gemini/i, type: "ai" },
  { pattern: /s3|cloudinary|uploadthing/i, type: "storage" },
  { pattern: /redis|upstash/i, type: "cache" },
  { pattern: /webhook/i, type: "webhook" },
  { pattern: /oauth|sso/i, type: "auth_provider" },
  { pattern: /cron|queue|inngest/i, type: "background_job" },
];

const PATTERN_RULES: { pattern: RegExp; name: string; type: string }[] = [
  { pattern: /middleware/i, name: "Middleware Pattern", type: "architectural" },
  { pattern: /hook[s]?\//i, name: "Custom Hooks", type: "react" },
  { pattern: /component[s]?\//i, name: "Component Library", type: "ui" },
  { pattern: /layout/i, name: "Layout Pattern", type: "ui" },
  { pattern: /loading|skeleton/i, name: "Loading States", type: "ux" },
  { pattern: /error/i, name: "Error Handling", type: "resilience" },
  { pattern: /\(.*\)\//i, name: "Route Groups", type: "next_routing" },
  { pattern: /server-action|action\.ts/i, name: "Server Actions", type: "next_server" },
  { pattern: /context\//i, name: "Context Provider", type: "react" },
  { pattern: /util[s]?\//i, name: "Utility Layer", type: "architectural" },
  { pattern: /lib\//i, name: "Library Layer", type: "architectural" },
  { pattern: /validator|zod|schema/i, name: "Input Validation", type: "security" },
];

// ═══════════════════════════════════════════════════════════════════════
// EXTRACTION ENGINE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Extract knowledge from a BuilderRunRecord.
 */
export function extractKnowledge(run: BuilderRunRecord): ExtractedKnowledge {
  const allFiles = [...run.files_created, ...run.files_modified];
  const extractionId = `ext-${randomUUID().substring(0, 8)}`;

  // Extract tech signals
  const techSignals: TechSignal[] = [];
  const seenTech = new Set<string>();
  for (const file of allFiles) {
    for (const rule of FILE_PATTERN_RULES) {
      if (rule.pattern.test(file)) {
        const signal = rule.signal(file);
        if (signal && !seenTech.has(signal.name)) {
          seenTech.add(signal.name);
          techSignals.push(signal);
        }
      }
    }
  }

  // Infer data models
  const inferredModels: InferredModel[] = [];
  const seenModels = new Set<string>();
  for (const file of allFiles) {
    for (const rule of MODEL_INFERENCE_RULES) {
      const match = file.match(rule.pattern);
      if (match) {
        const name = match[1] || file.split("/").pop()?.replace(/\.\w+$/, "") || file;
        const cleanName = name.charAt(0).toUpperCase() + name.slice(1);
        if (!seenModels.has(cleanName) && cleanName.length > 2) {
          seenModels.add(cleanName);
          inferredModels.push({ name: cleanName, source: file, category: rule.category });
        }
      }
    }
  }

  // Infer integrations
  const inferredIntegrations: InferredIntegration[] = [];
  const seenInteg = new Set<string>();
  for (const file of allFiles) {
    for (const rule of INTEGRATION_RULES) {
      if (rule.pattern.test(file) && !seenInteg.has(rule.type)) {
        seenInteg.add(rule.type);
        const name = file.match(rule.pattern)?.[0] || rule.type;
        inferredIntegrations.push({ name, type: rule.type, evidence: file });
      }
    }
  }

  // Detect patterns
  const detectedPatterns: DetectedPattern[] = [];
  const seenPatterns = new Set<string>();
  for (const file of allFiles) {
    for (const rule of PATTERN_RULES) {
      if (rule.pattern.test(file) && !seenPatterns.has(rule.name)) {
        seenPatterns.add(rule.name);
        detectedPatterns.push({ name: rule.name, type: rule.type, evidence: file });
      }
    }
  }

  // Build outcome
  const testsPassed = run.test_results.filter(t => t.passed).length;
  const checksPassed = (run.check_results || []).filter(c => c.passed).map(c => c.check);
  const checksFailed = (run.check_results || []).filter(c => !c.passed && !c.skipped).map(c => c.check);

  return {
    extractionId,
    runId: run.run_id,
    featureName: run.feature_name,
    extractedAt: new Date().toISOString(),
    techSignals,
    inferredModels,
    inferredIntegrations,
    detectedPatterns,
    buildOutcome: {
      status: run.status,
      filesCreated: run.files_created.length,
      filesModified: run.files_modified.length,
      testsRun: run.test_results.length,
      testsPassed,
      checksPassed,
      checksFailed,
      durationMs: run.duration_ms,
      builderModel: run.builder_model,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
// GRAPH WRITER — persist extracted knowledge to Neo4j
// ═══════════════════════════════════════════════════════════════════════

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Write extracted knowledge to Neo4j as BuildExtracted* nodes.
 * Links back to the source build run for full lineage.
 */
export async function writeExtractionToGraph(
  extraction: ExtractedKnowledge,
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
): Promise<{ nodesCreated: number; relsCreated: number }> {
  let nodesCreated = 0;
  let relsCreated = 0;

  // Create extraction event node
  await neo4jRun(`
    MERGE (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
    SET e.run_id = '${esc(extraction.runId)}',
        e.feature_name = '${esc(extraction.featureName)}',
        e.extracted_at = '${extraction.extractedAt}',
        e.status = '${esc(extraction.buildOutcome.status)}',
        e.files_created = ${extraction.buildOutcome.filesCreated},
        e.files_modified = ${extraction.buildOutcome.filesModified},
        e.tests_passed = ${extraction.buildOutcome.testsPassed},
        e.tests_run = ${extraction.buildOutcome.testsRun},
        e.duration_ms = ${extraction.buildOutcome.durationMs},
        e.builder_model = '${esc(extraction.buildOutcome.builderModel)}'
  `);
  nodesCreated++;

  // Write tech signals
  for (const tech of extraction.techSignals) {
    await neo4jRun(`
      MERGE (t:BuildExtractedTech {name: '${esc(tech.name)}'})
      SET t.category = '${esc(tech.category)}'
      WITH t
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (e)-[:USED_TECH]->(t)
    `);
    nodesCreated++;
    relsCreated++;
  }

  // Write inferred models — also link to existing LearnedDataModel if one exists
  for (const model of extraction.inferredModels) {
    await neo4jRun(`
      MERGE (m:BuildExtractedModel {name: '${esc(model.name)}'})
      SET m.source_file = '${esc(model.source)}',
          m.category = '${esc(model.category)}'
      WITH m
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (e)-[:PRODUCED_MODEL]->(m)
    `);
    nodesCreated++;
    relsCreated++;

    // Link to existing learned model if name matches
    await neo4jRun(`
      MATCH (bm:BuildExtractedModel {name: '${esc(model.name)}'})
      MATCH (lm:LearnedDataModel)
      WHERE toLower(lm.name) = toLower('${esc(model.name)}')
      MERGE (bm)-[:MATCHES_LEARNED]->(lm)
    `);
  }

  // Write inferred integrations
  for (const integ of extraction.inferredIntegrations) {
    await neo4jRun(`
      MERGE (i:BuildExtractedIntegration {name: '${esc(integ.name)}', type: '${esc(integ.type)}'})
      SET i.evidence = '${esc(integ.evidence)}'
      WITH i
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (e)-[:USED_INTEGRATION]->(i)
    `);
    nodesCreated++;
    relsCreated++;
  }

  // Write detected patterns
  for (const pat of extraction.detectedPatterns) {
    await neo4jRun(`
      MERGE (p:BuildExtractedPattern {name: '${esc(pat.name)}'})
      SET p.type = '${esc(pat.type)}',
          p.evidence = '${esc(pat.evidence)}'
      WITH p
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (e)-[:USED_PATTERN]->(p)
    `);
    nodesCreated++;
    relsCreated++;

    // Link to existing learned pattern if name matches
    await neo4jRun(`
      MATCH (bp:BuildExtractedPattern {name: '${esc(pat.name)}'})
      MATCH (lp:LearnedPattern)
      WHERE toLower(lp.name) CONTAINS toLower('${esc(pat.name)}')
      MERGE (bp)-[:MATCHES_LEARNED]->(lp)
    `);
  }

  // Write build outcome checks
  for (const check of extraction.buildOutcome.checksPassed) {
    await neo4jRun(`
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (c:BuildCheck {name: '${esc(check)}'})
      MERGE (e)-[:PASSED_CHECK]->(c)
    `);
  }
  for (const check of extraction.buildOutcome.checksFailed) {
    await neo4jRun(`
      MATCH (e:BuildExtraction {extraction_id: '${esc(extraction.extractionId)}'})
      MERGE (c:BuildCheck {name: '${esc(check)}'})
      MERGE (e)-[:FAILED_CHECK]->(c)
    `);
  }

  return { nodesCreated, relsCreated };
}

// ═══════════════════════════════════════════════════════════════════════
// CLI RUNNER
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    // Demo mode — create a mock BuilderRunRecord
    console.log("Usage: npx tsx src/tools/post-build-extract.ts <run-record.json>");
    console.log("\nRunning demo extraction...\n");

    const mockRun: Partial<BuilderRunRecord> = {
      run_id: "demo-run-001",
      feature_name: "Appointment Booking",
      status: "build_succeeded" as any,
      files_created: [
        "app/booking/page.tsx",
        "app/booking/layout.tsx",
        "app/booking/loading.tsx",
        "app/api/bookings/route.ts",
        "components/booking/BookingForm.tsx",
        "components/booking/TimeSlotPicker.tsx",
        "hooks/useBookings.ts",
        "lib/stripe.ts",
        "convex/bookings.ts",
        "convex/schema.ts",
        "middleware.ts",
        "app/booking/booking.test.ts",
      ],
      files_modified: ["convex/schema.ts", "app/layout.tsx"],
      files_deleted: [],
      test_results: [
        { test_id: "booking-create", passed: true },
        { test_id: "booking-cancel", passed: true },
        { test_id: "stripe-checkout", passed: false, output: "timeout" },
      ],
      check_results: [
        { check: "typecheck", passed: true, output: "", skipped: false },
        { check: "lint", passed: true, output: "", skipped: false },
        { check: "test", passed: false, output: "1 failed", skipped: false },
        { check: "build", passed: true, output: "", skipped: false },
      ],
      duration_ms: 45000,
      builder_model: "claude-sonnet-4-20250514",
    } as any;

    const extraction = extractKnowledge(mockRun as BuilderRunRecord);

    console.log(`${"═".repeat(65)}`);
    console.log(`  POST-BUILD KNOWLEDGE EXTRACTION`);
    console.log(`  Feature: ${extraction.featureName}`);
    console.log(`  Run: ${extraction.runId}`);
    console.log(`${"═".repeat(65)}\n`);

    console.log(`  ▸ TECH SIGNALS (${extraction.techSignals.length}):`);
    for (const t of extraction.techSignals) {
      console.log(`    [${t.category}] ${t.name} — ${t.evidence}`);
    }

    console.log(`\n  ▸ INFERRED MODELS (${extraction.inferredModels.length}):`);
    for (const m of extraction.inferredModels) {
      console.log(`    ${m.name} [${m.category}] ← ${m.source}`);
    }

    console.log(`\n  ▸ INFERRED INTEGRATIONS (${extraction.inferredIntegrations.length}):`);
    for (const i of extraction.inferredIntegrations) {
      console.log(`    ${i.name} [${i.type}] ← ${i.evidence}`);
    }

    console.log(`\n  ▸ DETECTED PATTERNS (${extraction.detectedPatterns.length}):`);
    for (const p of extraction.detectedPatterns) {
      console.log(`    ${p.name} [${p.type}] ← ${p.evidence}`);
    }

    console.log(`\n  ▸ BUILD OUTCOME:`);
    console.log(`    Status: ${extraction.buildOutcome.status}`);
    console.log(`    Files: ${extraction.buildOutcome.filesCreated} created, ${extraction.buildOutcome.filesModified} modified`);
    console.log(`    Tests: ${extraction.buildOutcome.testsPassed}/${extraction.buildOutcome.testsRun} passed`);
    console.log(`    Checks passed: ${extraction.buildOutcome.checksPassed.join(", ") || "none"}`);
    console.log(`    Checks failed: ${extraction.buildOutcome.checksFailed.join(", ") || "none"}`);

    // Write to graph if Neo4j is available
    const neo4j = getNeo4jService();
    const connected = await neo4j.connect();
    if (connected) {
      console.log(`\n  ▸ WRITING TO GRAPH...`);
      const result = await writeExtractionToGraph(extraction, (cypher, params) => neo4j.runCypher(cypher, params));
      console.log(`    ✅ ${result.nodesCreated} nodes, ${result.relsCreated} relationships`);
      await neo4j.close();
    } else {
      console.log(`\n  ⚠️  Neo4j not available — extraction not persisted`);
    }

    console.log(`\n${"═".repeat(65)}\n`);
    return;
  }

  // Load from file
  const { readFileSync } = await import("node:fs");
  const run: BuilderRunRecord = JSON.parse(readFileSync(inputPath, "utf-8"));
  const extraction = extractKnowledge(run);

  const neo4j = getNeo4jService();
  await neo4j.connect();
  const result = await writeExtractionToGraph(extraction, (cypher, params) => neo4j.runCypher(cypher, params));
  console.log(`Extracted: ${extraction.techSignals.length} tech, ${extraction.inferredModels.length} models, ${extraction.inferredIntegrations.length} integrations, ${extraction.detectedPatterns.length} patterns`);
  console.log(`Written: ${result.nodesCreated} nodes, ${result.relsCreated} relationships`);
  await neo4j.close();
}

main().catch(console.error);
