import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { GateErrorCode } from "../src/types/artifacts.js";
import type {
  IntentBrief,
  AppSpec,
  FeatureBridge,
  ValidationResult,
  VetoResult,
  LogEntry,
} from "../src/types/artifacts.js";

/**
 * Regression tests for persistence, replay, and GateErrorCode.
 * Tests 1-4 are unit tests (no Postgres required).
 * Tests 5+ require Postgres — they are skipped if unavailable.
 */

// ─── Unit tests (no Postgres) ────────────────────────────────────────

describe("GateErrorCode", () => {
  it("Gate 1 codes all start with G1_", () => {
    const g1Codes = Object.values(GateErrorCode).filter((c) =>
      c.startsWith("G1_")
    );
    expect(g1Codes.length).toBe(11);
    for (const code of g1Codes) {
      expect(code).toMatch(/^G1_/);
    }
  });

  it("Gate 2 codes all start with G2_", () => {
    const g2Codes = Object.values(GateErrorCode).filter((c) =>
      c.startsWith("G2_")
    );
    expect(g2Codes.length).toBe(12);
    for (const code of g2Codes) {
      expect(code).toMatch(/^G2_/);
    }
  });

  it("Gate 3 codes all start with G3_", () => {
    const g3Codes = Object.values(GateErrorCode).filter((c) =>
      c.startsWith("G3_")
    );
    expect(g3Codes.length).toBe(11);
    for (const code of g3Codes) {
      expect(code).toMatch(/^G3_/);
    }
  });

  it("no gate code prefix overlaps", () => {
    const all = Object.values(GateErrorCode);
    const g1 = all.filter((c) => c.startsWith("G1_"));
    const g2 = all.filter((c) => c.startsWith("G2_"));
    const g3 = all.filter((c) => c.startsWith("G3_"));
    expect(g1.length + g2.length + g3.length).toBe(all.length);
  });
});

describe("ValidationResult uses GateErrorCode", () => {
  it("can be typed with enum values", () => {
    const result: ValidationResult = {
      code: GateErrorCode.G1_FEATURES_WITHOUT_ACTORS,
      passed: false,
      reason: "2 features have no actors",
    };
    expect(result.code).toBe("G1_FEATURES_WITHOUT_ACTORS");
    expect(result.passed).toBe(false);
  });

  it("code prefix distinguishes gate 1 from gate 3", () => {
    const g1: ValidationResult = {
      code: GateErrorCode.G1_ACTORS_WITHOUT_ROLES,
      passed: false,
    };
    const g3: VetoResult = {
      code: GateErrorCode.G3_ROLE_BOUNDARY_NOT_DEFINED,
      triggered: true,
      reason: "auditor not declared",
      required_fix: "add auditor role",
      blocking_feature_ids: ["feat-001"],
    };
    expect(g1.code.startsWith("G1_")).toBe(true);
    expect(g3.code.startsWith("G3_")).toBe(true);
  });
});

describe("Artifact type shapes", () => {
  it("IntentBrief has all required fields", () => {
    const brief: IntentBrief = {
      request_id: "r-001",
      raw_request: "build approval portal",
      inferred_app_class: "workflow_approval_system",
      inferred_primary_users: ["requesters"],
      inferred_core_outcome: "approve requests",
      inferred_platforms: ["web"],
      inferred_risk_class: "low",
      inferred_integrations: [],
      explicit_inclusions: [],
      explicit_exclusions: [],
      ambiguity_flags: [],
      assumptions: [],
      confirmation_statement: "You want a workflow approval system — correct?",
      confirmation_status: "confirmed",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(brief.inferred_app_class).toBe("workflow_approval_system");
    expect(brief.confirmation_status).toBe("confirmed");
  });

  it("FeatureBridge status is a typed union", () => {
    const validStatuses = [
      "draft",
      "validated",
      "blocked",
      "approved",
      "executing",
      "failed",
      "passed",
    ] as const;
    for (const s of validStatuses) {
      const bridge: Partial<FeatureBridge> = { status: s };
      expect(bridge.status).toBe(s);
    }
  });

  it("LogEntry supports error_code field", () => {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      gate: "gate_1",
      message: "Actors without roles: auditor",
      level: "error",
      error_code: GateErrorCode.G1_ACTORS_WITHOUT_ROLES,
    };
    expect(entry.error_code).toBe("G1_ACTORS_WITHOUT_ROLES");
    expect(entry.level).toBe("error");
  });
});

describe("JobStore in-memory fallback", () => {
  it("works without persistence layer", async () => {
    // Import fresh to avoid shared state
    const { JobStore } = await import("../src/store.js");
    const store = new JobStore();

    expect(store.hasPersistence()).toBe(false);

    store.create({
      jobId: "test-001",
      requestId: "r-test",
      rawRequest: "test request",
      currentGate: "gate_0",
      createdAt: new Date().toISOString(),
    });

    const job = store.get("test-001");
    expect(job).toBeDefined();
    expect(job!.rawRequest).toBe("test request");

    store.update("test-001", { currentGate: "gate_1" });
    expect(store.get("test-001")!.currentGate).toBe("gate_1");

    store.addLog("test-001", { gate: "gate_0", message: "test log" });
    const logs = store.getLogs("test-001");
    expect(logs.length).toBe(1);
    expect(logs[0].message).toBe("test log");
  });

  it("loadFromPostgres returns null without persistence", async () => {
    const { JobStore } = await import("../src/store.js");
    const store = new JobStore();
    const result = await store.loadFromPostgres("nonexistent");
    expect(result).toBeNull();
  });
});
