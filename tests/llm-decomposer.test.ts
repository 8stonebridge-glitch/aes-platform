import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock @langchain/openai ─────────────────────────────────────────────
// vi.mock is hoisted — factory must not reference variables outside the factory.

const mockInvoke = vi.fn();

vi.mock("@langchain/openai", () => {
  return {
    ChatOpenAI: class MockChatOpenAI {
      constructor(_opts: any) {}
      withStructuredOutput(_schema: any) {
        return { invoke: (...args: any[]) => mockInvoke(...args) };
      }
    },
  };
});

// ─── Mock graph callbacks and store ────────────────────────────────────

const mockCallbacks = {
  onGate: vi.fn(),
  onStep: vi.fn(),
  onSuccess: vi.fn(),
  onFail: vi.fn(),
  onWarn: vi.fn(),
  onPause: vi.fn(),
  onFeatureStatus: vi.fn(),
  onNeedsApproval: vi.fn(),
  onNeedsConfirmation: vi.fn(),
};

vi.mock("../src/graph.js", () => ({
  getCallbacks: () => mockCallbacks,
}));

vi.mock("../src/store.js", () => ({
  getJobStore: () => ({
    addLog: vi.fn(),
  }),
}));

// Now import the module under test (after all vi.mock calls)
import { decomposer, templateDecompose, topologicalSort } from "../src/nodes/decomposer.js";
import { resetLLM } from "../src/llm/provider.js";
import { CURRENT_SCHEMA_VERSION } from "../src/types/artifacts.js";

// ─── Helper: build a minimal state with confirmed intent brief ─────────

