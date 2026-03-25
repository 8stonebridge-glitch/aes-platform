import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AppBuilder, type AppBuildResult } from "../src/builder/app-builder.js";
import { WorkspaceManager, type Workspace } from "../src/builder/workspace-manager.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test fixtures ────────────────────────────────────────────────

function makeAppSpec() {
  return {
    app_id: "test-app-001",
    title: "Leave Manager",
    summary: "A workflow approval system for managing leave requests",
    app_class: "workflow_approval_system",
    risk_class: "low",
    target_users: ["requesters", "reviewers", "approvers"],
    features: [
      {
        feature_id: "feat-001",
        name: "Leave Request",
        summary: "Submit and track leave requests",
        description: "Employees submit leave requests with dates, type, and reason",
        priority: "critical",
        status: "proposed",
        actor_ids: ["end_user"],
        entity_ids: [],
        user_problem: "Employees need to request leave",
        outcome: "Employees can submit and track leave requests",
        destructive_actions: [],
        audit_required: true,
        offline_behavior_required: false,
        external_dependencies: [],
      },
      {
        feature_id: "feat-002",
        name: "Approval Queue",
        summary: "Review and approve or reject leave requests",
        description: "Managers review pending requests and approve or reject them",
        priority: "critical",
        status: "proposed",
        actor_ids: ["end_user", "reviewer"],
        entity_ids: [],
        user_problem: "Managers need to approve leave",
        outcome: "Managers can review and approve/reject requests",
        destructive_actions: [
          { action_name: "reject_request", reversible: false, confirmation_required: true, audit_logged: true },
        ],
        audit_required: true,
        offline_behavior_required: false,
        external_dependencies: [],
      },
      {
        feature_id: "feat-003",
        name: "Leave History",
        summary: "View historical leave records",
        description: "All users can view their leave history and status",
        priority: "medium",
        status: "proposed",
        actor_ids: ["end_user"],
        entity_ids: [],
        user_problem: "Users want to see past leave records",
        outcome: "Users can view leave history",
        destructive_actions: [],
        audit_required: false,
        offline_behavior_required: false,
        external_dependencies: [],
      },
    ],
    roles: [
      { role_id: "submitter", name: "Submitter", description: "Can submit leave requests", scope: "self", inherits_from: [] },
      { role_id: "reviewer", name: "Reviewer", description: "Can review and approve leave", scope: "org", inherits_from: [] },
      { role_id: "admin", name: "Admin", description: "Full access", scope: "global", inherits_from: ["reviewer"] },
    ],
    permissions: [
      { permission_id: "perm-1", role_id: "submitter", resource: "feat-001", effect: "read" },
      { permission_id: "perm-2", role_id: "reviewer", resource: "feat-002", effect: "manage" },
      { permission_id: "perm-3", role_id: "admin", resource: "feat-001", effect: "manage" },
    ],
    acceptance_tests: [],
    dependency_graph: [],
    actors: [],
    domain_entities: [],
    workflows: [],
    integrations: [],
    non_functional_requirements: [],
    compliance_requirements: [],
    design_constraints: [],
    risks: [],
    confidence: { overall: 0.85, intent_clarity: 0.95, scope_completeness: 0.85, dependency_clarity: 0.9, integration_clarity: 0.95, compliance_clarity: 0.9, notes: [] },
  };
}

function makeFeatureBridges() {
  return {
    "feat-001": makeBridge("feat-001", "Leave Request", [
      "Submit leave request form",
      "Request queue list",
      "Request detail view",
    ]),
    "feat-002": makeBridge("feat-002", "Approval Queue", [
      "Approval queue table",
      "Review detail view",
    ]),
    "feat-003": makeBridge("feat-003", "Leave History", [
      "Leave history list",
    ]),
  };
}

