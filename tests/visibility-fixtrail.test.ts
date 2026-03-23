import { describe, it, expect } from "vitest";
import { CURRENT_SCHEMA_VERSION, GateErrorCode } from "../src/types/artifacts.js";
import type {
  FixTrailEntry,
  IntentBrief,
  AppSpec,
  FeatureBridge,
  ValidationResult,
  VetoResult,
  ApprovalRecord,
  LogEntry,
} from "../src/types/artifacts.js";

// ─── Requirement 2: FixTrailEntry round-trip ────────────────────────────

describe("FixTrailEntry", () => {
  it("can be constructed and round-tripped through JSON", () => {
    const entry: FixTrailEntry = {
      fix_id: "fix-abc123",
      job_id: "j-test-001",
      gate: "gate_1",
      error_code: GateErrorCode.G1_FEATURES_WITHOUT_ACTORS,
      issue_summary: "2 features have no actors assigned",
      root_cause: "Decomposer did not map actors to features",
      repair_action: "Manual spec repair required",
      status: "detected",
      related_artifact_ids: ["app-001", "feat-002"],
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    // Round-trip through JSON (simulates persist + load)
    const json = JSON.stringify(entry);
    const parsed: FixTrailEntry = JSON.parse(json);

    expect(parsed.fix_id).toBe("fix-abc123");
    expect(parsed.job_id).toBe("j-test-001");
    expect(parsed.gate).toBe("gate_1");
    expect(parsed.error_code).toBe("G1_FEATURES_WITHOUT_ACTORS");
    expect(parsed.status).toBe("detected");
    expect(parsed.related_artifact_ids).toEqual(["app-001", "feat-002"]);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.resolved_at).toBeNull();
  });

  it("supports all status values", () => {
    const statuses: FixTrailEntry["status"][] = [
      "detected", "repairing", "repaired", "unresolved", "escalated",
    ];
    for (const s of statuses) {
      const entry: Partial<FixTrailEntry> = { status: s };
      expect(entry.status).toBe(s);
    }
  });
});

// ─── Requirement 3: Schema version on all artifacts ─────────────────────

describe("schema_version field", () => {
  it("CURRENT_SCHEMA_VERSION is 1", () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(1);
  });

  it("IntentBrief accepts schema_version", () => {
    const brief: IntentBrief = {
      request_id: "r-001",
      raw_request: "build something",
      inferred_app_class: "test_app",
      inferred_primary_users: [],
      inferred_core_outcome: "test outcome",
      inferred_platforms: ["web"],
      inferred_risk_class: "low",
      inferred_integrations: [],
      explicit_inclusions: [],
      explicit_exclusions: [],
      ambiguity_flags: [],
      assumptions: [],
      confirmation_statement: "ok?",
      confirmation_status: "confirmed",
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    expect(brief.schema_version).toBe(1);
  });

  it("ApprovalRecord accepts schema_version", () => {
    const approval: ApprovalRecord = {
      job_id: "j-001",
      app_spec_id: "spec-001",
      approval_type: "app_plan_approval",
      approved: true,
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
    };
    expect(approval.schema_version).toBe(1);
  });

  it("FixTrailEntry requires schema_version", () => {
    const fix: FixTrailEntry = {
      fix_id: "fix-001",
      job_id: "j-001",
      gate: "gate_1",
      error_code: "G1_TEST",
      issue_summary: "test",
      root_cause: "test",
      repair_action: "test",
      status: "detected",
      related_artifact_ids: [],
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };
    expect(fix.schema_version).toBe(1);
  });

  it("VetoResult accepts optional schema_version", () => {
    const veto: VetoResult = {
      code: GateErrorCode.G3_AUTH_NOT_DEFINED,
      triggered: false,
      reason: "",
      required_fix: "",
      blocking_feature_ids: [],
      schema_version: CURRENT_SCHEMA_VERSION,
    };
    expect(veto.schema_version).toBe(1);
  });
});

// ─── Requirement 4: Resume gate detection ────────────────────────────────

