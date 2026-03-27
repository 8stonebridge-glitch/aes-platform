/**
 * P2 — Slim Bridge Contracts.
 * Strips a full FeatureBridge down to only what the builder needs,
 * reducing prompt token count by ~60%.
 */

import type { FeatureBridge, RequiredTest } from "../types/artifacts.js";
import type { BuilderPackage } from "../builder-artifact.js";

/**
 * A minimal contract for the builder — just enough to build correctly.
 */
export interface SlimContract {
  feature_id: string;
  feature_name: string;
  objective: string;
  included: string[];
  excluded: string[];
  write_paths: string[];
  forbidden_paths: string[];
  may_create: boolean;
  may_modify: boolean;
  may_delete: boolean;
  reuse_assets: { name: string; path: string }[];
  tests: { name: string; pass_condition: string }[];
  success_outcome: string;
  rules_summary: string;
}

/**
 * Compile a full BuilderPackage into a SlimContract.
 * Strips metadata, hashes, timestamps, and verbose descriptions.
 */
export function compileSlimContract(pkg: BuilderPackage): SlimContract {
  return {
    feature_id: pkg.feature_id,
    feature_name: pkg.feature_name,
    objective: pkg.objective,
    included: pkg.included_capabilities,
    excluded: pkg.excluded_capabilities,
    write_paths: pkg.allowed_write_paths,
    forbidden_paths: pkg.forbidden_paths,
    may_create: pkg.may_create_files,
    may_modify: pkg.may_modify_files,
    may_delete: pkg.may_delete_files,
    reuse_assets: pkg.reuse_assets.map(a => ({ name: a.name, path: a.source_path })),
    tests: pkg.required_tests.map(t => ({ name: t.name, pass_condition: t.pass_condition })),
    success_outcome: pkg.success_definition.user_visible_outcome,
    rules_summary: pkg.rules.map(r => `[${r.severity}] ${r.title}`).join("; "),
  };
}

/**
 * Compile a SlimContract directly from a FeatureBridge (skipping BuilderPackage).
 */
export function compileSlimContractFromBridge(bridge: FeatureBridge): SlimContract {
  return {
    feature_id: bridge.feature_id,
    feature_name: bridge.feature_name,
    objective: bridge.build_scope.objective,
    included: bridge.build_scope.included_capabilities,
    excluded: bridge.build_scope.excluded_capabilities,
    write_paths: bridge.write_scope.allowed_repo_paths,
    forbidden_paths: bridge.write_scope.forbidden_repo_paths,
    may_create: bridge.write_scope.may_create_files,
    may_modify: bridge.write_scope.may_modify_existing_files,
    may_delete: bridge.write_scope.may_delete_files,
    reuse_assets: bridge.reuse_candidates
      .filter(c => c.selected)
      .map(c => ({ name: c.name, path: c.source_path })),
    tests: bridge.required_tests.map(t => ({ name: t.name, pass_condition: t.pass_condition })),
    success_outcome: bridge.success_definition.user_visible_outcome,
    rules_summary: bridge.applied_rules.map(r => `[${r.severity}] ${r.title}`).join("; "),
  };
}

/**
 * Measure the token reduction from full package to slim contract.
 */
export function measureContractReduction(pkg: BuilderPackage): {
  full_chars: number;
  slim_chars: number;
  reduction_pct: number;
} {
  const fullStr = JSON.stringify(pkg);
  const slimStr = JSON.stringify(compileSlimContract(pkg));
  const reduction = ((fullStr.length - slimStr.length) / fullStr.length) * 100;
  return {
    full_chars: fullStr.length,
    slim_chars: slimStr.length,
    reduction_pct: Math.round(reduction),
  };
}