function makeBridge(featureId: string, featureName: string, capabilities: string[]) {
  return {
    bridge_id: `bridge-${featureId}`,
    app_id: "test-app-001",
    app_spec_id: "spec-001",
    feature_id: featureId,
    feature_name: featureName,
    status: "approved",
    build_scope: {
      objective: `Build ${featureName} feature`,
      included_capabilities: capabilities,
      excluded_capabilities: [],
    },
    read_scope: { allowed_read_paths: [] },
    write_scope: {
      target_repo: "",
      allowed_repo_paths: ["convex/", "app/", "components/", "tests/"],
      forbidden_repo_paths: [],
      may_create_files: true,
      may_modify_existing_files: true,
      may_delete_files: false,
    },
    reuse_candidates: [],
    selected_reuse_assets: [],
    applied_rules: [],
    required_tests: [
      {
        test_id: `test-${featureId}-happy`,
        name: `${featureName} — happy path`,
        pass_condition: `${featureName} works end to end`,
      },
    ],
    dependencies: [],
    hard_vetoes: [
      { code: "G3_NO_TESTS", triggered: false, reason: "Tests present", required_fix: "" },
    ],
    blocked_reason: null,
    success_definition: {
      user_visible_outcome: `${featureName} is functional`,
      technical_outcome: `${featureName} passes all tests`,
      validation_requirements: [],
    },
    confidence: { overall: 0.85, breakdown: {} },
    schema_version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe("AppBuilder", () => {
  const wm = new WorkspaceManager();
  let result: AppBuildResult;
  let ws: Workspace;

  describe("full app build", () => {
    beforeEach(async () => {
      const builder = new AppBuilder();
      const appSpec = makeAppSpec();
      const bridges = makeFeatureBridges();
      const buildOrder = ["feat-001", "feat-002", "feat-003"];

      result = await builder.buildApp("test-job-001", appSpec, bridges, buildOrder);
      ws = result.workspace;
    });

    afterEach(() => {
      try {
        wm.cleanup(ws);
      } catch {
        // Best effort
      }
    });

    it("creates a single workspace with full scaffold", () => {
      expect(ws.workspace_id).toContain("ws-test-job-001");
      expect(ws.path).toBeTruthy();
      expect(existsSync(ws.path)).toBe(true);
      expect(existsSync(join(ws.path, "package.json"))).toBe(true);
      expect(existsSync(join(ws.path, "tsconfig.json"))).toBe(true);
      expect(existsSync(join(ws.path, "next.config.mjs"))).toBe(true);
      expect(existsSync(join(ws.path, "tailwind.config.ts"))).toBe(true);
    });

    it("generates sidebar with links to all features", () => {
      const sidebarPath = join(ws.path, "components", "sidebar.tsx");
      expect(existsSync(sidebarPath)).toBe(true);

      const content = readFileSync(sidebarPath, "utf-8");
      expect(content).toContain("Leave Request");
      expect(content).toContain("Approval Queue");
      expect(content).toContain("Leave History");
      expect(content).toContain("/leave-request");
      expect(content).toContain("/approval-queue");
      expect(content).toContain("/leave-history");
      expect(content).toContain("Dashboard");
      expect(content).toContain("usePathname");
    });

    it("generates unified schema with tables for all features", () => {
      const schemaPath = join(ws.path, "convex", "schema.ts");
      expect(existsSync(schemaPath)).toBe(true);

      const content = readFileSync(schemaPath, "utf-8");
      expect(content).toContain("defineSchema");
      expect(content).toContain("defineTable");
      expect(content).toContain("leave_request");
      expect(content).toContain("approval_queue");
      expect(content).toContain("leave_history");
      expect(content).toContain("audit_logs");
      expect(content).toContain("orgId");
    });

    it("builds features into the shared workspace", () => {
      // Leave Request feature files
      expect(existsSync(join(ws.path, "convex", "leave-request", "queries.ts"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "leave-request", "mutations.ts"))).toBe(true);

      // Approval Queue feature files
      expect(existsSync(join(ws.path, "convex", "approval-queue", "queries.ts"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "approval-queue", "mutations.ts"))).toBe(true);

      // Leave History feature files
      expect(existsSync(join(ws.path, "convex", "leave-history", "queries.ts"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "leave-history", "mutations.ts"))).toBe(true);
    });

    it("uses template fallback without API key", () => {
      // No OPENAI_API_KEY set — should use template fallback for all files
      expect(result.run.status).toBe("build_succeeded");
      expect(result.run.builder_model).toBe("app-builder-v1");

      // Sidebar should have template content
      const sidebar = readFileSync(join(ws.path, "components", "sidebar.tsx"), "utf-8");
      expect(sidebar).toContain("use client");
      expect(sidebar).toContain("LayoutDashboard");
    });

    it("generated app has proper directory structure", () => {
      // App directory
      expect(existsSync(join(ws.path, "app", "layout.tsx"))).toBe(true);
      expect(existsSync(join(ws.path, "app", "page.tsx"))).toBe(true);
      expect(existsSync(join(ws.path, "app", "globals.css"))).toBe(true);
      expect(existsSync(join(ws.path, "app", "convex-provider.tsx"))).toBe(true);

      // Convex directory
      expect(existsSync(join(ws.path, "convex", "schema.ts"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "audit.ts"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "tsconfig.json"))).toBe(true);

      // Components directory
      expect(existsSync(join(ws.path, "components", "sidebar.tsx"))).toBe(true);

      // Feature directories under convex/
      expect(existsSync(join(ws.path, "convex", "leave-request"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "approval-queue"))).toBe(true);
      expect(existsSync(join(ws.path, "convex", "leave-history"))).toBe(true);
    });

    it("layout includes ClerkProvider and ConvexClientProvider", () => {
      const layoutPath = join(ws.path, "app", "layout.tsx");
      const content = readFileSync(layoutPath, "utf-8");
      expect(content).toContain("ClerkProvider");
      expect(content).toContain("ConvexClientProvider");
      expect(content).toContain("Sidebar");
      expect(content).toContain("Leave Manager");
    });

    it("sidebar includes navigation links matching feature names", () => {
      const sidebarPath = join(ws.path, "components", "sidebar.tsx");
      const content = readFileSync(sidebarPath, "utf-8");

      // Check that the sidebar links to the correct routes
      expect(content).toContain("Leave Request");
      expect(content).toContain("Approval Queue");
      expect(content).toContain("Leave History");
      expect(content).toContain("Leave Manager"); // app title
    });

    it("returns feature results for all features", () => {
      expect(Object.keys(result.featureResults)).toHaveLength(3);
      expect(result.featureResults["feat-001"]).toBeTruthy();
      expect(result.featureResults["feat-002"]).toBeTruthy();
      expect(result.featureResults["feat-003"]).toBeTruthy();

      // All should succeed
      for (const [featureId, featureRun] of Object.entries(result.featureResults)) {
        expect(featureRun.status).toBe("build_succeeded");
        expect(featureRun.files_created.length).toBeGreaterThan(0);
      }
    });

    it("commits everything as a single git commit", () => {
      expect(result.run.final_commit).toBeTruthy();
      expect(result.run.final_commit).not.toBe(ws.base_commit);

      // PR summary should exist
      expect(result.prSummary).toContain("Leave Manager");
      expect(result.prSummary).toContain(ws.branch);
    });

    it("does NOT generate per-feature schema.ts files", () => {
      // The unified schema handles all tables — no per-feature schema.ts
      expect(existsSync(join(ws.path, "convex", "leave-request", "schema.ts"))).toBe(false);
      expect(existsSync(join(ws.path, "convex", "approval-queue", "schema.ts"))).toBe(false);
      expect(existsSync(join(ws.path, "convex", "leave-history", "schema.ts"))).toBe(false);
    });

    it("generates test files for all features", () => {
      expect(existsSync(join(ws.path, "tests", "leave-request"))).toBe(true);
      expect(existsSync(join(ws.path, "tests", "approval-queue"))).toBe(true);
      expect(existsSync(join(ws.path, "tests", "leave-history"))).toBe(true);
    });

    it("generates feature component files", () => {
      expect(existsSync(join(ws.path, "components", "leave-request", "status-badge.tsx"))).toBe(true);
      expect(existsSync(join(ws.path, "components", "approval-queue", "status-badge.tsx"))).toBe(true);
      expect(existsSync(join(ws.path, "components", "leave-history", "status-badge.tsx"))).toBe(true);
    });

    it("dashboard page includes feature cards", () => {
      const pagePath = join(ws.path, "app", "page.tsx");
      const content = readFileSync(pagePath, "utf-8");
      expect(content).toContain("Leave Manager");
      expect(content).toContain("Leave Request");
      expect(content).toContain("Approval Queue");
      expect(content).toContain("Leave History");
      expect(content).toContain("/leave-request");
      expect(content).toContain("/approval-queue");
      expect(content).toContain("/leave-history");
    });

    it("convex queries import from _generated/server (not per-feature)", () => {
      const queryPath = join(ws.path, "convex", "leave-request", "queries.ts");
      const content = readFileSync(queryPath, "utf-8");
      expect(content).toContain('from "../_generated/server"');
      expect(content).toContain("leave_request"); // table name
    });

    it("file_contents record includes all generated files", () => {
      expect(Object.keys(result.file_contents).length).toBeGreaterThan(10);
      expect(result.file_contents["app/layout.tsx"]).toBeTruthy();
      expect(result.file_contents["app/page.tsx"]).toBeTruthy();
      expect(result.file_contents["components/sidebar.tsx"]).toBeTruthy();
      expect(result.file_contents["convex/schema.ts"]).toBeTruthy();
    });
  });

  describe("edge cases", () => {
    it("handles empty feature build order", async () => {
      const builder = new AppBuilder();
      const appSpec = makeAppSpec();

      const result = await builder.buildApp("test-job-002", appSpec, {}, []);
      try {
        expect(result.run.status).toBe("build_succeeded");
        expect(Object.keys(result.featureResults)).toHaveLength(0);
        // Should still have the scaffold files
        expect(existsSync(join(result.workspace.path, "package.json"))).toBe(true);
        expect(existsSync(join(result.workspace.path, "app", "layout.tsx"))).toBe(true);
        expect(existsSync(join(result.workspace.path, "components", "sidebar.tsx"))).toBe(true);
      } finally {
        wm.cleanup(result.workspace);
      }
    });

    it("handles missing appSpec gracefully", async () => {
      const builder = new AppBuilder();
      const result = await builder.buildApp("test-job-003", null, {}, []);
      try {
        // Should still produce a buildable scaffold
        expect(result.run.status).toBe("build_succeeded");
        expect(existsSync(join(result.workspace.path, "package.json"))).toBe(true);
      } finally {
        wm.cleanup(result.workspace);
      }
    });

    it("skips features with no bridge", async () => {
      const builder = new AppBuilder();
      const appSpec = makeAppSpec();
      // Only provide bridge for feat-001
      const bridges = {
        "feat-001": makeBridge("feat-001", "Leave Request", ["Submit leave request form"]),
      };

      const result = await builder.buildApp(
        "test-job-004",
        appSpec,
        bridges,
        ["feat-001", "feat-002", "feat-003"],
      );
      try {
        // feat-001 should build; feat-002 and feat-003 should be skipped (no bridge)
        expect(result.featureResults["feat-001"]).toBeTruthy();
        expect(result.featureResults["feat-001"].status).toBe("build_succeeded");
        // feat-002 and feat-003 have no compiled package since their bridges weren't provided
        // They should be absent from featureResults (skipped)
        expect(result.featureResults["feat-002"]).toBeUndefined();
        expect(result.featureResults["feat-003"]).toBeUndefined();
      } finally {
        wm.cleanup(result.workspace);
      }
    });
  });
});

describe("builder-dispatcher integration", () => {
  it("builder-dispatcher source imports and uses AppBuilder", () => {
    const source = readFileSync(
      join(process.cwd(), "src/nodes/builder-dispatcher.ts"),
      "utf-8",
    );
    expect(source).toContain("AppBuilder");
    expect(source).toContain("buildApp");
    expect(source).toContain("Building complete application");
    expect(source).toContain("app-builder.js");
  });

  it("builder-dispatcher uses AppBuilder for whole-app builds", () => {
    const source = readFileSync(
      join(process.cwd(), "src/nodes/builder-dispatcher.ts"),
      "utf-8",
    );
    // Should create an AppBuilder instance
    expect(source).toContain("new AppBuilder()");
    // Should call buildApp with the right parameters
    expect(source).toContain("appBuilder.buildApp");
    expect(source).toContain("state.appSpec");
    expect(source).toContain("state.featureBridges");
    expect(source).toContain("state.featureBuildOrder");
    // Should store results under __app__ key
    expect(source).toContain('"__app__"');
  });

  it("builder-dispatcher has per-feature fallback", () => {
    const source = readFileSync(
      join(process.cwd(), "src/nodes/builder-dispatcher.ts"),
      "utf-8",
    );
    expect(source).toContain("perFeatureFallback");
    expect(source).toContain("Falling back to per-feature builds");
    expect(source).toContain("new CodeBuilder()");
  });
});
