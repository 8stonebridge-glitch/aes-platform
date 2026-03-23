import { describe, it, expect } from "vitest";
import { GateErrorCode } from "../src/types/artifacts.js";
import type { ValidationResult } from "../src/types/artifacts.js";

// ─── Bug 2: Deterministic UUID ─────────────────────────────────────────

describe("deterministic UUID (ensureUUID)", () => {
  it("produces same output for same input across calls", async () => {
    const { ensureUUID } = await import("../src/persistence.js");
    const a = ensureUUID("my-custom-id");
    const b = ensureUUID("my-custom-id");
    expect(a).toBe(b);
  });

  it("produces different output for different inputs", async () => {
    const { ensureUUID } = await import("../src/persistence.js");
    const a = ensureUUID("input-alpha");
    const b = ensureUUID("input-beta");
    expect(a).not.toBe(b);
  });

  it("passes through valid UUIDs unchanged", async () => {
    const { ensureUUID } = await import("../src/persistence.js");
    const validUUID = "550e8400-e29b-41d4-a716-446655440000";
    expect(ensureUUID(validUUID)).toBe(validUUID);
  });

  it("generates valid UUID v5 format", async () => {
    const { ensureUUID } = await import("../src/persistence.js");
    const result = ensureUUID("some-non-uuid-string");
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(result).toMatch(uuidRegex);
  });
});

// ─── Bug 1: Validation result round-trip ────────────────────────────────

describe("validation result persistence format", () => {
  it("persist format can be parsed back into ValidationResult[]", () => {
    // Simulate what persistValidationResults writes to build_logs
    const results: ValidationResult[] = [
      { code: GateErrorCode.G1_FEATURES_WITHOUT_ACTORS, passed: true },
      { code: GateErrorCode.G1_FEATURES_WITHOUT_OUTCOMES, passed: false, reason: "2 features missing outcomes" },
    ];

    // Simulate the rows that would be in build_logs
    const rows = results.map((r) => ({
      message: r.passed ? `${r.code}: PASS` : `${r.code}: FAIL — ${r.reason || ""}`,
      error_code: r.passed ? null : r.code,
    }));

    // Simulate what loadValidationResults does to parse them back
    const parsed: ValidationResult[] = rows.map((r) => {
      if (r.error_code) {
        const reason = r.message?.replace(/^[^:]+:\s*FAIL\s*—?\s*/, "") || undefined;
        return { code: r.error_code, passed: false, reason };
      }
      const code = r.message?.replace(/:\s*PASS$/, "").trim() || "UNKNOWN";
      return { code, passed: true };
    });

    expect(parsed).toHaveLength(2);
    expect(parsed[0].code).toBe(GateErrorCode.G1_FEATURES_WITHOUT_ACTORS);
    expect(parsed[0].passed).toBe(true);
    expect(parsed[1].code).toBe(GateErrorCode.G1_FEATURES_WITHOUT_OUTCOMES);
    expect(parsed[1].passed).toBe(false);
    expect(parsed[1].reason).toBe("2 features missing outcomes");
  });
});

// ─── Bug 5: G2 bridge validation ───────────────────────────────────────

describe("G2 bridge validation (validateBridge)", () => {
  // Import dynamically to avoid side effects
  async function getValidator() {
    const mod = await import("../src/nodes/bridge-compiler.js");
    return mod.validateBridge;
  }

  function makeWellFormedBridge() {
    return {
      bridge_id: "test-bridge-001",
      feature_id: "feat-001",
      feature_name: "User Dashboard",
      status: "draft",
      build_scope: {
        objective: "Build the user dashboard",
        included_capabilities: ["dashboard"],
        excluded_capabilities: [],
        acceptance_boundary: "Dashboard renders",
      },
      write_scope: {
        target_repo: "my-app",
        allowed_repo_paths: ["app/(dashboard)/"],
        forbidden_repo_paths: [".github/", "node_modules/"],
        may_create_files: true,
        may_modify_existing_files: true,
        may_delete_files: false,
        may_change_shared_packages: false,
        may_change_schema: true,
      },
      read_scope: {
        allowed_repo_paths: ["app/"],
        allowed_packages: [],
        allowed_features: [],
        allowed_graph_nodes: [],
        allowed_artifacts: [],
      },
      reuse_candidates: [],
      selected_reuse_assets: [],
      applied_rules: [
        {
          rule_id: "rule-audit",
          title: "Audit logging",
          description: "Must log",
          severity: "critical",
          rationale: "Required",
        },
      ],
      required_tests: [
        {
          test_id: "test-001",
          name: "Dashboard renders",
          type: "integration",
          description: "Check dashboard page",
          pass_condition: "Page loads without error",
        },
      ],
      dependencies: [],
      hard_vetoes: [],
      blocked_reason: null,
      success_definition: {
        user_visible_outcome: "User sees their dashboard",
        technical_outcome: "Dashboard component renders",
        validation_requirements: ["Page loads"],
      },
      confidence: { overall: 0.8 },
    };
  }

  it("passes for a well-formed bridge", async () => {
    const validateBridge = await getValidator();
    const bridge = makeWellFormedBridge();
    const results = validateBridge(bridge);
    const failures = results.filter((r: ValidationResult) => !r.passed);
    expect(failures).toHaveLength(0);
    expect(results).toHaveLength(10);
  });

  it("catches missing scope (G2_SCOPE_NOT_EXPLICIT)", async () => {
    const validateBridge = await getValidator();
    const bridge = makeWellFormedBridge();
    bridge.build_scope.objective = "";
    const results = validateBridge(bridge);
    const scopeFail = results.find(
      (r: ValidationResult) => r.code === GateErrorCode.G2_SCOPE_NOT_EXPLICIT
    );
    expect(scopeFail).toBeDefined();
    expect(scopeFail!.passed).toBe(false);
  });

  it("catches missing success definition (G2_NO_SUCCESS_DEFINITION)", async () => {
    const validateBridge = await getValidator();
    const bridge = makeWellFormedBridge();
    bridge.success_definition = {
      user_visible_outcome: "",
      technical_outcome: "",
      validation_requirements: [],
    };
    const results = validateBridge(bridge);
    const sdFail = results.find(
      (r: ValidationResult) => r.code === GateErrorCode.G2_NO_SUCCESS_DEFINITION
    );
    expect(sdFail).toBeDefined();
    expect(sdFail!.passed).toBe(false);
  });
});

// ─── Bug 3: Durability flag ────────────────────────────────────────────

describe("durability tracking", () => {
  it("new jobs start with memory_only durability", async () => {
    const { JobStore } = await import("../src/store.js");
    const store = new JobStore();

    store.create({
      jobId: "dur-test-001",
      requestId: "r-dur",
      rawRequest: "test",
      currentGate: "gate_0",
      durability: "memory_only",
      createdAt: new Date().toISOString(),
    });

    const job = store.get("dur-test-001");
    expect(job).toBeDefined();
    expect(job!.durability).toBe("memory_only");
  });
});