describe("resume gate detection", () => {
  // Import determineResumeGate from the resume command
  async function getDetector() {
    const mod = await import("../src/cli/commands/resume.js");
    return mod.determineResumeGate;
  }

  it("detects correct gate from no-intent state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      durability: "confirmed",
    });
    expect(result).toBe("gate_0");
  });

  it("detects correct gate from intent-only state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      durability: "confirmed",
    });
    expect(result).toBe("gate_1_decompose");
  });

  it("detects correct gate from spec-without-approval state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      appSpec: { app_id: "a-1" },
      userApproved: false,
      durability: "confirmed",
    });
    expect(result).toBe("gate_1_approve");
  });

  it("detects correct gate from approved-without-bridges state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      appSpec: { app_id: "a-1" },
      userApproved: true,
      featureBridges: {},
      durability: "confirmed",
    });
    expect(result).toBe("gate_2");
  });

  it("detects correct gate from bridges-without-vetoes state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      appSpec: { app_id: "a-1" },
      userApproved: true,
      featureBridges: { "f-1": { bridge_id: "b-1", status: "draft" } },
      vetoResults: [],
      durability: "confirmed",
    });
    expect(result).toBe("gate_3");
  });

  it("detects complete state", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      appSpec: { app_id: "a-1" },
      userApproved: true,
      featureBridges: { "f-1": { bridge_id: "b-1", status: "validated" } },
      vetoResults: [{ code: "G3_AUTH", triggered: false }],
      durability: "confirmed",
    });
    expect(result).toBe("complete");
  });

  it("refuses blocked bridges", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      appSpec: { app_id: "a-1" },
      userApproved: true,
      featureBridges: {
        "f-1": { bridge_id: "b-1", status: "blocked", blocked_reason: "veto" },
      },
      durability: "confirmed",
    });
    expect(result).toBe("blocked");
  });

  it("refuses non-confirmed durability", async () => {
    const determineResumeGate = await getDetector();
    const result = determineResumeGate({
      intentBrief: { request_id: "r-1" },
      durability: "memory_only",
    });
    expect(result).toBeNull();
  });
});

// ─── Requirement 5: BuilderPackage ──────────────────────────────────────

