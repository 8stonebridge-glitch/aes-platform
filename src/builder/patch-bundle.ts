/**
 * Patch Bundle — Extract structured diff artifacts from isolated worktree builds.
 *
 * After a feature builds in its own git worktree, this module extracts a
 * FeaturePatchBundle: a structured manifest of everything the feature produced
 * (files, deps, routes, schema tables, sidebar entries, provenance).
 *
 * Bundles are the unit of conflict detection, merge ordering, and repair targeting.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";

import {
  getWorktreeChanges,
  type IsolatedWorktree,
} from "./worktree-isolation.js";

import type {
  FeaturePatchBundle,
  PatchFile,
  PatchDependency,
  PatchRoute,
  PatchSchemaTable,
  PatchSidebarEntry,
  PatchProvenance,
} from "../types/patch-bundle.js";
import type { BuilderRunRecord } from "../types/artifacts.js";

// ─── Main extraction ────────────────────────────────────

/**
 * Extract a FeaturePatchBundle from a completed worktree build.
 */
export function generateFeaturePatchBundle(
  worktree: IsolatedWorktree,
  builderRun: BuilderRunRecord,
  buildDurationMs: number,
  buildClass: string,
): FeaturePatchBundle {
  const changes = getWorktreeChanges(worktree);

  const filesAdded = readPatchFiles(worktree.worktree_path, changes.created);
  const filesModified = readPatchFiles(worktree.worktree_path, changes.modified);
  const allFiles = [...filesAdded, ...filesModified];

  const dependencies = extractDependencies(worktree.worktree_path, allFiles);
  const routes = extractRoutes(allFiles);
  const schemaTables = extractSchemaTables(allFiles);
  const sidebarEntries = extractSidebarEntries(builderRun.feature_name || worktree.feature_id, allFiles);
  const testsGenerated = allFiles
    .filter(f => /\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(f.path))
    .map(f => f.path);

  // Conflict surface: files that exist outside the feature's own directory
  const featureSlug = (builderRun.feature_name || "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const conflictSurface = allFiles
    .map(f => f.path)
    .filter(p =>
      !p.includes(`/${featureSlug}/`) &&
      !p.includes(`/${featureSlug}.`) &&
      !p.startsWith(`app/${featureSlug}/`) &&
      !p.startsWith(`convex/${featureSlug}`)
    );

  const provenance = extractProvenance(builderRun);

  return {
    bundle_id: `pb-${worktree.job_id.slice(0, 8)}-${worktree.feature_id.slice(0, 12)}`,
    job_id: worktree.job_id,
    feature_id: worktree.feature_id,
    feature_name: builderRun.feature_name || worktree.feature_id,
    build_class: buildClass,
    files_added: filesAdded,
    files_modified: filesModified,
    dependencies,
    env_vars: [],
    routes,
    schema_tables: schemaTables,
    sidebar_entries: sidebarEntries,
    tests_generated: testsGenerated,
    assumptions: [],
    confidence: computeConfidence(builderRun, filesAdded, testsGenerated),
    conflict_surface: conflictSurface,
    provenance,
    worktree_path: worktree.worktree_path,
    worktree_branch: worktree.branch,
    base_commit: worktree.base_commit,
    build_duration_ms: buildDurationMs,
    builder_run: builderRun,
  };
}

// ─── File reading ───────────────────────────────────────

function readPatchFiles(workspacePath: string, paths: string[]): PatchFile[] {
  const files: PatchFile[] = [];
  for (const p of paths) {
    try {
      const absPath = join(workspacePath, p);
      if (!existsSync(absPath)) continue;
      const content = readFileSync(absPath, "utf-8");
      files.push({
        path: p,
        content,
        size_bytes: Buffer.byteLength(content, "utf-8"),
      });
    } catch {
      // skip unreadable files
    }
  }
  return files;
}

// ─── Dependency extraction ──────────────────────────────

function extractDependencies(
  workspacePath: string,
  _files: PatchFile[],
): PatchDependency[] {
  // Read the worktree's package.json to find added deps
  const pkgPath = join(workspacePath, "package.json");
  if (!existsSync(pkgPath)) return [];

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const deps: PatchDependency[] = [];

    for (const [name, version] of Object.entries(pkg.dependencies || {})) {
      deps.push({ name, version: String(version), dev: false });
    }
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      deps.push({ name, version: String(version), dev: true });
    }
    return deps;
  } catch {
    return [];
  }
}

// ─── Route extraction ───────────────────────────────────

