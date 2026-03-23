import { describe, it, expect } from "vitest";
import { TemplateBuilder, hashPackage } from "../src/builder/builder-engine.js";
import { verifyBuild } from "../src/builder/build-verifier.js";
import type { BuilderPackage } from "../src/builder-artifact.js";
import type { BuilderRunRecord, BuilderRunStatus } from "../src/types/artifacts.js";
import { CURRENT_SCHEMA_VERSION } from "../src/types/artifacts.js";

function makePackage(overrides?: Partial<BuilderPackage>): BuilderPackage {
  return {
    package_id: "pkg-test0001",
    job_id: "j-test0001",
    bridge_id: "bridge-test0001",
    feature_id: "feat-request-submission",
    feature_name: "Request Submission",
    objective: "Allow employees to submit leave requests",
    included_capabilities: [
      "Submit leave request form",
      "Request queue list",
      "Request detail view",
    ],
    excluded_capabilities: [],
    target_repo: "approval-portal",
    allowed_write_paths: ["convex/", "app/", "components/", "tests/"],
    forbidden_paths: ["node_modules/", ".env"],
    may_create_files: true,
    may_modify_files: true,
    may_delete_files: false,
    reuse_assets: [],
    rules: [{ rule_id: "r1", title: "Auth required", severity: "critical" }],
    required_tests: [
      { test_id: "t1", name: "Submit form happy path", pass_condition: "form submits" },
      { test_id: "t2", name: "Validation rejects empty", pass_condition: "shows error" },
      { test_id: "t3", name: "Queue shows submissions", pass_condition: "list renders" },
    ],
    success_definition: {
      user_visible_outcome: "User can submit a leave request",
      technical_outcome: "Data persists to Convex",
      validation_requirements: ["form validation", "auth check"],
    },
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("TemplateBuilder", () => {
  it("produces files for a valid package", async () => {
    const builder = new TemplateBuilder();
    const pkg = makePackage();
    const run = await builder.build("j-test0001", pkg);

    expect(run.status).toBe("build_succeeded");
    expect(run.files_created.length).toBeGreaterThan(0);
    expect(run.files_modified.length).toBeGreaterThan(0);
    expect(run.completed_at).not.toBeNull();
    expect(run.duration_ms).toBeGreaterThanOrEqual(0);

    // Should create convex functions, pages, components, schema, and test files
    const convexFiles = run.files_created.filter(f => f.startsWith("convex/"));
    const appFiles = run.files_created.filter(f => f.startsWith("app/"));
    const testFiles = run.files_created.filter(f => f.startsWith("tests/"));
    expect(convexFiles.length).toBeGreaterThan(0);
    expect(appFiles.length).toBeGreaterThan(0);
    expect(testFiles.length).toBe(3); // one per required test
  });

  it("generates test stubs for required tests", async () => {
    const builder = new TemplateBuilder();
    const pkg = makePackage();
    const run = await builder.build("j-test0001", pkg);

    expect(run.test_results).toHaveLength(3);
    for (const tr of run.test_results) {
      expect(tr.passed).toBe(true);
      expect(tr.output).toContain("[template-v1]");
    }
    expect(run.acceptance_coverage.total_required).toBe(3);
    expect(run.acceptance_coverage.covered).toBe(3);
    expect(run.acceptance_coverage.missing).toHaveLength(0);
  });
});

describe("hashPackage", () => {
  it("is deterministic", () => {
    const pkg = makePackage();
    const h1 = hashPackage(pkg);
    const h2 = hashPackage(pkg);
    expect(h1).toBe(h2);
    expect(h1.length).toBe(16);
  });

  it("changes when package changes", () => {
    const pkg1 = makePackage({ feature_name: "Alpha" });
    const pkg2 = makePackage({ feature_name: "Beta" });
    expect(hashPackage(pkg1)).not.toBe(hashPackage(pkg2));
  });
});

describe("verifyBuild", () => {
  it("passes for in-scope build", async () => {
    const builder = new TemplateBuilder();
    const pkg = makePackage();
    const run = await builder.build("j-test0001", pkg);

    const result = verifyBuild("j-test0001", pkg, run);
    expect(result.passed).toBe(true);
    expect(result.scope_violations).toHaveLength(0);
    expect(result.constraint_violations).toHaveLength(0);
    expect(result.test_coverage_met).toBe(true);
    expect(result.fix_trail_entries).toHaveLength(0);
  });

  it("rejects scope violations", async () => {
    const builder = new TemplateBuilder();
    // Package with very narrow allowed paths that won't match generated files
    const pkg = makePackage({
      allowed_write_paths: ["only-this-dir/"],
    });
    const run = await builder.build("j-test0001", pkg);

    // The builder filters by allowed paths, so run.files_created may be empty.
    // Override with out-of-scope files to simulate a builder that doesn't filter.
    run.files_created = ["secret/hack.ts", "node_modules/evil.js"];
    run.files_modified = [];

    const result = verifyBuild("j-test0001", pkg, run);
    expect(result.passed).toBe(false);
    expect(result.scope_violations.length).toBeGreaterThan(0);
    expect(result.fix_trail_entries.length).toBeGreaterThan(0);
    expect(result.fix_trail_entries[0].error_code).toBe("SCOPE_VIOLATION");
  });

  it("rejects missing tests", () => {
    const pkg = makePackage();
    // Simulate a build run that is missing required tests
    const run: BuilderRunRecord = {
      run_id: "br-missing",
      job_id: "j-test0001",
      bridge_id: pkg.bridge_id,
      feature_id: pkg.feature_id,
      feature_name: pkg.feature_name,
      status: "build_succeeded",
      input_package_hash: hashPackage(pkg),
      builder_package: pkg,
      files_created: ["convex/request-submission/schema.ts"],
      files_modified: ["convex/schema.ts"],
      files_deleted: [],
      test_results: [
        // Only ran 1 of 3 required tests
        { test_id: "t1", passed: true },
      ],
      acceptance_coverage: { total_required: 3, covered: 1, missing: ["t2", "t3"] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: false,
      failure_reason: null,
      builder_model: "template-v1",
      duration_ms: 5,
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const result = verifyBuild("j-test0001", pkg, run);
    expect(result.passed).toBe(false);
    expect(result.test_coverage_met).toBe(false);
    expect(result.constraint_violations.length).toBeGreaterThan(0);
    expect(result.constraint_violations.some(v => v.includes("Missing required tests"))).toBe(true);
  });

  it("creates FixTrail entries on failure", () => {
    const pkg = makePackage();
    const run: BuilderRunRecord = {
      run_id: "br-fixtrail",
      job_id: "j-test0001",
      bridge_id: pkg.bridge_id,
      feature_id: pkg.feature_id,
      feature_name: pkg.feature_name,
      status: "build_succeeded",
      input_package_hash: hashPackage(pkg),
      builder_package: pkg,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      test_results: [],
      acceptance_coverage: { total_required: 3, covered: 0, missing: ["t1", "t2", "t3"] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: false,
      failure_reason: null,
      builder_model: "template-v1",
      duration_ms: 1,
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const result = verifyBuild("j-test0001", pkg, run);
    expect(result.passed).toBe(false);
    expect(result.fix_trail_entries.length).toBeGreaterThan(0);

    // Should have CONSTRAINT_VIOLATION for missing tests and no files
    const constraintFix = result.fix_trail_entries.find(f => f.error_code === "CONSTRAINT_VIOLATION");
    expect(constraintFix).toBeDefined();
    expect(constraintFix!.gate).toBe("build_verification");
    expect(constraintFix!.status).toBe("detected");
    expect(constraintFix!.related_artifact_ids).toContain(run.run_id);
  });
});

describe("BuilderRunRecord lifecycle states", () => {
  it("has correct lifecycle states", () => {
    const validStates: BuilderRunStatus[] = [
      "ready_for_build",
      "building",
      "build_failed",
      "build_succeeded",
      "build_rejected",
    ];
    // Type check: these must all be assignable
    for (const s of validStates) {
      const record: Partial<BuilderRunRecord> = { status: s };
      expect(record.status).toBe(s);
    }
  });
});

describe("blocked bridge", () => {
  it("cannot be built (compileBuilderPackage returns null for blocked)", async () => {
    // This tests the existing compileBuilderPackage logic.
    // We import and test it directly.
    const { compileBuilderPackage } = await import("../src/builder-artifact.js");

    const job = {
      jobId: "j-blocked",
      requestId: "r1",
      rawRequest: "test",
      currentGate: "gate_3" as const,
      createdAt: new Date().toISOString(),
      durability: "memory_only" as const,
      userApproved: true,
      featureBridges: {
        "feat-blocked": {
          bridge_id: "br-1",
          app_id: "app-1",
          app_spec_id: "spec-1",
          feature_id: "feat-blocked",
          feature_name: "Blocked Feature",
          status: "blocked",
          build_scope: { objective: "test", included_capabilities: [], excluded_capabilities: [], acceptance_boundary: "" },
          read_scope: { allowed_repo_paths: [], allowed_packages: [], allowed_features: [], allowed_graph_nodes: [], allowed_artifacts: [] },
          write_scope: { target_repo: "repo", allowed_repo_paths: [], forbidden_repo_paths: [], may_create_files: true, may_modify_existing_files: true, may_delete_files: false, may_change_shared_packages: false, may_change_schema: false },
          reuse_candidates: [],
          selected_reuse_assets: [],
          applied_rules: [],
          required_tests: [],
          dependencies: [],
          hard_vetoes: [{ code: "G3_AUTH_NOT_DEFINED", triggered: false, reason: "ok", required_fix: "", blocking_feature_ids: [] }],
          blocked_reason: "Missing auth definition",
          success_definition: { user_visible_outcome: "", technical_outcome: "", validation_requirements: [] },
          confidence: { scope_clarity: 0, reuse_fit: 0, dependency_clarity: 0, rule_coverage: 0, test_coverage: 0, overall: 0, notes: [] },
          schema_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    };

    const result = compileBuilderPackage(job, "feat-blocked");
    expect(result).toBeNull();
  });
});
