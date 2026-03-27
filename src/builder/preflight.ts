/**
 * P6 — Preflight Gates.
 * Quick checks before each feature build to catch obvious issues early:
 * - Does the feature have a valid bridge?
 * - Are dependencies built?
 * - Is the write scope non-empty?
 * - Are required files accessible?
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FeatureBridge } from "../types/artifacts.js";
import type { BuildClassConfig } from "./feature-classifier.js";

export interface PreflightResult {
  passed: boolean;
  feature_id: string;
  checks: PreflightCheck[];
  block_reason?: string;
  duration_ms: number;
}

export interface PreflightCheck {
  name: string;
  passed: boolean;
  detail: string;
}

/**
 * Run preflight checks for a single feature before build.
 */
export function runPreflight(
  featureId: string,
  bridge: FeatureBridge | undefined,
  classConfig: BuildClassConfig,
  completedFeatures: Set<string>,
  workspacePath?: string
): PreflightResult {
  const start = Date.now();
  const checks: PreflightCheck[] = [];

  // 1. Bridge exists
  checks.push({
    name: "bridge_exists",
    passed: !!bridge,
    detail: bridge ? `Bridge ${bridge.bridge_id} found` : "No bridge for this feature",
  });

  if (!bridge) {
    return {
      passed: false,
      feature_id: featureId,
      checks,
      block_reason: "No bridge found",
      duration_ms: Date.now() - start,
    };
  }

  // 2. Bridge not blocked/failed
  const bridgeOk = bridge.status !== "blocked" && bridge.status !== "failed";
  checks.push({
    name: "bridge_status",
    passed: bridgeOk,
    detail: `Bridge status: ${bridge.status}`,
  });

  // 3. No triggered hard vetoes
  const triggeredVetoes = (bridge.hard_vetoes || []).filter(v => v.triggered);
  checks.push({
    name: "no_triggered_vetoes",
    passed: triggeredVetoes.length === 0,
    detail: triggeredVetoes.length === 0
      ? "No triggered vetoes"
      : `${triggeredVetoes.length} triggered vetoes: ${triggeredVetoes.map(v => v.code).join(", ")}`,
  });

  // 4. Dependencies satisfied
  const unsatisfied = (bridge.dependencies || [])
    .filter(d => d.status === "required")
    .filter(d => !completedFeatures.has(d.feature_id));
  checks.push({
    name: "dependencies_met",
    passed: unsatisfied.length === 0,
    detail: unsatisfied.length === 0
      ? "All dependencies met"
      : `Waiting on: ${unsatisfied.map(d => d.feature_id).join(", ")}`,
  });

  // 5. Write scope is non-empty
  const hasWritePaths = bridge.write_scope.allowed_repo_paths.length > 0;
  checks.push({
    name: "write_scope_defined",
    passed: hasWritePaths,
    detail: hasWritePaths
      ? `${bridge.write_scope.allowed_repo_paths.length} write paths defined`
      : "No write paths defined — builder has no target",
  });

  // 6. Objective is non-empty
  const hasObjective = bridge.build_scope.objective.trim().length > 0;
  checks.push({
    name: "objective_defined",
    passed: hasObjective,
    detail: hasObjective ? "Objective defined" : "Empty objective",
  });

  // 7. Workspace exists (if provided)
  if (workspacePath) {
    const wsExists = existsSync(workspacePath);
    checks.push({
      name: "workspace_exists",
      passed: wsExists,
      detail: wsExists ? `Workspace at ${workspacePath}` : `Workspace not found: ${workspacePath}`,
    });
  }

  // 8. Auth-sensitive isolation check
  if (classConfig.requires_isolation) {
    const hasAuth = bridge.build_scope.included_capabilities.some(
      c => c.toLowerCase().includes("auth") || c.toLowerCase().includes("permission")
    );
    checks.push({
      name: "isolation_justified",
      passed: true, // Always passes — informational
      detail: hasAuth
        ? "Auth-sensitive feature — will run in isolation"
        : "Isolation-required class but no auth capabilities — proceed with caution",
    });
  }

  const allPassed = checks.every(c => c.passed);
  const firstFailure = checks.find(c => !c.passed);

  return {
    passed: allPassed,
    feature_id: featureId,
    checks,
    block_reason: allPassed ? undefined : firstFailure?.detail,
    duration_ms: Date.now() - start,
  };
}

/**
 * Run preflight for all features and return a summary.
 */
export function runPreflightAll(
  featureIds: string[],
  bridges: Record<string, FeatureBridge>,
  classConfigs: Map<string, BuildClassConfig>,
  completedFeatures: Set<string>,
  workspacePath?: string
): { results: PreflightResult[]; ready: string[]; blocked: string[] } {
  const results: PreflightResult[] = [];
  const ready: string[] = [];
  const blocked: string[] = [];

  for (const fid of featureIds) {
    const bridge = bridges[fid];
    const config = classConfigs.get(fid) || {
      build_class: "crud" as const,
      timeout_ms: 90_000,
      max_concurrency: 4,
      max_files: 20,
      max_lines: 2000,
      requires_isolation: false,
    };

    const result = runPreflight(fid, bridge, config, completedFeatures, workspacePath);
    results.push(result);

    if (result.passed) {
      ready.push(fid);
    } else {
      blocked.push(fid);
    }
  }

  return { results, ready, blocked };
}
