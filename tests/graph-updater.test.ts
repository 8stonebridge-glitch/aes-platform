import { beforeEach, describe, expect, it, vi } from "vitest";
import { graphUpdater } from "../src/nodes/graph-updater.js";
import {
  resetNeo4jServiceForTests,
  setNeo4jServiceForTests,
} from "../src/services/neo4j-service.js";
import { getJobStore, resetJobStore } from "../src/store.js";

function makeState() {
  return {
    jobId: "job-graph-1",
    requestId: "req-graph-1",
    rawRequest: "internal approval portal",
    currentGate: "gate_3",
    intentConfirmed: true,
    userApproved: true,
    errorMessage: null,
    appSpec: null,
    featureBridges: {},
  } as any;
}

describe("graphUpdater", () => {
  beforeEach(() => {
    resetJobStore();
    resetNeo4jServiceForTests();
  });

  it("logs a no-op when Neo4j is not configured", async () => {
    const store = getJobStore();
    const state = makeState();

    store.create({
      jobId: state.jobId,
      requestId: state.requestId,
      rawRequest: state.rawRequest,
      currentGate: state.currentGate,
      durability: "memory_only",
      createdAt: new Date().toISOString(),
    });

    await graphUpdater(state);

    const logs = store.getLogs(state.jobId);
    expect(logs.at(-1)?.message).toContain("skipping knowledge graph sync");
  });

  it("uses the configured Neo4j service and logs success", async () => {
    const verifyConnectivity = vi.fn().mockResolvedValue(undefined);
    const writeExecutionSnapshot = vi.fn().mockResolvedValue({
      configured: true,
      wrote: true,
      appEntityId: "app-spec:app-123",
      featureCount: 2,
      bridgeCount: 2,
    });

    setNeo4jServiceForTests({
      verifyConnectivity,
      writeExecutionSnapshot,
    } as any);

    const store = getJobStore();
    const state = makeState();

    store.create({
      jobId: state.jobId,
      requestId: state.requestId,
      rawRequest: state.rawRequest,
      currentGate: state.currentGate,
      durability: "memory_only",
      createdAt: new Date().toISOString(),
    });

    await graphUpdater(state);

    expect(verifyConnectivity).toHaveBeenCalledTimes(1);
    expect(writeExecutionSnapshot).toHaveBeenCalledWith(state);

    const logs = store.getLogs(state.jobId);
    expect(logs.at(-1)?.message).toContain("Neo4j sync complete");
    expect(logs.at(-1)?.message).toContain("features=2");
    expect(logs.at(-1)?.message).toContain("bridges=2");
  });
});
