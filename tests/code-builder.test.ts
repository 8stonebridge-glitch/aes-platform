import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { WorkspaceManager, type Workspace } from "../src/builder/workspace-manager.js";
import { CodeBuilder } from "../src/builder/code-builder.js";
import { verifyBuild } from "../src/builder/build-verifier.js";
import type { BuilderPackage } from "../src/builder-artifact.js";

function makePkg(overrides?: Partial<BuilderPackage>): BuilderPackage {
  return {
    package_id: "pkg-test-001",
    job_id: "j-test-001",
    bridge_id: "br-test-001",
    feature_id: "feat-request-submission",
    feature_name: "Request Submission",
    objective: "Allow employees to submit leave requests",
    included_capabilities: [
      "Submission Form",
      "Request Queue",
      "Request Detail View",
    ],
    excluded_capabilities: [],
    target_repo: "aes-output",
    allowed_write_paths: ["convex/", "app/", "components/", "tests/"],
    forbidden_paths: ["node_modules/", ".env"],
    may_create_files: true,
    may_modify_files: true,
    may_delete_files: false,
    reuse_assets: [],
    rules: [],
    required_tests: [
      {
        test_id: "t-sub-01",
        name: "submission-creates-record",
        pass_condition: "A submitted form creates a new record in the database",
      },
      {
        test_id: "t-sub-02",
        name: "org-isolation",
        pass_condition: "Records are scoped to the submitting org",
      },
    ],
    success_definition: {
      user_visible_outcome: "Users can submit leave requests through a form",
      technical_outcome: "Convex mutation creates a record with org scoping",
      validation_requirements: ["Form validation", "Org isolation"],
    },
    schema_version: 1,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("WorkspaceManager", () => {
  const wm = new WorkspaceManager();
  const workspaces: Workspace[] = [];

  afterEach(() => {
    for (const ws of workspaces) {
      wm.cleanup(ws);
    }
    workspaces.length = 0;
  });

  it("creates workspace with git", () => {
    const ws = wm.createWorkspace("j-test-001", "Request Submission");
    workspaces.push(ws);

    expect(ws.workspace_id).toContain("ws-j-test-001");
    expect(ws.branch).toContain("aes/j-test-001/");
    expect(ws.base_commit).toBeTruthy();
    expect(existsSync(ws.path)).toBe(true);
    expect(existsSync(join(ws.path, ".git"))).toBe(true);
    expect(existsSync(join(ws.path, ".aes-workspace"))).toBe(true);
  });
});

describe("CodeBuilder", () => {
  const wm = new WorkspaceManager();
  const workspaces: Workspace[] = [];

  afterEach(() => {
    for (const ws of workspaces) {
      wm.cleanup(ws);
    }
    workspaces.length = 0;
  });

  it("generates Convex schema files", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { run, workspace } = await builder.build("j-test-001", pkg);
    workspaces.push(workspace);

    expect(run.status).toBe("build_succeeded");
    const schemaPath = join(workspace.path, "convex", "request-submission", "schema.ts");
    expect(existsSync(schemaPath)).toBe(true);
    const content = readFileSync(schemaPath, "utf-8");
    expect(content).toContain("defineTable");
    expect(content).toContain("request_submission");
  });

  it("generates page files for form capabilities", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg({
      included_capabilities: ["Submission Form"],
    });
    const { workspace } = await builder.build("j-test-002", pkg);
    workspaces.push(workspace);

    const formPage = join(workspace.path, "app", "request-submission", "submission-form", "page.tsx");
    expect(existsSync(formPage)).toBe(true);
    const content = readFileSync(formPage, "utf-8");
    expect(content).toContain("handleSubmit");
    expect(content).toContain("useMutation");
  });

  it("generates page files for list capabilities", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg({
      included_capabilities: ["Request Queue"],
    });
    const { workspace } = await builder.build("j-test-003", pkg);
    workspaces.push(workspace);

    const listPage = join(workspace.path, "app", "request-submission", "request-queue", "page.tsx");
    expect(existsSync(listPage)).toBe(true);
    const content = readFileSync(listPage, "utf-8");
    expect(content).toContain("useQuery");
    expect(content).toContain("<table");
  });

  it("generates test files", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { workspace } = await builder.build("j-test-004", pkg);
    workspaces.push(workspace);

    const testFile = join(workspace.path, "tests", "request-submission", "submission-creates-record.test.ts");
    expect(existsSync(testFile)).toBe(true);
    const content = readFileSync(testFile, "utf-8");
    expect(content).toContain("describe");
    expect(content).toContain("submission-creates-record");
  });

  it("commits all changes", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { run, workspace } = await builder.build("j-test-005", pkg);
    workspaces.push(workspace);

    expect(run.final_commit).toBeTruthy();
    expect(run.final_commit).not.toBe(workspace.base_commit);

    // Verify git log has our commit
    const log = execSync("git log --oneline -2", { cwd: workspace.path, stdio: "pipe" }).toString();
    expect(log).toContain("[AES] feat(request-submission)");
  });

  it("workspace diff is non-empty after build", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { run, workspace } = await builder.build("j-test-006", pkg);
    workspaces.push(workspace);

    expect(run.diff_summary).toBeTruthy();
    expect(run.diff_summary!.length).toBeGreaterThan(0);
  });

  it("PR summary contains feature name and branch", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { run, workspace, prSummary } = await builder.build("j-test-007", pkg);
    workspaces.push(workspace);

    expect(prSummary).toContain("Request Submission");
    expect(prSummary).toContain(workspace.branch);
    expect(run.pr_summary).toBe(prSummary);
  });

  it("files_created is populated from git", async () => {
    const builder = new CodeBuilder();
    const pkg = makePkg();
    const { run, workspace } = await builder.build("j-test-008", pkg);
    workspaces.push(workspace);

    expect(run.files_created.length).toBeGreaterThan(0);
    // Should include schema, queries, mutations, pages, components, tests
    expect(run.files_created.some(f => f.includes("schema.ts"))).toBe(true);
    expect(run.files_created.some(f => f.includes("queries.ts"))).toBe(true);
    expect(run.files_created.some(f => f.includes("mutations.ts"))).toBe(true);
    expect(run.files_created.some(f => f.includes("page.tsx"))).toBe(true);
    expect(run.files_created.some(f => f.includes("status-badge.tsx"))).toBe(true);
    expect(run.files_created.some(f => f.includes(".test.ts"))).toBe(true);
  });
});

