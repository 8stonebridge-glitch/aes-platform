#!/usr/bin/env npx tsx
/**
 * Run the Layer 4 Composition Validator against a portal workspace.
 *
 * Usage:
 *   npx tsx scripts/run-composition-check.ts [portal-dir]
 *
 * If no portal-dir is given, runs against a synthetic sample to demonstrate output.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { validateComposition } from "../src/validators/composition-validator.js";

const portalDir = process.argv[2];

function collectTsxFiles(dir: string): { path: string; content: string }[] {
  const results: { path: string; content: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
      results.push(...collectTsxFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") || entry.name.endsWith(".jsx")) {
      const relative = path.relative(dir, fullPath);
      results.push({ path: relative, content: fs.readFileSync(fullPath, "utf-8") });
    }
  }
  return results;
}

// Default feature names from the approval portal spec
const APPROVAL_PORTAL_FEATURES = [
  "Dashboard",
  "Request Submission",
  "Review Queue",
  "Detail",
  "Audit Trail",
  "Role Selection",
];

let files: { path: string; content: string }[];

if (portalDir && fs.existsSync(portalDir)) {
  console.log(`\n📂 Scanning portal directory: ${portalDir}\n`);
  files = collectTsxFiles(portalDir);
  console.log(`   Found ${files.length} TSX/JSX files\n`);
} else {
  console.log("\n⚠️  No portal directory provided or found. Running with synthetic sample.\n");
  console.log("   Usage: npx tsx scripts/run-composition-check.ts /path/to/portal\n");

  // Synthetic sample: a minimal dashboard missing several things
  files = [
    {
      path: "app/page.tsx",
      content: `
        import { Card, Button } from "@aes/ui";
        export default function Dashboard() {
          return (
            <div>
              <h1>Welcome</h1>
              <Card>Some content</Card>
              <Button>Create New</Button>
            </div>
          );
        }
      `,
    },
    {
      path: "app/(dashboard)/review-queue/page.tsx",
      content: `
        import { Table, TableHeader, TableBody, TableRow, Button, Badge } from "@aes/ui";
        export default function ReviewQueue() {
          return (
            <div>
              <h1 className="text-2xl font-bold">Review Queue</h1>
              <Table>
                <TableHeader><th>Title</th><th>Status</th></TableHeader>
                <TableBody>
                  <TableRow><td>Item 1</td><td><Badge>pending</Badge></td><td><Button onClick={() => {}}>View</Button></td></TableRow>
                </TableBody>
              </Table>
            </div>
          );
        }
      `,
    },
  ];
}

const result = validateComposition(files, APPROVAL_PORTAL_FEATURES);

// ─── Print Results ────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════");
console.log("  LAYER 4 — COMPOSITION VALIDATOR RESULTS");
console.log("═══════════════════════════════════════════════════════════\n");

const verdictColor = result.verdict === "PASS" ? "✅" : result.verdict === "PASS_WITH_CONCERNS" ? "⚠️" : "❌";
console.log(`  Verdict:  ${verdictColor} ${result.verdict}`);
console.log(`  Score:    ${(result.score * 100).toFixed(1)}%\n`);

console.log("  Stats:");
console.log(`    Patterns checked:    ${result.stats.patterns_checked}`);
console.log(`    Sections:            ${result.stats.sections_found}/${result.stats.sections_required}`);
console.log(`    States:              ${result.stats.states_found}/${result.stats.states_required}`);
console.log(`    Interactions:        ${result.stats.interactions_found}/${result.stats.interactions_required}`);
console.log(`    Richness:            ${result.stats.richness_passed}/${result.stats.richness_total}`);
console.log();

if (result.violations.length > 0) {
  console.log("  Violations:\n");

  const byCategory = new Map<string, typeof result.violations>();
  for (const v of result.violations) {
    const key = v.category;
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(v);
  }

  for (const [category, violations] of byCategory) {
    const label = category.toUpperCase();
    console.log(`  ── ${label} ${"─".repeat(50 - label.length)}`);
    for (const v of violations) {
      const icon = v.severity === "error" ? "❌" : "⚠️";
      console.log(`    ${icon} [${v.pattern}] ${v.check}`);
      console.log(`       ${v.description}`);
      console.log(`       File: ${v.file}`);
    }
    console.log();
  }
} else {
  console.log("  ✅ No violations found.\n");
}

console.log("═══════════════════════════════════════════════════════════\n");

// Exit with non-zero if FAIL
if (result.verdict === "FAIL") {
  process.exit(1);
}
