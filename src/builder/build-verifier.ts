import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord, FixTrailEntry } from "../types/artifacts.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";

export interface VerificationResult {
  passed: boolean;
  scope_violations: string[];
  constraint_violations: string[];
  test_coverage_met: boolean;
  fix_trail_entries: FixTrailEntry[];
}

export function verifyBuild(
  jobId: string,
  pkg: BuilderPackage,
  run: BuilderRunRecord
): VerificationResult {
  const scopeViolations: string[] = [];
  const constraintViolations: string[] = [];
  const fixEntries: FixTrailEntry[] = [];

  // 1. Check scope: all created/modified files must be within allowed write paths
  const allFiles = [...run.files_created, ...run.files_modified];
  const allowed = pkg.allowed_write_paths || [];
  const forbidden = pkg.forbidden_paths || [];

  for (const file of allFiles) {
    if (allowed.length > 0 && !allowed.some(a => file.startsWith(a))) {
      scopeViolations.push(`File outside allowed scope: ${file}`);
    }
    if (forbidden.some(f => file.startsWith(f))) {
      scopeViolations.push(`File in forbidden path: ${file}`);
    }
  }

  // 2. Check deletes are allowed
  if (run.files_deleted.length > 0 && !pkg.may_delete_files) {
    scopeViolations.push(`Deleted ${run.files_deleted.length} files but may_delete_files is false`);
  }

  // 3. Check required tests were added/run
  const requiredTests = pkg.required_tests || [];
  const ranTests = run.test_results || [];
  const missingTests = requiredTests.filter(
    rt => !ranTests.find(t => t.test_id === rt.test_id)
  );
  const failedTests = ranTests.filter(t => !t.passed);

  if (missingTests.length > 0) {
    constraintViolations.push(
      `Missing required tests: ${missingTests.map(t => t.test_id).join(", ")}`
    );
  }
  if (failedTests.length > 0) {
    constraintViolations.push(
      `Failed tests: ${failedTests.map(t => t.test_id).join(", ")}`
    );
  }

  // 4. Check bridge constraints
  if (run.files_created.length === 0 && run.files_modified.length === 0) {
    constraintViolations.push("Builder produced no files");
  }

  // 4b. Config drift: check if package.json or tsconfig.json were modified
  for (const file of allFiles) {
    if (file === "package.json" || file === "tsconfig.json" || file === "next.config.js" || file === "next.config.mjs") {
      constraintViolations.push(`Config drift: builder modified ${file} — requires manual review`);
    }
  }

  // 4c. Secret/env drift: check if .env files were created or modified
  for (const file of allFiles) {
    if (file.match(/\.env($|\.)/)) {
      constraintViolations.push(`Secret/env drift: builder touched ${file} — env files must not be modified by builders`);
    }
  }

  // 4d. Auth boundary drift: check if auth middleware or clerk config was touched
  for (const file of allFiles) {
    if (file.includes("middleware.ts") || file.includes("middleware.js") ||
        file.includes("clerk") || file.includes("auth.config") ||
        file.includes("convex/auth") || file.includes("_app.tsx") ||
        (file.includes("layout.tsx") && file.split("/").length <= 2)) {  // root layout only
      constraintViolations.push(`Auth boundary drift: builder modified ${file} — auth config changes require separate review`);
    }
  }

  // 4e. Route/linkage drift: check that generated routes match the feature scope
  const featureSlug = pkg.feature_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  for (const file of allFiles) {
    if (file.startsWith("app/") && !file.includes(featureSlug) && !file.includes("layout") && !file.includes("_")) {
      constraintViolations.push(`Route drift: builder created route ${file} outside feature scope (expected under app/${featureSlug}/)`);
    }
  }

  // 5. Check acceptance coverage
  const coverage = run.acceptance_coverage;
  if (coverage && coverage.total_required > 0) {
    const ratio = coverage.covered / coverage.total_required;
    if (ratio < 1.0) {
      constraintViolations.push(
        `Acceptance coverage: ${coverage.covered}/${coverage.total_required} (${(ratio * 100).toFixed(0)}%). Missing: ${(coverage.missing || []).join(", ")}`
      );
    }
  }

  const testCoverageMet = missingTests.length === 0 && failedTests.length === 0;
  const passed = scopeViolations.length === 0 && constraintViolations.length === 0 && testCoverageMet;

  // Create FixTrail entries for failures with retryability info
  if (scopeViolations.length > 0) {
    fixEntries.push({
      fix_id: `fix-${randomUUID().substring(0, 8)}`,
      job_id: jobId,
      gate: "build_verification",
      error_code: "SCOPE_VIOLATION",
      issue_summary: `Builder wrote outside allowed scope: ${scopeViolations.length} violation(s) (not retryable — requires bridge repair)`,
      root_cause: "builder_scope_drift",
      repair_action: "narrow_scope",
      status: "detected",
      related_artifact_ids: [run.run_id, pkg.bridge_id],
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });
  }

  if (constraintViolations.length > 0) {
    fixEntries.push({
      fix_id: `fix-${randomUUID().substring(0, 8)}`,
      job_id: jobId,
      gate: "build_verification",
      error_code: "CONSTRAINT_VIOLATION",
      issue_summary: `Builder violated bridge constraints: ${constraintViolations.join("; ")} (retryable after fix)`,
      root_cause: "bridge_constraint_miss",
      repair_action: "add_test",
      status: "detected",
      related_artifact_ids: [run.run_id, pkg.bridge_id],
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      resolved_at: null,
    });
  }

  return {
    passed,
    scope_violations: scopeViolations,
    constraint_violations: constraintViolations,
    test_coverage_met: testCoverageMet,
    fix_trail_entries: fixEntries,
  };
}

/**
 * Create FixTrail entries for repo-level check failures (typecheck, lint, test, build).
 */
export function createCheckFixTrailEntries(
  jobId: string,
  runId: string,
  bridgeId: string,
  checkResults: { check: string; passed: boolean; output: string; skipped: boolean }[]
): FixTrailEntry[] {
  const entries: FixTrailEntry[] = [];
  for (const cr of checkResults) {
    if (!cr.passed && !cr.skipped) {
      entries.push({
        fix_id: `fix-${randomUUID().substring(0, 8)}`,
        job_id: jobId,
        gate: "repo_check",
        error_code: `CHECK_FAILED_${cr.check.toUpperCase()}`,
        issue_summary: `Repo check '${cr.check}' failed: ${cr.output.substring(0, 200)} (retryable after code fix)`,
        root_cause: `${cr.check}_failure`,
        repair_action: "fix_code",
        status: "detected",
        related_artifact_ids: [runId, bridgeId],
        schema_version: CURRENT_SCHEMA_VERSION,
        created_at: new Date().toISOString(),
        resolved_at: null,
      });
    }
  }
  return entries;
}
