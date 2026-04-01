/**
 * Builder-ready artifact compiler.
 * Takes a completed, approved, veto-clean FeatureBridge and produces
 * a BuilderPackage — the exact input a builder agent needs.
 */

import { randomUUID } from "node:crypto";
import { CURRENT_SCHEMA_VERSION } from "./types/artifacts.js";
import type { FeatureBridge } from "./types/artifacts.js";
import type { JobRecord } from "./store.js";
import { CATALOG_ENFORCEMENT_RULES } from "./builder/code-builder.js";
import type { PatternRequirement } from "./types/pattern-requirements.js";

export interface BuilderPackage {
  package_id: string;
  job_id: string;
  bridge_id: string;
  feature_id: string;
  feature_name: string;

  // From bridge
  objective: string;
  included_capabilities: string[];
  excluded_capabilities: string[];

  // Scope
  target_repo: string;
  allowed_write_paths: string[];
  forbidden_paths: string[];
  may_create_files: boolean;
  may_modify_files: boolean;
  may_delete_files: boolean;

  // Reuse
  reuse_assets: { name: string; source_path: string; description: string }[];
  reuse_requirements: { package: string; components: string[] }[];
  // Actual source files fetched from GitHub for reuse as building blocks
  source_files: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>;

  // Pattern requirements (Layer 4 — composition validator expectations)
  pattern_requirements: PatternRequirement[];

  // Catalog enforcement rules (builder instructions)
  catalog_enforcement_rules: string;

  // Rules
  rules: { rule_id: string; title: string; severity: string }[];

  // Tests
  required_tests: { test_id: string; name: string; pass_condition: string }[];

  // Success criteria
  success_definition: {
    user_visible_outcome: string;
    technical_outcome: string;
    validation_requirements: string[];
  };

  // Graph-derived hints — feature-specific intelligence from Neo4j
  graph_hints?: {
    relevant_models: { name: string; fields: string; source: string }[];
    relevant_integrations: { name: string; type: string; description: string }[];
    prevention_constraints: { rule: string; condition: string; action: string; severity: string }[];
    domain_reference: { domain: string; bestApp: string; features: string; models: string; integrations: string } | null;
    proven_models: { name: string; fields: string; appClass: string }[];
  };

  // Metadata
  schema_version: number;
  created_at: string;
}

/**
 * Filter reusable source files to only those relevant to a feature's selected assets.
 */
function filterSourceFilesForFeature(
  assetNames: string[],
  selectedCandidateIds: string[],
  allSourceFiles: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>,
): Record<string, { repo: string; path: string; files: { path: string; content: string }[] }> {
  const filtered: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }> = {};
  for (const candidateId of selectedCandidateIds) {
    if (allSourceFiles[candidateId]) {
      filtered[candidateId] = allSourceFiles[candidateId];
    }
  }
  return filtered;
}

/**
 * Compile a BuilderPackage from a completed job and feature ID.
 * Returns null if the bridge is not ready (not approved, has triggered vetoes, blocked).
 * @param reusableSourceFiles — fetched source files from GitHub, keyed by candidate_id
 */
export function compileBuilderPackage(
  job: JobRecord,
  featureId: string,
  reusableSourceFiles?: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>,
): BuilderPackage | null {
  if (!job.featureBridges) return null;

  const bridge = job.featureBridges[featureId] as FeatureBridge | undefined;
  if (!bridge) return null;

  // Must not be blocked
  if (bridge.status === "blocked" || bridge.status === "failed") return null;

  // Must have been through veto checking (hard_vetoes present and none triggered)
  if (!bridge.hard_vetoes || bridge.hard_vetoes.length === 0) return null;
  const triggeredVetoes = bridge.hard_vetoes.filter((v) => v.triggered);
  if (triggeredVetoes.length > 0) return null;

  // Must have user approval
  if (!job.userApproved) return null;

  // Compile the package
  const reuseAssets = (bridge.reuse_candidates || [])
    .filter((c) => c.selected)
    .map((c) => ({
      name: c.name,
      source_path: c.source_path,
      description: c.description,
    }));

  const rules = (bridge.applied_rules || []).map((r) => ({
    rule_id: r.rule_id,
    title: r.title,
    severity: r.severity,
  }));

  const requiredTests = (bridge.required_tests || []).map((t) => ({
    test_id: t.test_id,
    name: t.name,
    pass_condition: t.pass_condition,
  }));

  return {
    package_id: `pkg-${randomUUID().slice(0, 8)}`,
    job_id: job.jobId,
    bridge_id: bridge.bridge_id,
    feature_id: bridge.feature_id,
    feature_name: bridge.feature_name,

    objective: bridge.build_scope.objective,
    included_capabilities: bridge.build_scope.included_capabilities,
    excluded_capabilities: bridge.build_scope.excluded_capabilities,

    target_repo: bridge.write_scope.target_repo,
    allowed_write_paths: bridge.write_scope.allowed_repo_paths,
    forbidden_paths: bridge.write_scope.forbidden_repo_paths,
    may_create_files: bridge.write_scope.may_create_files,
    may_modify_files: bridge.write_scope.may_modify_existing_files,
    may_delete_files: bridge.write_scope.may_delete_files,

    reuse_assets: reuseAssets,
    reuse_requirements: ((bridge as any).reuse_requirements || []).map((r: any) => ({
      package: r.package,
      components: r.components,
    })),
    // Filter source files to only include those for this feature's selected reuse assets
    source_files: filterSourceFilesForFeature(
      reuseAssets.map((a) => a.name),
      (bridge.reuse_candidates || []).filter((c) => c.selected).map((c: any) => c.candidate_id),
      reusableSourceFiles || {},
    ),
    pattern_requirements: ((bridge as any).pattern_requirements || []) as PatternRequirement[],
    catalog_enforcement_rules: CATALOG_ENFORCEMENT_RULES,
    rules,
    required_tests: requiredTests,

    success_definition: bridge.success_definition,

    // Pass through graph-derived hints from bridge compilation
    graph_hints: (bridge as any).graph_hints || undefined,

    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
  };
}