describe("BuilderPackage compilation", () => {
  async function getCompiler() {
    const mod = await import("../src/builder-artifact.js");
    return mod.compileBuilderPackage;
  }

  function makeCompleteJob(): any {
    return {
      jobId: "j-test-pkg",
      requestId: "r-pkg",
      rawRequest: "test",
      currentGate: "gate_3",
      createdAt: new Date().toISOString(),
      durability: "confirmed",
      userApproved: true,
      featureBridges: {
        "feat-001": {
          bridge_id: "bridge-001",
          app_id: "app-001",
          app_spec_id: "spec-001",
          feature_id: "feat-001",
          feature_name: "User Dashboard",
          status: "validated",
          build_scope: {
            objective: "Build dashboard",
            included_capabilities: ["dashboard"],
            excluded_capabilities: [],
            acceptance_boundary: "Dashboard renders",
          },
          read_scope: {
            allowed_repo_paths: ["app/"],
            allowed_packages: [],
            allowed_features: [],
            allowed_graph_nodes: [],
            allowed_artifacts: [],
          },
          write_scope: {
            target_repo: "my-app",
            allowed_repo_paths: ["app/(dashboard)/"],
            forbidden_repo_paths: [".github/"],
            may_create_files: true,
            may_modify_existing_files: true,
            may_delete_files: false,
            may_change_shared_packages: false,
            may_change_schema: true,
          },
          reuse_candidates: [
            {
              candidate_id: "c-1",
              asset_type: "component",
              source_repo: "template",
              source_path: "components/dashboard.tsx",
              name: "DashboardLayout",
              description: "Base dashboard layout",
              fit_reason: "matches",
              constraints: [],
              selected: true,
            },
          ],
          selected_reuse_assets: ["c-1"],
          applied_rules: [
            {
              rule_id: "rule-audit",
              title: "Audit logging",
              description: "Log all mutations",
              severity: "critical",
              rationale: "Required",
            },
          ],
          required_tests: [
            {
              test_id: "test-001",
              name: "Dashboard renders",
              type: "integration",
              description: "Check render",
              pass_condition: "Page loads without error",
            },
          ],
          dependencies: [],
          hard_vetoes: [
            {
              code: "G3_AUTH_NOT_DEFINED",
              triggered: false,
              reason: "",
              required_fix: "",
              blocking_feature_ids: [],
            },
          ],
          blocked_reason: null,
          success_definition: {
            user_visible_outcome: "User sees dashboard",
            technical_outcome: "Dashboard component renders",
            validation_requirements: ["Page loads"],
          },
          confidence: { overall: 0.8, scope_clarity: 0.8, reuse_fit: 0.8, dependency_clarity: 0.9, rule_coverage: 0.85, test_coverage: 0.8, notes: [] },
          schema_version: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    };
  }

  it("compiles BuilderPackage from complete job", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    const pkg = compileBuilderPackage(job, "feat-001");

    expect(pkg).not.toBeNull();
    expect(pkg!.job_id).toBe("j-test-pkg");
    expect(pkg!.feature_id).toBe("feat-001");
    expect(pkg!.feature_name).toBe("User Dashboard");
    expect(pkg!.objective).toBe("Build dashboard");
    expect(pkg!.target_repo).toBe("my-app");
    expect(pkg!.allowed_write_paths).toEqual(["app/(dashboard)/"]);
    expect(pkg!.reuse_assets).toHaveLength(1);
    expect(pkg!.rules).toHaveLength(1);
    expect(pkg!.required_tests).toHaveLength(1);
    expect(pkg!.schema_version).toBe(CURRENT_SCHEMA_VERSION);
    expect(pkg!.success_definition.user_visible_outcome).toBe("User sees dashboard");
  });

  it("returns null for incomplete job (no approval)", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    job.userApproved = false;
    const pkg = compileBuilderPackage(job, "feat-001");
    expect(pkg).toBeNull();
  });

  it("returns null for job with triggered vetoes", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    job.featureBridges["feat-001"].hard_vetoes = [
      {
        code: "G3_AUTH_NOT_DEFINED",
        triggered: true,
        reason: "No auth",
        required_fix: "Add auth",
        blocking_feature_ids: ["feat-001"],
      },
    ];
    const pkg = compileBuilderPackage(job, "feat-001");
    expect(pkg).toBeNull();
  });

  it("returns null for blocked bridge", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    job.featureBridges["feat-001"].status = "blocked";
    const pkg = compileBuilderPackage(job, "feat-001");
    expect(pkg).toBeNull();
  });

  it("returns null for non-existent feature", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    const pkg = compileBuilderPackage(job, "feat-nonexistent");
    expect(pkg).toBeNull();
  });

  it("returns null when no bridges exist", async () => {
    const compileBuilderPackage = await getCompiler();
    const job = makeCompleteJob();
    job.featureBridges = undefined;
    const pkg = compileBuilderPackage(job, "feat-001");
    expect(pkg).toBeNull();
  });
});

// ─── FixTrail in JobStore ────────────────────────────────────────────────

describe("FixTrail in JobStore", () => {
  it("addFixTrail stores entries on the job record", async () => {
    const { JobStore } = await import("../src/store.js");
    const store = new JobStore();

    store.create({
      jobId: "fix-test-001",
      requestId: "r-fix",
      rawRequest: "test",
      currentGate: "gate_0",
      durability: "memory_only",
      createdAt: new Date().toISOString(),
    });

    const entry: FixTrailEntry = {
      fix_id: "fix-001",
      job_id: "fix-test-001",
      gate: "gate_1",
      error_code: "G1_TEST",
      issue_summary: "test issue",
      root_cause: "test cause",
      repair_action: "test action",
      status: "detected",
      related_artifact_ids: [],
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      resolved_at: null,
    };

    store.addFixTrail("fix-test-001", entry);

    const job = store.get("fix-test-001");
    expect(job).toBeDefined();
    expect(job!.fixTrailEntries).toBeDefined();
    expect(job!.fixTrailEntries).toHaveLength(1);
    expect(job!.fixTrailEntries![0].fix_id).toBe("fix-001");
  });
});
