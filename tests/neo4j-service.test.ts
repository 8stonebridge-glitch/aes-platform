import { describe, expect, it, vi } from "vitest";
import { Neo4jService } from "../src/services/neo4j-service.js";

function makeState() {
  return {
    jobId: "job-123",
    requestId: "req-123",
    rawRequest: "internal approval portal",
    currentGate: "gate_3",
    intentConfirmed: true,
    userApproved: true,
    errorMessage: null,
    appSpec: {
      app_id: "app-123",
      title: "Approval Portal",
      summary: "Manage approval workflows",
      app_class: "workflow_approval_system",
      risk_class: "medium",
      confidence: { overall: 0.85 },
      roles: [{ role_id: "admin" }],
      permissions: [{ resource: "feat-001" }],
      dependency_graph: [],
      features: [
        {
          feature_id: "feat-001",
          name: "Approval Dashboard",
          summary: "Shows approvals",
          actor_ids: ["admin"],
        },
      ],
    },
    featureBridges: {
      "feat-001": {
        bridge_id: "bridge-123",
        feature_id: "feat-001",
        feature_name: "Approval Dashboard",
        status: "validated",
        build_scope: {
          objective: "Approval dashboard works",
        },
        dependencies: [],
        required_tests: [],
      },
    },
  } as any;
}

describe("Neo4jService", () => {
  it("returns null config when env is incomplete", () => {
    expect(Neo4jService.getConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("writes job, app spec, feature spec, and bridge records", async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    const executeWrite = vi.fn(async (fn: any) => fn({ run }));
    const closeSession = vi.fn().mockResolvedValue(undefined);
    const fakeSession = {
      executeWrite,
      close: closeSession,
    };

    const fakeDriver = {
      session: vi.fn(() => fakeSession),
      verifyConnectivity: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const service = new Neo4jService(fakeDriver as any, "neo4j");
    const result = await service.writeExecutionSnapshot(makeState());

    expect(fakeDriver.session).toHaveBeenCalledWith({ database: "neo4j" });
    expect(executeWrite).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(4);
    expect(String(run.mock.calls[0]?.[0])).toContain("MERGE (job:JobRun");
    expect(String(run.mock.calls[1]?.[0])).toContain("MERGE (e:Entity");
    expect(String(run.mock.calls[2]?.[0])).toContain("HAS_FEATURE_SPEC");
    expect(String(run.mock.calls[3]?.[0])).toContain("COMPILED_BRIDGE");
    expect(closeSession).toHaveBeenCalled();
    expect(result).toMatchObject({
      configured: true,
      wrote: true,
      appEntityId: "app-spec:app-123",
      featureCount: 1,
      bridgeCount: 1,
    });
  });
});
