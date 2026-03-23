/**
 * Builder-ready artifact compiler.
 * Takes a completed, approved, veto-clean FeatureBridge and produces
 * a BuilderPackage — the exact input a builder agent needs.
 */

import { randomUUID } from "node:crypto";
import { CURRENT_SCHEMA_VERSION } from "./types/artifacts.js";
import type { FeatureBridge } from "./types/artifacts.js";
import type { JobRecord } from "./store.js";

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

  // Metadata
  schema_version: number;
  created_at: string;
}

/**
 * Compile a BuilderPackage from a completed job and feature ID.
 * Returns null if the bridge is not ready (not approved, has triggered vetoes, blocked).
 */
export function compileBuilderPackage(
  job: JobRecord,
  featureId: string
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
    rules,
    required_tests: requiredTests,

    success_definition: bridge.success_definition,

    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
  };
}
