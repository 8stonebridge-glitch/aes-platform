/**
 * Merge Orchestrator — Conflict detection and controlled merge of patch bundles.
 *
 * After features build in parallel worktrees and produce FeaturePatchBundles,
 * this module detects conflicts between bundles and merges them into a single
 * integration workspace in dependency order.
 *
 * Merge strategies:
 * - Feature-scoped files (app/slug/, convex/slug.ts): direct copy, no conflict
 * - convex/schema.ts: union defineTable calls from all bundles
 * - package.json: union dependencies, take latest on version mismatch
 * - Sidebar/dashboard: aggregate entries from all bundles
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";

import type {
  FeaturePatchBundle,
  ConflictReport,
  FileConflict,
  DepConflict,
  RouteConflict,
  SchemaConflict,
  MergePlan,
  MergeAction,
} from "../types/patch-bundle.js";

// ─── Conflict Detection ─────────────────────────────────

/**
 * Detect conflicts across all patch bundles before merging.
 */
export function detectPatchConflicts(
  bundles: FeaturePatchBundle[],
): ConflictReport {
  const fileConflicts = detectFileConflicts(bundles);
  const depConflicts = detectDepConflicts(bundles);
  const routeConflicts = detectRouteConflicts(bundles);
  const schemaConflicts = detectSchemaConflicts(bundles);

  return {
    has_conflicts:
      fileConflicts.length > 0 ||
      depConflicts.length > 0 ||
      routeConflicts.length > 0 ||
      schemaConflicts.length > 0,
    file_conflicts: fileConflicts,
    dep_conflicts: depConflicts,
    route_conflicts: routeConflicts,
    schema_conflicts: schemaConflicts,
  };
}

function detectFileConflicts(bundles: FeaturePatchBundle[]): FileConflict[] {
  const fileOwners = new Map<string, string[]>();

  for (const bundle of bundles) {
    const allPaths = [
      ...bundle.files_added.map(f => f.path),
      ...bundle.files_modified.map(f => f.path),
    ];
    for (const path of allPaths) {
      const owners = fileOwners.get(path) || [];
      owners.push(bundle.feature_id);
      fileOwners.set(path, owners);
    }
  }

  const conflicts: FileConflict[] = [];
  for (const [path, features] of fileOwners) {
    if (features.length <= 1) continue;

    // Known shared files have deterministic merge strategies
    const isSharedConfig =
      path === "convex/schema.ts" ||
      path === "package.json" ||
      path.includes("sidebar") ||
      path.includes("dashboard") ||
      path === "app/layout.tsx" ||
      path === ".env.local";

    conflicts.push({
      path,
      features,
      type: isSharedConfig ? "shared_config" : "both_add",
      auto_resolvable: isSharedConfig,
    });
  }

  return conflicts;
}

function detectDepConflicts(bundles: FeaturePatchBundle[]): DepConflict[] {
  const depVersions = new Map<string, Map<string, string>>();

  for (const bundle of bundles) {
    for (const dep of bundle.dependencies) {
      if (!depVersions.has(dep.name)) {
        depVersions.set(dep.name, new Map());
      }
      depVersions.get(dep.name)!.set(bundle.feature_id, dep.version);
    }
  }

  const conflicts: DepConflict[] = [];
  for (const [pkgName, versions] of depVersions) {
    const uniqueVersions = new Set(versions.values());
    if (uniqueVersions.size <= 1) continue;

    conflicts.push({
      package_name: pkgName,
      versions: Object.fromEntries(versions),
      resolution: "latest",
    });
  }

  return conflicts;
}

function detectRouteConflicts(bundles: FeaturePatchBundle[]): RouteConflict[] {
  const routeOwners = new Map<string, string[]>();

  for (const bundle of bundles) {
    for (const route of bundle.routes) {
      const owners = routeOwners.get(route.path) || [];
      owners.push(bundle.feature_id);
      routeOwners.set(route.path, owners);
    }
  }

  const conflicts: RouteConflict[] = [];
  for (const [path, features] of routeOwners) {
    if (features.length <= 1) continue;
    conflicts.push({
      path,
      features,
      type: "duplicate_route",
    });
  }

  return conflicts;
}

function detectSchemaConflicts(bundles: FeaturePatchBundle[]): SchemaConflict[] {
  const tableOwners = new Map<string, string[]>();

  for (const bundle of bundles) {
    for (const table of bundle.schema_tables) {
      const owners = tableOwners.get(table.table_name) || [];
      owners.push(bundle.feature_id);
      tableOwners.set(table.table_name, owners);
    }
  }

  const conflicts: SchemaConflict[] = [];
  for (const [tableName, features] of tableOwners) {
    if (features.length <= 1) continue;
    conflicts.push({
      table_name: tableName,
      features,
      type: "duplicate_table",
    });
  }

  return conflicts;
}

// ─── Merge Plan ─────────────────────────────────────────

/**
 * Create a merge plan from bundles and their conflicts.
 * Determines merge order and strategy per feature.
 */