describe("Build Verifier — governance checks", () => {
  it("config drift detection catches package.json modification", () => {
    const pkg = makePkg();
    const run = {
      run_id: "br-test-drift",
      job_id: "j-test-drift",
      bridge_id: "br-test-001",
      feature_id: "feat-request-submission",
      feature_name: "Request Submission",
      status: "build_succeeded" as const,
      input_package_hash: "abc123",
      builder_package: pkg,
      files_created: ["convex/request-submission/schema.ts", "package.json"],
      files_modified: [],
      files_deleted: [],
      test_results: [
        { test_id: "t-sub-01", passed: true },
        { test_id: "t-sub-02", passed: true },
      ],
      acceptance_coverage: { total_required: 2, covered: 2, missing: [] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: false,
      failure_reason: null,
      builder_model: "code-builder-v1",
      duration_ms: 100,
      schema_version: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      workspace_id: null,
      branch: null,
      base_commit: null,
      final_commit: null,
      diff_summary: null,
      pr_summary: null,
    };

    const result = verifyBuild("j-test-drift", pkg, run);
    expect(result.passed).toBe(false);
    expect(result.constraint_violations.some(v => v.includes("Config drift"))).toBe(true);
    expect(result.constraint_violations.some(v => v.includes("package.json"))).toBe(true);
  });

  it("permission drift detection catches middleware modification", () => {
    const pkg = makePkg();
    const run = {
      run_id: "br-test-perm",
      job_id: "j-test-perm",
      bridge_id: "br-test-001",
      feature_id: "feat-request-submission",
      feature_name: "Request Submission",
      status: "build_succeeded" as const,
      input_package_hash: "abc123",
      builder_package: pkg,
      files_created: ["convex/request-submission/schema.ts", "app/middleware.ts"],
      files_modified: [],
      files_deleted: [],
      test_results: [
        { test_id: "t-sub-01", passed: true },
        { test_id: "t-sub-02", passed: true },
      ],
      acceptance_coverage: { total_required: 2, covered: 2, missing: [] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: false,
      failure_reason: null,
      builder_model: "code-builder-v1",
      duration_ms: 100,
      schema_version: 1,
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      workspace_id: null,
      branch: null,
      base_commit: null,
      final_commit: null,
      diff_summary: null,
      pr_summary: null,
    };

    const result = verifyBuild("j-test-perm", pkg, run);
    expect(result.passed).toBe(false);
    expect(result.constraint_violations.some(v => v.includes("Auth boundary drift"))).toBe(true);
    expect(result.constraint_violations.some(v => v.includes("middleware"))).toBe(true);
  });
});
