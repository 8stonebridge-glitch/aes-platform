/**
 * Patch Bundle Types — Structured artifacts for parallel feature builds.
 *
 * A FeaturePatchBundle captures everything a single feature produced during
 * its isolated build: files, dependencies, routes, schema tables, and
 * provenance metadata. These bundles are the unit of conflict detection,
 * merge ordering, repair targeting, and graph persistence.
 */

import type { BuilderRunRecord } from "./artifacts.js";

// ─── FeaturePatchBundle ─────────────────────────────────

export interface FeaturePatchBundle {
  bundle_id: string;                    // pb-{jobId}-{featureId}
  job_id: string;
  feature_id: string;
  feature_name: string;
  build_class: string;                  // from P0 classification

  // File manifest
  files_added: PatchFile[];
  files_modified: PatchFile[];

  // Structured declarations
  dependencies: PatchDependency[];      // package.json additions
  env_vars: PatchEnvVar[];              // .env additions
  routes: PatchRoute[];                 // app/[slug]/page.tsx registrations
  schema_tables: PatchSchemaTable[];    // convex/schema.ts table definitions
  sidebar_entries: PatchSidebarEntry[]; // Navigation entries

  // Tests
  tests_generated: string[];           // test file paths

  // Quality signals
  assumptions: string[];
  confidence: number;                   // 0-100
  conflict_surface: string[];           // files this feature touches that others might too

  // Provenance
  provenance: PatchProvenance;

  // Build metadata
  worktree_path: string;
  worktree_branch: string;
  base_commit: string;
  build_duration_ms: number;
  builder_run: BuilderRunRecord;
}

export interface PatchFile {
  path: string;                        // relative to workspace root
  content: string;
  size_bytes: number;
}

export interface PatchDependency {
  name: string;
  version: string;
  dev: boolean;
}

export interface PatchEnvVar {
  key: string;
  value_template: string;
  required: boolean;
}

export interface PatchRoute {
  path: string;                        // URL path: /feature-slug
  file: string;                        // app/feature-slug/page.tsx
  type: "page" | "api" | "layout";
}

export interface PatchSchemaTable {
  table_name: string;
  fields: Record<string, string>;      // field → validator string
  indexes: string[];
}

export interface PatchSidebarEntry {
  label: string;
  href: string;
  icon?: string;
}

export interface PatchProvenance {
  donor_assets_used: string[];
  catalog_templates_used: string[];
  graph_patterns_matched: string[];
  build_path: "archetype" | "decomposed" | "monolithic";
}

// ─── BuildPlan ──────────────────────────────────────────

export interface BuildPlan {
  job_id: string;
  app_slug: string;
  app_spec: any;
  feature_tasks: FeatureTask[];
  dependency_levels: string[][];        // [[f1,f2], [f3], [f4,f5]]
  graph_guidance: any;
  worktree_pool: any;
  class_configs: Map<string, any>;
  created_at: string;
}

export interface FeatureTask {
  feature_id: string;
  feature_name: string;
  dependency_level: number;
  build_class: string;
  concurrency_tier: "high" | "medium" | "low";
  dependencies: string[];
  builder_package: any;
}

// ─── MergePlan ──────────────────────────────────────────

export interface MergePlan {
  merge_order: string[];               // feature_ids in merge order
  auto_merge: MergeAction[];
  content_merge: MergeAction[];        // need content-level merge
  skip: MergeAction[];                 // features to skip (failed build)
}

export interface MergeAction {
  feature_id: string;
  strategy: "file_copy" | "content_merge" | "skip";
  target_files?: string[];
  reason?: string;
}

// ─── ConflictReport ─────────────────────────────────────

export interface ConflictReport {
  has_conflicts: boolean;
  file_conflicts: FileConflict[];
  dep_conflicts: DepConflict[];
  route_conflicts: RouteConflict[];
  schema_conflicts: SchemaConflict[];
}

export interface FileConflict {
  path: string;
  features: string[];
  type: "both_add" | "both_modify" | "shared_config";
  auto_resolvable: boolean;
}

export interface DepConflict {
  package_name: string;
  versions: Record<string, string>;    // feature_id → version
  resolution: "latest" | "manual";
}

export interface RouteConflict {
  path: string;
  features: string[];
  type: "duplicate_route" | "nested_conflict";
}

export interface SchemaConflict {
  table_name: string;
  features: string[];
  type: "duplicate_table" | "field_mismatch";
  field_details?: Record<string, string[]>; // field → [feature_ids with different types]
}

// ─── RepairCase ─────────────────────────────────────────

export interface RepairCase {
  case_id: string;
  job_id: string;
  gate_result: VerificationResult;
  suspected_feature_id: string | null;
  error_signature: string;
  graph_matches: GraphRepairMatch[];
  attempts: PatchAttempt[];
  status: "open" | "repaired" | "exhausted" | "escalated";
  max_attempts_per_feature: number;
  max_attempts_total: number;
  created_at: string;
}

export interface GraphRepairMatch {
  node_type: string;
  node_id: string;
  name: string;
  fix_strategy: string;
  success_rate: number;
}

export interface PatchAttempt {
  attempt_id: string;
  attempt_number: number;
  feature_id: string | null;
  repair_source: "deterministic" | "graph" | "llm" | "perplexity";
  files_changed: string[];
  verification_result: VerificationResult | null;
  succeeded: boolean;
  duration_ms: number;
  created_at: string;
}

// ─── VerificationResult ─────────────────────────────────

export interface VerificationResult {
  passed: boolean;
  checks: VerificationCheck[];
  error_message?: string;
  error_file_path?: string;
  error_pattern?: string;
  duration_ms: number;
}

export interface VerificationCheck {
  name: string;
  passed: boolean;
  output?: string;
  duration_ms: number;
}