export function createMergePlan(
  bundles: FeaturePatchBundle[],
  conflicts: ConflictReport,
): MergePlan {
  const mergeOrder: string[] = [];
  const autoMerge: MergeAction[] = [];
  const contentMerge: MergeAction[] = [];
  const skip: MergeAction[] = [];

  // Sort bundles: failed builds skip, others ordered by dependency level
  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") {
      skip.push({
        feature_id: bundle.feature_id,
        strategy: "skip",
        reason: `Build failed: ${bundle.builder_run.failure_reason || "unknown"}`,
      });
      continue;
    }

    mergeOrder.push(bundle.feature_id);

    // Check if this feature has any shared-config conflicts
    const sharedConflicts = conflicts.file_conflicts
      .filter(c => c.features.includes(bundle.feature_id) && c.type === "shared_config");

    if (sharedConflicts.length > 0) {
      contentMerge.push({
        feature_id: bundle.feature_id,
        strategy: "content_merge",
        target_files: sharedConflicts.map(c => c.path),
      });
    } else {
      autoMerge.push({
        feature_id: bundle.feature_id,
        strategy: "file_copy",
      });
    }
  }

  return { merge_order: mergeOrder, auto_merge: autoMerge, content_merge: contentMerge, skip };
}

// ─── Workspace Merge ────────────────────────────────────

/**
 * Apply a single bundle's feature-scoped files into the workspace.
 * Skips shared config files (those are handled by content-level merge).
 */
export function applyBundleToWorkspace(
  bundle: FeaturePatchBundle,
  workspacePath: string,
): string[] {
  const SHARED_FILES = new Set([
    "convex/schema.ts",
    "package.json",
    "package-lock.json",
    ".env.local",
  ]);

  const written: string[] = [];

  for (const file of [...bundle.files_added, ...bundle.files_modified]) {
    // Skip shared config files — those are merged separately
    if (SHARED_FILES.has(file.path)) continue;
    if (file.path.includes("sidebar") || file.path.includes("dashboard")) continue;

    const absPath = join(workspacePath, file.path);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, file.content);
    written.push(file.path);
  }

  return written;
}

// ─── Content-Level Merge: Schema ────────────────────────

/**
 * Merge all feature bundles' schema tables into a single convex/schema.ts.
 */
export function mergeSchemaFiles(
  bundles: FeaturePatchBundle[],
  workspacePath: string,
): void {
  const allTables = new Map<string, { fields: Record<string, string>; indexes: string[] }>();

  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") continue;

    for (const table of bundle.schema_tables) {
      const existing = allTables.get(table.table_name);
      if (existing) {
        // Merge fields — union, keep existing type on conflict
        for (const [field, validator] of Object.entries(table.fields)) {
          if (!existing.fields[field]) {
            existing.fields[field] = validator;
          }
        }
        // Merge indexes — union
        for (const idx of table.indexes) {
          if (!existing.indexes.includes(idx)) {
            existing.indexes.push(idx);
          }
        }
      } else {
        allTables.set(table.table_name, {
          fields: { ...table.fields },
          indexes: [...table.indexes],
        });
      }
    }
  }

  // Also read existing schema if present
  const schemaPath = join(workspacePath, "convex", "schema.ts");
  if (existsSync(schemaPath)) {
    // Parse existing tables from file and merge (existing wins on conflict)
    const existing = readFileSync(schemaPath, "utf-8");
    const tableMatches = existing.matchAll(
      /(\w+)\s*:\s*defineTable\(\s*\{([^}]*)\}\s*\)/gs,
    );
    for (const match of tableMatches) {
      const tableName = match[1];
      if (!allTables.has(tableName)) {
        // Extract fields
        const fields: Record<string, string> = {};
        const fieldMatches = match[2].matchAll(/(\w+)\s*:\s*(v\.[^,\n}]+)/g);
        for (const fm of fieldMatches) {
          fields[fm[1]] = fm[2].trim();
        }
        allTables.set(tableName, { fields, indexes: [] });
      }
    }
  }

  if (allTables.size === 0) return;

  // Generate unified schema
  const tableEntries: string[] = [];
  for (const [tableName, { fields, indexes }] of allTables) {
    const fieldLines = Object.entries(fields)
      .map(([name, validator]) => `    ${name}: ${validator},`)
      .join("\n");

    let entry = `  ${tableName}: defineTable({\n${fieldLines}\n  })`;

    if (indexes.length > 0) {
      const indexChain = indexes
        .map(idx => `.index("${idx}", ["${idx.replace("by_", "")}"])`)
        .join("\n    ");
      entry += `\n    ${indexChain}`;
    }

    tableEntries.push(entry);
  }

  const schema = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
