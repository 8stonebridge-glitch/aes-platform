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
import { intentClassifier, keywordClassifyIntent } from "../src/nodes/intent-classifier.js";
import { resetLLM } from "../src/llm/provider.js";

// ─── Helper: build a minimal state ────────────────────────────────────

function makeState(rawRequest: string): any {
  return {
    jobId: "test-job-1",
    requestId: "test-req-1",
    rawRequest,
    currentGate: "gate_0",
    intentBrief: null,
    intentConfirmed: false,
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
  };
}

// ─── Valid LLM response fixture ───────────────────────────────────────

const VALID_LLM_INTENT = {
  inferred_app_class: "workflow_approval_system",
  inferred_primary_users: ["employees", "managers", "HR staff"],
  inferred_core_outcome: "streamline leave request and approval workflows",
  inferred_platforms: ["web", "admin_console"],
  inferred_risk_class: "low",
  inferred_integrations: ["email"],
  explicit_inclusions: ["leave balance tracking", "calendar integration"],
  explicit_exclusions: ["payroll processing"],
  ambiguity_flags: [],
  assumptions: ["Leave types include annual, sick, and unpaid leave"],
  confirmation_statement:
    "You want a workflow approval system for employees and managers to streamline leave requests with email notifications and calendar integration — correct?",
};

// ─── Tests ──────────────────────────────────────────────────────────────

describe("Intent Classifier", () => {
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

  // ── Keyword fallback tests ──────────────────────────────────────────

  describe("keyword fallback (no API key)", () => {
    it("uses keyword classifier when no OPENAI_API_KEY is set", async () => {
      const state = makeState(
        "I need an internal admin dashboard for ops team to manage inventory"
      );
      const result = await intentClassifier(state);

      expect(result.intentBrief).toBeDefined();
      expect(result.intentBrief.inferred_app_class).toBe("internal_ops_tool");
      expect(result.intentBrief.inferred_risk_class).toBe("low");
      expect(result.intentBrief.inferred_platforms).toContain("web");
      expect(result.intentBrief.schema_version).toBe(1);

      // LLM should NOT have been invoked
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it("auto-confirms low-risk, zero-ambiguity requests", async () => {
      const state = makeState(
        "I need an internal admin dashboard for the ops team to track inventory and manage orders"
      );
      const result = await intentClassifier(state);

      expect(result.intentConfirmed).toBe(true);
      expect(result.intentBrief.confirmation_status).toBe(
        "auto_confirmed_low_ambiguity"
      );
    });

    it("sets pending for regulated-risk requests", async () => {
      const state = makeState(
        "Build a fintech wallet app for sending money between users with Stripe payments"
      );
      const result = await intentClassifier(state);

      expect(result.intentConfirmed).toBe(false);
      expect(result.intentBrief.confirmation_status).toBe("pending");
      expect(result.intentBrief.inferred_risk_class).toBe("regulated");
    });
  });

  // ── LLM-powered tests ──────────────────────────────────────────────

  describe("LLM-powered classification", () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = "sk-test-key";
      resetLLM();
    });

    it("returns LLM result when API key is set and LLM succeeds", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_INTENT });

      const state = makeState(
        "Build a leave management system where employees can request time off and managers can approve or reject"
      );
      const result = await intentClassifier(state);

      expect(result.intentBrief).toBeDefined();
      expect(result.intentBrief.inferred_app_class).toBe("workflow_approval_system");
      expect(result.intentBrief.inferred_core_outcome).toBe(
        "streamline leave request and approval workflows"
      );
      // LLM can populate fields the keyword classifier can't
      expect(result.intentBrief.explicit_inclusions).toEqual([
        "leave balance tracking",
        "calendar integration",
      ]);
      expect(result.intentBrief.assumptions).toEqual([
        "Leave types include annual, sick, and unpaid leave",
      ]);
      expect(result.intentBrief.schema_version).toBe(1);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("auto-confirms when LLM returns low risk with no ambiguity", async () => {
      mockInvoke.mockResolvedValueOnce({
        ...VALID_LLM_INTENT,
        inferred_risk_class: "low",
        ambiguity_flags: [],
      });

      const state = makeState("Build a leave management system for employees");
      const result = await intentClassifier(state);

      expect(result.intentConfirmed).toBe(true);
      expect(result.intentBrief.confirmation_status).toBe(
        "auto_confirmed_low_ambiguity"
      );
    });

    it("sets pending when LLM returns ambiguity flags", async () => {
      mockInvoke.mockResolvedValueOnce({
        ...VALID_LLM_INTENT,
        inferred_risk_class: "low",
        ambiguity_flags: ["ambiguous_scope"],
      });

      const state = makeState("Build an app");
      const result = await intentClassifier(state);

      expect(result.intentConfirmed).toBe(false);
      expect(result.intentBrief.confirmation_status).toBe("pending");
    });

    it("ensures 'web' is always in platforms even if LLM omits it", async () => {
      mockInvoke.mockResolvedValueOnce({
        ...VALID_LLM_INTENT,
        inferred_platforms: ["pwa"],
      });

      const state = makeState("Build a mobile leave management app");
      const result = await intentClassifier(state);

      expect(result.intentBrief.inferred_platforms).toContain("web");
      expect(result.intentBrief.inferred_platforms[0]).toBe("web");
    });

    it("falls back to keyword classifier when LLM throws error", async () => {
      mockInvoke.mockRejectedValueOnce(new Error("API rate limit exceeded"));

      const state = makeState(
        "I need an internal admin dashboard for ops team to manage inventory and track shipments"
      );
      const result = await intentClassifier(state);

      // Should still succeed with keyword classifier
      expect(result.intentBrief).toBeDefined();
      expect(result.intentBrief.inferred_app_class).toBe("internal_ops_tool");

      // Warn callback should fire
      expect(mockCallbacks.onWarn).toHaveBeenCalledWith(
        expect.stringContaining("LLM classification failed")
      );
    });

    it("populates request_id and timestamps on LLM result", async () => {
      mockInvoke.mockResolvedValueOnce({ ...VALID_LLM_INTENT });

      const state = makeState("Build a leave management system");
      const result = await intentClassifier(state);

      expect(result.intentBrief.request_id).toBe("test-req-1");
      expect(result.intentBrief.raw_request).toBe("Build a leave management system");
      expect(result.intentBrief.created_at).toBeDefined();
      expect(result.intentBrief.updated_at).toBeDefined();
    });
  });

  // ── keywordClassifyIntent exported function ─────────────────────────

  describe("keywordClassifyIntent (direct)", () => {
    it("correctly classifies a marketplace request", () => {
      const brief = keywordClassifyIntent(
        "Build a two-sided marketplace where sellers list products and buyers can purchase them",
        "req-123"
      );

      expect(brief.inferred_app_class).toBe("marketplace");
      expect(brief.inferred_risk_class).toBe("medium");
      expect(brief.request_id).toBe("req-123");
      expect(brief.schema_version).toBe(1);
    });

    it("returns empty arrays for explicit_inclusions and assumptions", () => {
      const brief = keywordClassifyIntent("Build a dashboard", "req-456");

      expect(brief.explicit_inclusions).toEqual([]);
      expect(brief.explicit_exclusions).toEqual([]);
      expect(brief.assumptions).toEqual([]);
    });
  });
});
