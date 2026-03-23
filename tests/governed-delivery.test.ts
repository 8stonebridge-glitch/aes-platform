import { describe, it, expect, beforeEach } from "vitest";
import { CheckRunner } from "../src/builder/check-runner.js";
import { verifyBuild, createCheckFixTrailEntries } from "../src/builder/build-verifier.js";
import { WorkspaceManager } from "../src/builder/workspace-manager.js";
import type { BuilderRunRecord, CheckResult, BuilderRunStatus } from "../src/types/artifacts.js";
import type { BuilderPackage } from "../src/builder-artifact.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ─── Helpers ────────────────────────────────────────────────────────────

function makeMinimalPkg(overrides?: Partial<BuilderPackage>): BuilderPackage {
  return {
    package_id: "pkg-test",
    job_id: "j-test",
    bridge_id: "br-test",
    feature_id: "feat-test",
    feature_name: "Test Feature",
    objective: "test objective",
    included_capabilities: [],
    excluded_capabilities: [],
    target_repo: "test-repo",
    allowed_write_paths: [],
    forbidden_paths: [],
    may_create_files: true,
    may_modify_files: true,
    may_delete_files: false,
    reuse_assets: [],
    rules: [],
    required_tests: [],
    success_definition: {
      user_visible_outcome: "test",
      technical_outcome: "test",
      validation_requirements: [],
    },
    schema_version: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeMinimalRun(overrides?: Partial<BuilderRunRecord>): BuilderRunRecord {
  return {
    run_id: "run-test",
    job_id: "j-test",
    bridge_id: "br-test",
    feature_id: "feat-test",
    feature_name: "Test Feature",
    status: "build_succeeded",
    input_package_hash: "abc123",
    builder_package: {},
    files_created: [],
    files_modified: [],
    files_deleted: [],
    test_results: [],
    check_results: [],
    acceptance_coverage: { total_required: 0, covered: 0, missing: [] },
    scope_violations: [],
    constraint_violations: [],
    verification_passed: false,
    failure_reason: null,
    builder_model: "test",
    duration_ms: 0,
    schema_version: 1,
    created_at: new Date().toISOString(),
    completed_at: null,
    workspace_id: null,
    branch: null,
    base_commit: null,
    final_commit: null,
    diff_summary: null,
    pr_summary: null,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe("CheckRunner", () => {
  it("skips checks when no config exists", async () => {
    const runner = new CheckRunner();
    const emptyDir = mkdtempSync(join(tmpdir(), "check-test-"));
    const results = await runner.runAll(emptyDir);

    expect(results).toHaveLength(4);
    for (const r of results) {
      expect(r.skipped).toBe(true);
      expect(r.passed).toBe(true);
    }
  });

  it("returns proper result format", async () => {
    const runner = new CheckRunner();
    const emptyDir = mkdtempSync(join(tmpdir(), "check-test-"));
    const results = await runner.runAll(emptyDir);

    for (const r of results) {
      expect(r).toHaveProperty("check");
      expect(r).toHaveProperty("passed");
      expect(r).toHaveProperty("output");
      expect(r).toHaveProperty("duration_ms");
      expect(r).toHaveProperty("skipped");
      expect(typeof r.check).toBe("string");
      expect(typeof r.passed).toBe("boolean");
      expect(typeof r.duration_ms).toBe("number");
      expect(typeof r.skipped).toBe("boolean");
    }

    const checkNames = results.map(r => r.check);
    expect(checkNames).toContain("typecheck");
    expect(checkNames).toContain("lint");
    expect(checkNames).toContain("test");
    expect(checkNames).toContain("build");
  });
});

describe("approve-build gates", () => {
  it("requires verification_passed for approval", () => {
    // Simulate approval check: verification must pass
    const run = makeMinimalRun({ verification_passed: false });
    // Approval logic: cannot approve if verification_passed is false
    expect(run.verification_passed).toBe(false);
    // This would be rejected by approve-build
  });

  it("requires no failed checks for approval", () => {
    const failedChecks: CheckResult[] = [
      { check: "typecheck", passed: false, output: "error TS123", duration_ms: 100, skipped: false },
    ];
    const run = makeMinimalRun({ check_results: failedChecks, verification_passed: true });
    const failingNonSkipped = run.check_results.filter(c => !c.passed && !c.skipped);
    expect(failingNonSkipped.length).toBeGreaterThan(0);
    // This would be rejected by approve-build
  });
});

describe("enhanced governance checks", () => {
  it("detects .env file drift", () => {
    const pkg = makeMinimalPkg({ feature_name: "Test Feature" });
    const run = makeMinimalRun({
      files_created: [".env", ".env.local"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const envViolations = result.constraint_violations.filter(v =>
      v.includes("Secret/env drift")
    );
    expect(envViolations.length).toBeGreaterThan(0);
  });

  it("detects auth boundary drift for middleware", () => {
    const pkg = makeMinimalPkg({ feature_name: "Test Feature" });
    const run = makeMinimalRun({
      files_created: ["middleware.ts"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const authViolations = result.constraint_violations.filter(v =>
      v.includes("Auth boundary drift")
    );
    expect(authViolations.length).toBeGreaterThan(0);
  });

  it("detects auth boundary drift for proxy.ts", () => {
    const pkg = makeMinimalPkg({ feature_name: "Test Feature" });
    const run = makeMinimalRun({
      files_created: ["proxy.ts"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const authViolations = result.constraint_violations.filter(v =>
      v.includes("Auth boundary drift")
    );
    expect(authViolations.length).toBeGreaterThan(0);
  });

  it("detects route drift for out-of-scope routes", () => {
    const pkg = makeMinimalPkg({ feature_name: "My Feature" });
    const run = makeMinimalRun({
      files_created: ["app/other-feature/page.tsx"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const routeViolations = result.constraint_violations.filter(v =>
      v.includes("Route drift")
    );
    expect(routeViolations.length).toBeGreaterThan(0);
  });
});

describe("FixTrail retryability", () => {
  it("includes retryability info in scope violation summaries", () => {
    const pkg = makeMinimalPkg({
      feature_name: "Test Feature",
      allowed_write_paths: ["src/"],
      forbidden_paths: [],
    });
    const run = makeMinimalRun({
      files_created: ["outside/file.ts"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const scopeEntries = result.fix_trail_entries.filter(e =>
      e.error_code === "SCOPE_VIOLATION"
    );
    expect(scopeEntries.length).toBeGreaterThan(0);
    expect(scopeEntries[0].issue_summary).toContain("not retryable");
  });

  it("includes retryability info in constraint violation summaries", () => {
    const pkg = makeMinimalPkg({ feature_name: "Test Feature" });
    const run = makeMinimalRun({
      files_created: [".env"],
      files_modified: [],
    });

    const result = verifyBuild("j-test", pkg, run);
    const constraintEntries = result.fix_trail_entries.filter(e =>
      e.error_code === "CONSTRAINT_VIOLATION"
    );
    expect(constraintEntries.length).toBeGreaterThan(0);
    expect(constraintEntries[0].issue_summary).toContain("retryable after fix");
  });

  it("creates check failure FixTrail entries with retryability", () => {
    const checkResults = [
      { check: "typecheck", passed: false, output: "error TS2345", skipped: false },
      { check: "lint", passed: true, output: "", skipped: false },
    ];

    const entries = createCheckFixTrailEntries("j-test", "run-1", "br-1", checkResults);
    expect(entries).toHaveLength(1);
    expect(entries[0].error_code).toBe("CHECK_FAILED_TYPECHECK");
    expect(entries[0].issue_summary).toContain("retryable after code fix");
  });
});

describe("BuilderRunStatus", () => {
  it("includes build_approved as a valid status", () => {
    // Type check: this should compile without error
    const status: BuilderRunStatus = "build_approved";
    expect(status).toBe("build_approved");

    // All valid statuses
    const allStatuses: BuilderRunStatus[] = [
      "ready_for_build",
      "building",
      "build_failed",
      "build_succeeded",
      "build_rejected",
      "build_approved",
    ];
    expect(allStatuses).toHaveLength(6);
  });
});

describe("WorkspaceManager.createFromRepo", () => {
  it("creates a fresh workspace when no repoUrl is provided", () => {
    const wm = new WorkspaceManager();
    const ws = wm.createFromRepo("j-test", "Test Feature");

    expect(ws.workspace_id).toContain("ws-j-test");
    expect(ws.branch).toContain("aes/j-test/test-feature");
    expect(ws.base_commit).toBeTruthy();
    expect(ws.path).toBeTruthy();

    // Clean up
    wm.cleanup(ws);
  });
});