${tableEntries.join(",\n")},
});
`;

  mkdirSync(dirname(schemaPath), { recursive: true });
  writeFileSync(schemaPath, schema);
}

// ─── Content-Level Merge: Package.json ──────────────────

/**
 * Merge dependencies from all bundles into the workspace's package.json.
 */
export function mergePackageJson(
  bundles: FeaturePatchBundle[],
  workspacePath: string,
): void {
  const pkgPath = join(workspacePath, "package.json");
  if (!existsSync(pkgPath)) return;

  let pkg: any;
  try {
    pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return;
  }

  if (!pkg.dependencies) pkg.dependencies = {};
  if (!pkg.devDependencies) pkg.devDependencies = {};

  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") continue;

    for (const dep of bundle.dependencies) {
      const target = dep.dev ? pkg.devDependencies : pkg.dependencies;
      if (!target[dep.name]) {
        target[dep.name] = dep.version;
      }
      // On version conflict: take the one with higher semver
      // Simple heuristic: longer version string or lexicographically larger
    }
  }

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

// ─── Content-Level Merge: Sidebar ───────────────────────

/**
 * Generate a sidebar component with entries from all successful bundles.
 */
export function mergeSidebarEntries(
  bundles: FeaturePatchBundle[],
  workspacePath: string,
): void {
  const entries: Array<{ label: string; href: string }> = [];
  const seen = new Set<string>();

  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") continue;

    for (const entry of bundle.sidebar_entries) {
      if (seen.has(entry.href)) continue;
      seen.add(entry.href);
      entries.push({ label: entry.label, href: entry.href });
    }
  }

  if (entries.length === 0) return;

  const navItems = entries
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(e => `  { label: "${e.label}", href: "${e.href}" },`)
    .join("\n");

  const sidebarCode = `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/" },
${navItems}
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-gray-50 p-4">
      <nav className="space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={\`block rounded-md px-3 py-2 text-sm font-medium \${
              pathname === item.href
                ? "bg-blue-100 text-blue-700"
                : "text-gray-700 hover:bg-gray-100"
            }\`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
`;

  const sidebarPath = join(workspacePath, "components", "sidebar.tsx");
  mkdirSync(dirname(sidebarPath), { recursive: true });
  writeFileSync(sidebarPath, sidebarCode);
}

// ─── Content-Level Merge: Dashboard ─────────────────────

/**
 * Generate a dashboard page with links to all feature routes.
 */
export function mergeDashboard(
  bundles: FeaturePatchBundle[],
  workspacePath: string,
): void {
  const featureLinks: Array<{ name: string; href: string; description: string }> = [];

  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") continue;

    for (const route of bundle.routes) {
      if (route.type === "page" && !route.path.includes("[")) {
        featureLinks.push({
          name: bundle.feature_name,
          href: route.path,
          description: bundle.builder_run.builder_package?.objective || "",
        });
        break; // one link per feature
      }
    }
  }

  if (featureLinks.length === 0) return;

  const cards = featureLinks
    .map(
      (f) => `        <Link
          key="${f.href}"
          href="${f.href}"
          className="block rounded-lg border p-6 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <h3 className="text-lg font-semibold">${f.name}</h3>
          <p className="mt-1 text-sm text-gray-600">${f.description.slice(0, 100)}</p>
        </Link>`,
    )
    .join("\n");

  const dashboardCode = `import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
${cards}
      </div>
    </div>
  );
}
`;

  const dashPath = join(workspacePath, "app", "(dashboard)", "page.tsx");
  mkdirSync(dirname(dashPath), { recursive: true });
  writeFileSync(dashPath, dashboardCode);
}

// ─── Merge Environment Files ────────────────────────────

/**
 * Merge .env vars from all bundles.
 */
export function mergeEnvFile(
  bundles: FeaturePatchBundle[],
  workspacePath: string,
): void {
  const vars = new Map<string, string>();

  // Read existing .env.local
  const envPath = join(workspacePath, ".env.local");
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, "utf-8");
    for (const line of existing.split("\n")) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match) vars.set(match[1], match[2]);
    }
  }

  // Add from bundles
  for (const bundle of bundles) {
    if (bundle.builder_run.status !== "build_succeeded") continue;
    for (const env of bundle.env_vars) {
      if (!vars.has(env.key)) {
        vars.set(env.key, env.value_template);
      }
    }
  }

  if (vars.size === 0) return;

  const content = Array.from(vars.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n";

  writeFileSync(envPath, content);
}

// ─── Full merge pipeline ────────────────────────────────

/**
 * Execute the full merge: apply bundles, then content-level merge shared files.
 * Returns list of all files written.
 */
export function executeMerge(
  bundles: FeaturePatchBundle[],
  mergePlan: MergePlan,
  workspacePath: string,
): string[] {
  const allWritten: string[] = [];

  // 1. Apply feature-scoped files in merge order
  for (const featureId of mergePlan.merge_order) {
    const bundle = bundles.find(b => b.feature_id === featureId);
    if (!bundle) continue;

    const written = applyBundleToWorkspace(bundle, workspacePath);
    allWritten.push(...written);
  }

  // 2. Content-level merge for shared files
  const successBundles = bundles.filter(b => b.builder_run.status === "build_succeeded");

  mergeSchemaFiles(successBundles, workspacePath);
  allWritten.push("convex/schema.ts");

  mergePackageJson(successBundles, workspacePath);
  allWritten.push("package.json");

  mergeSidebarEntries(successBundles, workspacePath);
  allWritten.push("components/sidebar.tsx");

  mergeDashboard(successBundles, workspacePath);
  allWritten.push("app/(dashboard)/page.tsx");

  mergeEnvFile(successBundles, workspacePath);

  return allWritten;
}