function extractRoutes(files: PatchFile[]): PatchRoute[] {
  const routes: PatchRoute[] = [];
  for (const file of files) {
    // app/feature-slug/page.tsx → /feature-slug
    const pageMatch = file.path.match(/^app\/(.+?)\/page\.(tsx?|jsx?)$/);
    if (pageMatch) {
      routes.push({
        path: `/${pageMatch[1]}`,
        file: file.path,
        type: "page",
      });
    }
    // app/feature-slug/layout.tsx
    const layoutMatch = file.path.match(/^app\/(.+?)\/layout\.(tsx?|jsx?)$/);
    if (layoutMatch) {
      routes.push({
        path: `/${layoutMatch[1]}`,
        file: file.path,
        type: "layout",
      });
    }
    // app/api/feature-slug/route.ts
    const apiMatch = file.path.match(/^app\/api\/(.+?)\/route\.(ts|js)$/);
    if (apiMatch) {
      routes.push({
        path: `/api/${apiMatch[1]}`,
        file: file.path,
        type: "api",
      });
    }
  }
  return routes;
}

// ─── Schema extraction ──────────────────────────────────

function extractSchemaTables(files: PatchFile[]): PatchSchemaTable[] {
  const tables: PatchSchemaTable[] = [];

  for (const file of files) {
    // Only look at convex schema-related files
    if (!file.path.includes("convex/") || !file.path.endsWith(".ts")) continue;
    if (!file.content.includes("defineTable")) continue;

    // Extract defineTable calls
    const tableMatches = file.content.matchAll(
      /(\w+)\s*:\s*defineTable\(\s*\{([^}]*)\}\s*\)/gs,
    );

    for (const match of tableMatches) {
      const tableName = match[1];
      const fieldsBlock = match[2];
      const fields: Record<string, string> = {};
      const indexes: string[] = [];

      // Parse field definitions
      const fieldMatches = fieldsBlock.matchAll(/(\w+)\s*:\s*(v\.\w+\([^)]*\)|v\.\w+\(\))/g);
      for (const fm of fieldMatches) {
        fields[fm[1]] = fm[2];
      }

      // Parse index chains
      const indexMatches = file.content.matchAll(
        new RegExp(`${tableName}[^;]*\\.index\\(["']([^"']+)["']`, "g"),
      );
      for (const im of indexMatches) {
        indexes.push(im[1]);
      }

      tables.push({ table_name: tableName, fields, indexes });
    }
  }

  return tables;
}

// ─── Sidebar extraction ─────────────────────────────────

function extractSidebarEntries(
  featureName: string,
  files: PatchFile[],
): PatchSidebarEntry[] {
  // Extract from route structure — each top-level app route gets a sidebar entry
  const entries: PatchSidebarEntry[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const pageMatch = file.path.match(/^app\/([^/]+)\/page\.(tsx?|jsx?)$/);
    if (pageMatch && !seen.has(pageMatch[1])) {
      const slug = pageMatch[1];
      seen.add(slug);
      entries.push({
        label: slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        href: `/${slug}`,
      });
    }
  }

  // Fallback: if no routes found, create one from feature name
  if (entries.length === 0) {
    const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    entries.push({
      label: featureName,
      href: `/${slug}`,
    });
  }

  return entries;
}

// ─── Provenance extraction ──────────────────────────────

function extractProvenance(run: BuilderRunRecord): PatchProvenance {
  const pkg = run.builder_package as any;
  const graphHints = pkg?.graph_hints;

  return {
    donor_assets_used: graphHints?.proven_models?.map((m: any) => m.name || m.id) || [],
    catalog_templates_used: [],
    graph_patterns_matched: graphHints?.relevant_models?.map((m: any) => m.name || m.id) || [],
    build_path: run.builder_model === "archetype"
      ? "archetype"
      : run.builder_model?.includes("decomposed")
        ? "decomposed"
        : "decomposed", // default for app-builder-v1
  };
}

// ─── Confidence scoring ─────────────────────────────────

function computeConfidence(
  run: BuilderRunRecord,
  files: PatchFile[],
  tests: string[],
): number {
  let score = 50; // base

  // +20 for successful build
  if (run.status === "build_succeeded") score += 20;

  // +10 for having tests
  if (tests.length > 0) score += 10;

  // +10 for verification passed
  if (run.verification_passed) score += 10;

  // +5 for having more than 3 files (complete feature)
  if (files.length >= 3) score += 5;

  // -10 for each scope violation
  score -= (run.scope_violations?.length || 0) * 10;

  // -10 for each constraint violation
  score -= (run.constraint_violations?.length || 0) * 10;

  return Math.max(0, Math.min(100, score));
}