function makeState(overrides: Partial<any> = {}): any {
  return {
    jobId: "test-job-1",
    requestId: "test-req-1",
    rawRequest: "Build a leave management workflow system",
    currentGate: "gate_1",
    intentBrief: {
      request_id: "test-req-1",
      raw_request: "Build a leave management workflow system",
      inferred_app_class: "workflow_approval_system",
      inferred_primary_users: ["employees", "managers"],
      inferred_core_outcome: "submitting, reviewing, and approving requests",
      inferred_platforms: ["web"],
      inferred_risk_class: "low",
      inferred_integrations: [],
      explicit_inclusions: [],
      explicit_exclusions: [],
      ambiguity_flags: [],
      assumptions: [],
      confirmation_statement: "You want a workflow approval system — correct?",
      confirmation_status: "auto_confirmed_low_ambiguity",
      schema_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    intentConfirmed: true,
    appSpec: null,
    specValidationResults: [],
    specRetryCount: 0,
    userApproved: false,
    currentFeatureId: null,
    featureBridges: {},
    featureBuildOrder: [],
    featureBuildIndex: 0,
    vetoResults: [],
    buildResults: {},
    validatorResults: {},
    fixTrailEntries: [],
    deploymentUrl: null,
    errorMessage: null,
    needsUserInput: false,
    userInputPrompt: null,
    ...overrides,
  };
}

// ─── Valid LLM response fixture ───────────────────────────────────────

const VALID_LLM_APPSPEC = {
  title: "Leave Management System",
  summary: "A workflow system for managing employee leave requests and approvals",
  app_class: "workflow_approval_system",
  risk_class: "low",
  target_users: ["employees", "managers"],
  platforms: ["web"],
  actors: [
    { actor_id: "submitter", name: "Submitter", actor_type: "end_user", role_ids: ["submitter"], description: "Employee who submits leave requests" },
    { actor_id: "reviewer", name: "Reviewer", actor_type: "operator", role_ids: ["reviewer"], description: "Manager who reviews and approves requests" },
    { actor_id: "admin", name: "Admin", actor_type: "admin", role_ids: ["admin"], description: "System administrator" },
  ],
  roles: [
    { role_id: "submitter", name: "Submitter", description: "Can submit leave requests", scope: "org", inherits_from: [] },
    { role_id: "reviewer", name: "Reviewer", description: "Can review and approve/reject", scope: "org", inherits_from: ["submitter"] },
    { role_id: "admin", name: "Admin", description: "Full access", scope: "org", inherits_from: ["reviewer"] },
  ],
  permissions: [
    { permission_id: "p_submitter_allow_f_leave_request", role_id: "submitter", resource: "f_leave_request", effect: "allow" },
    { permission_id: "p_reviewer_allow_f_leave_request", role_id: "reviewer", resource: "f_leave_request", effect: "allow" },
    { permission_id: "p_reviewer_allow_f_approval_workflow", role_id: "reviewer", resource: "f_approval_workflow", effect: "allow" },
    { permission_id: "p_admin_allow_f_leave_request", role_id: "admin", resource: "f_leave_request", effect: "allow" },
    { permission_id: "p_admin_allow_f_approval_workflow", role_id: "admin", resource: "f_approval_workflow", effect: "allow" },
    { permission_id: "p_admin_allow_f_rbac", role_id: "admin", resource: "f_rbac", effect: "allow" },
    { permission_id: "p_submitter_allow_f_rbac", role_id: "submitter", resource: "f_rbac", effect: "allow" },
    { permission_id: "p_reviewer_allow_f_rbac", role_id: "reviewer", resource: "f_rbac", effect: "allow" },
  ],
  features: [
    {
      feature_id: "f_rbac",
      name: "Role-Based Access Control",
      summary: "Authentication and role management",
      description: "Manages user roles and permissions for the system",
      priority: "critical",
      status: "proposed",
      actor_ids: ["admin"],
      entity_ids: [],
      user_problem: "Need to control who can access what",
      outcome: "Users can only access features they are authorized for",
      destructive_actions: [],
      audit_required: true,
      offline_behavior_required: false,
      external_dependencies: [],
    },
    {
      feature_id: "f_leave_request",
      name: "Leave Request Submission",
      summary: "Submit and manage leave requests",
      description: "Employees submit leave requests with type, dates, and reason",
      priority: "critical",
      status: "proposed",
      actor_ids: ["submitter"],
      entity_ids: [],
      user_problem: "Employees need to request time off",
      outcome: "Employees can submit and track leave requests",
      destructive_actions: [],
      audit_required: false,
      offline_behavior_required: false,
      external_dependencies: [],
    },
    {
      feature_id: "f_approval_workflow",
      name: "Approval Workflow",
      summary: "Review and approve/reject leave requests",
      description: "Managers review pending requests and approve or reject them",
      priority: "critical",
      status: "proposed",
      actor_ids: ["reviewer"],
      entity_ids: [],
      user_problem: "Managers need to process leave requests",
      outcome: "Managers can approve or reject requests with comments",
      destructive_actions: [
        { action_name: "reject_request", reversible: false, confirmation_required: true, audit_logged: true },
      ],
      audit_required: true,
      offline_behavior_required: false,
      external_dependencies: [],
    },
  ],
  integrations: [],
  acceptance_tests: [
    {
      test_id: "t_rbac_happy_path",
      name: "RBAC — happy path",
      type: "user_journey",
      feature_id: "f_rbac",
      description: "Admin can manage roles",
      pass_condition: "Roles are created and assigned successfully",
      priority: "critical",
    },
    {
      test_id: "t_leave_request_happy_path",
      name: "Leave Request — happy path",
      type: "user_journey",
      feature_id: "f_leave_request",
      description: "Employee submits a leave request",
      pass_condition: "Request is created and visible in the queue",
      priority: "critical",
    },
    {
      test_id: "t_approval_happy_path",
      name: "Approval — happy path",
      type: "user_journey",
      feature_id: "f_approval_workflow",
      description: "Manager approves a leave request",
      pass_condition: "Request status changes to approved",
      priority: "critical",
    },
  ],
  dependency_graph: [
    {
      from_feature_id: "f_leave_request",
      to_feature_id: "f_rbac",
      type: "requires",
      reason: "Leave requests need authenticated users",
    },
    {
      from_feature_id: "f_approval_workflow",
      to_feature_id: "f_leave_request",
      type: "requires",
      reason: "Approval requires submitted requests",
    },
  ],
  confidence: {
    overall: 0.9,
    intent_clarity: 0.95,
    scope_completeness: 0.85,
    dependency_clarity: 0.9,
    integration_clarity: 0.95,
    compliance_clarity: 0.9,
    notes: ["Clear intent with well-defined workflow"],
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Decomposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLLM();
    delete process.env.OPENAI_API_KEY;
    delete process.env.AES_OPENAI_API_KEY;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AES_OPENAI_API_KEY;
  });

  // ── Failure guard ───────────────────────────────────────────────────

  describe("guard checks", () => {
    it("fails when intentBrief is null", async () => {
      const state = makeState({ intentBrief: null });
      const result = await decomposer(state);

      expect(result.currentGate).toBe("failed");
      expect(result.errorMessage).toContain("Intent not confirmed");
    });

    it("fails when intentConfirmed is false", async () => {
      const state = makeState({ intentConfirmed: false });
      const result = await decomposer(state);

      expect(result.currentGate).toBe("failed");
      expect(result.errorMessage).toContain("Intent not confirmed");
    });
  });

  // ── Template fallback tests ─────────────────────────────────────────

  describe("template fallback (no API key)", () => {
    it("uses template decomposer when no OPENAI_API_KEY is set", async () => {
      const state = makeState();
      const result = await decomposer(state);

      expect(result.appSpec).toBeDefined();
      expect(result.appSpec.features.length).toBeGreaterThan(0);
      expect(result.featureBuildOrder).toBeDefined();
      expect(result.featureBuildOrder!.length).toBeGreaterThan(0);
      expect(result.currentGate).toBe("gate_1");

      // LLM should NOT have been invoked
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("sets schema_version on template-generated appSpec", async () => {
      const state = makeState();
      const result = await decomposer(state);

      expect(result.appSpec.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    });

    it("emits onFeatureStatus for each feature", async () => {
      const state = makeState();
      await decomposer(state);

      expect(mockCallbacks.onFeatureStatus).toHaveBeenCalled();
      const calls = mockCallbacks.onFeatureStatus.mock.calls;
      for (const call of calls) {
        expect(call[2]).toBe("proposed"); // status argument
      }
    });
  });

  // ── LLM-powered tests ──────────────────────────────────────────────

  describe("LLM-powered decomposition", () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      resetLLM();
    });

    it("returns LLM result when API key is set and LLM succeeds", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_APPSPEC });

      const state = makeState();
      const result = await decomposer(state);

      expect(result.appSpec).toBeDefined();
      expect(result.appSpec.title).toBe("Leave Management System");
      expect(result.appSpec.features).toHaveLength(3);
      expect(result.currentGate).toBe("gate_1");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("adds system-level fields to LLM result", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_APPSPEC });

      const state = makeState();
      const result = await decomposer(state);

      // Fields the LLM doesn't generate but we add
      expect(result.appSpec.app_id).toBeDefined();
      expect(result.appSpec.request_id).toBe("test-req-1");
      expect(result.appSpec.intent_brief_id).toBe("test-req-1");
      expect(result.appSpec.domain_entities).toEqual([]);
      expect(result.appSpec.workflows).toEqual([]);
      expect(result.appSpec.non_functional_requirements).toEqual([]);
      expect(result.appSpec.compliance_requirements).toEqual([]);
      expect(result.appSpec.design_constraints).toEqual([]);
      expect(result.appSpec.risks).toEqual([]);
      expect(result.appSpec.schema_version).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.appSpec.created_at).toBeDefined();
      expect(result.appSpec.updated_at).toBeDefined();
    });

    it("generates topological build order from LLM dependency graph", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_APPSPEC });

      const state = makeState();
      const result = await decomposer(state);

      // f_rbac has no dependencies, so it should come first
      // f_leave_request depends on f_rbac
      // f_approval_workflow depends on f_leave_request
      const order = result.featureBuildOrder!;
      expect(order.indexOf("f_rbac")).toBeLessThan(order.indexOf("f_leave_request"));
      expect(order.indexOf("f_leave_request")).toBeLessThan(order.indexOf("f_approval_workflow"));
    });

    it("falls back to template decomposer when LLM throws error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("API timeout"));

      const state = makeState();
      const result = await decomposer(state);

      // Should still succeed with template decomposer
      expect(result.appSpec).toBeDefined();
      expect(result.appSpec.features.length).toBeGreaterThan(0);
      expect(result.currentGate).toBe("gate_1");

      // Warn callback should fire
      expect(mockCallbacks.onWarn).toHaveBeenCalledWith(
        expect.stringContaining("LLM decomposition failed")
      );
    });

    it("includes validation failures in prompt on retry", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_APPSPEC });

      const state = makeState({
        specRetryCount: 1,
        specValidationResults: [
          { code: "G1_FEATURES_WITHOUT_ACTORS", passed: false, reason: "Feature f_dashboard has no actors" },
          { code: "G1_FEATURES_WITHOUT_OUTCOMES", passed: true },
          { code: "G1_CRITICAL_FEATURES_NO_TESTS", passed: false, reason: "Feature f_auth has no tests" },
        ],
      });

      await decomposer(state);

      // Verify the prompt sent to LLM includes failure info
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      const invokeArgs = mockInvoke.mock.calls[0][0];
      const systemMessage = invokeArgs[0].content;
      expect(systemMessage).toContain("RETRY ATTEMPT 1/3");
      expect(systemMessage).toContain("G1_FEATURES_WITHOUT_ACTORS");
      expect(systemMessage).toContain("G1_CRITICAL_FEATURES_NO_TESTS");
      // Passed rules should NOT appear in failures list
      expect(systemMessage).not.toContain("G1_FEATURES_WITHOUT_OUTCOMES");
    });

    it("shows retry step message on retry", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_APPSPEC });

      const state = makeState({ specRetryCount: 2, specValidationResults: [] });
      await decomposer(state);

      expect(mockCallbacks.onStep).toHaveBeenCalledWith(
        expect.stringContaining("LLM retry 2/3")
      );
    });
  });

  // ── templateDecompose (direct) ──────────────────────────────────────

  describe("templateDecompose (direct)", () => {
    it("generates a valid appSpec with defaults when no template found", () => {
      const state = makeState();
      const { appSpec, featureBuildOrder } = templateDecompose(state);

      expect(appSpec.app_id).toBeDefined();
      expect(appSpec.features.length).toBeGreaterThan(0);
      expect(appSpec.roles.length).toBeGreaterThan(0);
      expect(appSpec.permissions.length).toBeGreaterThan(0);
      expect(appSpec.acceptance_tests.length).toBeGreaterThan(0);
      expect(featureBuildOrder.length).toBe(appSpec.features.length);
      expect(appSpec.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    });

    it("sets correct roles for workflow_approval_system", () => {
      const state = makeState();
      const { appSpec } = templateDecompose(state);

      const roleIds = appSpec.roles.map((r: any) => r.role_id);
      expect(roleIds).toContain("submitter");
      expect(roleIds).toContain("reviewer");
      expect(roleIds).toContain("admin");
    });
  });

  // ── topologicalSort (direct) ────────────────────────────────────────

  describe("topologicalSort", () => {
    it("sorts features respecting dependency order", () => {
      const features = [
        { feature_id: "a" },
        { feature_id: "b" },
        { feature_id: "c" },
      ];
      const edges = [
        { from_feature_id: "c", to_feature_id: "b", type: "requires", reason: "" },
        { from_feature_id: "b", to_feature_id: "a", type: "requires", reason: "" },
      ];

      const sorted = topologicalSort(features, edges);
      expect(sorted.indexOf("a")).toBeLessThan(sorted.indexOf("b"));
      expect(sorted.indexOf("b")).toBeLessThan(sorted.indexOf("c"));
    });

    it("handles features with no dependencies", () => {
      const features = [{ feature_id: "x" }, { feature_id: "y" }];
      const edges: any[] = [];

      const sorted = topologicalSort(features, edges);
      expect(sorted).toHaveLength(2);
      expect(sorted).toContain("x");
      expect(sorted).toContain("y");
    });
  });
});
