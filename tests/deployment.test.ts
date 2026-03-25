import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deploymentHandler } from "../src/nodes/deployment-handler.js";
import {
  GithubService,
  isGithubConfigured,
} from "../src/services/github-service.js";
import {
  VercelService,
  isVercelConfigured,
} from "../src/services/vercel-service.js";
import type { AESStateType } from "../src/state.js";

// ─── Helpers ──────────────────────────────────────────────────────────

function makeState(overrides: Partial<AESStateType> = {}): AESStateType {
  const defaults = {
    jobId: "j-test-deploy-001",
    requestId: "r-test-001",
    rawRequest: "Build a task management app",
    currentGate: "building",
    intentBrief: null,
    intentConfirmed: true,
    appSpec: {
      title: "Task Manager Pro",
      summary: "A collaborative task management application",
      features: [],
    },
    specValidationResults: [],
    specRetryCount: 0,
    userApproved: true,
    currentFeatureId: null,
    featureBridges: {},
    featureBuildOrder: [],
    featureBuildIndex: 0,
    vetoResults: [],
    buildResults: {
      __app__: {
        run_id: "br-app-test",
        job_id: "j-test-deploy-001",
        feature_id: "__app__",
        feature_name: "Task Manager Pro",
        status: "build_succeeded",
        workspace_path: "/tmp/aes-build-test123",
        workspace_id: "ws-test",
        branch: "aes/j-test/task-manager-pro",
        base_commit: "abc123",
        final_commit: "def456",
        files_created: ["app/page.tsx", "app/layout.tsx"],
        files_modified: [],
        files_deleted: [],
      },
    },
    validatorResults: {},
    fixTrailEntries: [],
    deploymentUrl: null,
    errorMessage: null,
    needsUserInput: false,
    userInputPrompt: null,
  };
  return { ...defaults, ...overrides } as any;
}

// Mock callbacks so deployment-handler doesn't crash accessing them.
vi.mock("../src/graph.js", () => ({
  getCallbacks: () => ({
    onGate: vi.fn(),
    onStep: vi.fn(),
    onSuccess: vi.fn(),
    onFail: vi.fn(),
    onWarn: vi.fn(),
    onPause: vi.fn(),
    onFeatureStatus: vi.fn(),
    onNeedsApproval: vi.fn(),
    onNeedsConfirmation: vi.fn(),
  }),
}));

// ─── isGithubConfigured / isVercelConfigured ──────────────────────────

describe("isGithubConfigured", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns true when GITHUB_TOKEN is set", () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    delete process.env.AES_GITHUB_TOKEN;
    expect(isGithubConfigured()).toBe(true);
  });

  it("returns true when AES_GITHUB_TOKEN is set", () => {
    delete process.env.GITHUB_TOKEN;
    process.env.AES_GITHUB_TOKEN = "ghp_test";
    expect(isGithubConfigured()).toBe(true);
  });

  it("returns false when no token is set", () => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.AES_GITHUB_TOKEN;
    expect(isGithubConfigured()).toBe(false);
  });
});

describe("isVercelConfigured", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns true when VERCEL_TOKEN is set", () => {
    process.env.VERCEL_TOKEN = "vt_test";
    delete process.env.AES_VERCEL_TOKEN;
    expect(isVercelConfigured()).toBe(true);
  });

  it("returns true when AES_VERCEL_TOKEN is set", () => {
    delete process.env.VERCEL_TOKEN;
    process.env.AES_VERCEL_TOKEN = "vt_test";
    expect(isVercelConfigured()).toBe(true);
  });

  it("returns false when no token is set", () => {
    delete process.env.VERCEL_TOKEN;
    delete process.env.AES_VERCEL_TOKEN;
    expect(isVercelConfigured()).toBe(false);
  });
});

// ─── deploymentHandler ────────────────────────────────────────────────

describe("deploymentHandler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Clear all deployment-related env vars by default
    delete process.env.GITHUB_TOKEN;
    delete process.env.AES_GITHUB_TOKEN;
    delete process.env.VERCEL_TOKEN;
    delete process.env.AES_VERCEL_TOKEN;
    delete process.env.AES_GITHUB_ORG;
    delete process.env.VERCEL_TEAM_ID;
    delete process.env.AES_CLERK_PUBLISHABLE_KEY;
    delete process.env.AES_CLERK_SECRET_KEY;
    delete process.env.AES_CONVEX_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns currentGate: 'complete' when no services configured", async () => {
    const state = makeState();
    const result = await deploymentHandler(state);

    expect(result.currentGate).toBe("complete");
    expect(result.deploymentUrl).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });

  it("returns currentGate: 'failed' when no __app__ build result", async () => {
    const state = makeState({ buildResults: {} });
    const result = await deploymentHandler(state);

    expect(result.currentGate).toBe("failed");
    expect(result.errorMessage).toContain("No app build result");
  });

  it("calls GithubService.createRepo and pushWorkspace on success", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";

    const mockCreateRepo = vi.fn().mockResolvedValue({
      full_name: "testorg/task-manager-pro-j-test-d",
      clone_url: "https://github.com/testorg/task-manager-pro-j-test-d.git",
      html_url: "https://github.com/testorg/task-manager-pro-j-test-d",
    });
    const mockPushWorkspace = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(GithubService.prototype, "createRepo").mockImplementation(
      mockCreateRepo,
    );
    vi.spyOn(GithubService.prototype, "pushWorkspace").mockImplementation(
      mockPushWorkspace,
    );

    const state = makeState();
    const result = await deploymentHandler(state);

    expect(mockCreateRepo).toHaveBeenCalledTimes(1);
    expect(mockCreateRepo).toHaveBeenCalledWith(
      expect.stringContaining("task-manager-pro"),
      expect.any(String),
      false,
    );
    expect(mockPushWorkspace).toHaveBeenCalledTimes(1);
    expect(mockPushWorkspace).toHaveBeenCalledWith(
      "/tmp/aes-build-test123",
      "https://github.com/testorg/task-manager-pro-j-test-d.git",
    );
    expect(result.currentGate).toBe("complete");
  });

  it("calls VercelService.createProject and triggerDeployment on success", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.VERCEL_TOKEN = "vt_test";

    // Mock GitHub
    vi.spyOn(GithubService.prototype, "createRepo").mockResolvedValue({
      full_name: "testorg/task-manager-pro-j-test-d",
      clone_url: "https://github.com/testorg/task-manager-pro-j-test-d.git",
      html_url: "https://github.com/testorg/task-manager-pro-j-test-d",
    });
    vi.spyOn(GithubService.prototype, "pushWorkspace").mockResolvedValue(
      undefined,
    );

    // Mock Vercel
    const mockCreateProject = vi.fn().mockResolvedValue({
      id: "prj_test123",
      name: "task-manager-pro",
    });
    const mockTriggerDeploy = vi.fn().mockResolvedValue({
      id: "dpl_test123",
      url: "https://task-manager-pro.vercel.app",
      readyState: "BUILDING",
    });
    const mockWaitForDeploy = vi.fn().mockResolvedValue({
      url: "https://task-manager-pro.vercel.app",
      readyState: "READY",
    });

    vi.spyOn(VercelService.prototype, "createProject").mockImplementation(
      mockCreateProject,
    );
    vi.spyOn(
      VercelService.prototype,
      "triggerDeployment",
    ).mockImplementation(mockTriggerDeploy);
    vi.spyOn(
      VercelService.prototype,
      "waitForDeployment",
    ).mockImplementation(mockWaitForDeploy);

    const state = makeState();
    const result = await deploymentHandler(state);

    expect(mockCreateProject).toHaveBeenCalledTimes(1);
    expect(mockCreateProject).toHaveBeenCalledWith(
      "task-manager-pro",
      "testorg/task-manager-pro-j-test-d",
      expect.any(Object),
    );
    expect(mockTriggerDeploy).toHaveBeenCalledTimes(1);
    expect(mockWaitForDeploy).toHaveBeenCalledTimes(1);
    expect(result.deploymentUrl).toBe(
      "https://task-manager-pro.vercel.app",
    );
    expect(result.currentGate).toBe("complete");
  });

  it("sets deploymentUrl on success", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.VERCEL_TOKEN = "vt_test";

    vi.spyOn(GithubService.prototype, "createRepo").mockResolvedValue({
      full_name: "testorg/task-manager-pro-j-test-d",
      clone_url: "https://github.com/testorg/task-manager-pro-j-test-d.git",
      html_url: "https://github.com/testorg/task-manager-pro-j-test-d",
    });
    vi.spyOn(GithubService.prototype, "pushWorkspace").mockResolvedValue(
      undefined,
    );
    vi.spyOn(VercelService.prototype, "createProject").mockResolvedValue({
      id: "prj_test123",
      name: "task-manager-pro",
    });
    vi.spyOn(
      VercelService.prototype,
      "triggerDeployment",
    ).mockResolvedValue({
      id: "dpl_test123",
      url: "https://task-manager-pro.vercel.app",
      readyState: "BUILDING",
    });
    vi.spyOn(
      VercelService.prototype,
      "waitForDeployment",
    ).mockResolvedValue({
      url: "https://task-manager-pro.vercel.app",
      readyState: "READY",
    });

    const state = makeState();
    const result = await deploymentHandler(state);

    expect(result.deploymentUrl).toBe(
      "https://task-manager-pro.vercel.app",
    );
  });

  it("handles GitHub failure gracefully — still completes", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";

    vi.spyOn(GithubService.prototype, "createRepo").mockRejectedValue(
      new Error("GitHub create repo failed (401): Unauthorized"),
    );

    const state = makeState();
    const result = await deploymentHandler(state);

    // Should complete (not fail) — GitHub push is best-effort
    expect(result.currentGate).toBe("complete");
    expect(result.deploymentUrl).toBeNull();
    expect(result.errorMessage).toBeUndefined();
  });

  it("handles Vercel failure gracefully — still completes", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.VERCEL_TOKEN = "vt_test";

    vi.spyOn(GithubService.prototype, "createRepo").mockResolvedValue({
      full_name: "testorg/task-manager-pro-j-test-d",
      clone_url: "https://github.com/testorg/task-manager-pro-j-test-d.git",
      html_url: "https://github.com/testorg/task-manager-pro-j-test-d",
    });
    vi.spyOn(GithubService.prototype, "pushWorkspace").mockResolvedValue(
      undefined,
    );
    vi.spyOn(VercelService.prototype, "createProject").mockRejectedValue(
      new Error("Vercel create project failed (403): Forbidden"),
    );

    const state = makeState();
    const result = await deploymentHandler(state);

    // Should complete (not fail) — Vercel deploy is best-effort
    expect(result.currentGate).toBe("complete");
    expect(result.deploymentUrl).toBeNull();
    expect(result.errorMessage).toBeUndefined();
  });

  it("warns when Vercel configured but GitHub not (requires GitHub)", async () => {
    process.env.VERCEL_TOKEN = "vt_test";
    // No GITHUB_TOKEN

    const state = makeState();
    const result = await deploymentHandler(state);

    // Should complete — Vercel can't deploy without GitHub, but doesn't crash
    expect(result.currentGate).toBe("complete");
    expect(result.deploymentUrl).toBeNull();
  });

  it("injects Clerk and Convex env vars into Vercel project", async () => {
    process.env.GITHUB_TOKEN = "ghp_test";
    process.env.VERCEL_TOKEN = "vt_test";
    process.env.AES_CLERK_PUBLISHABLE_KEY = "pk_test_abc";
    process.env.AES_CLERK_SECRET_KEY = "sk_test_def";
    process.env.AES_CONVEX_URL = "https://test.convex.cloud";

    vi.spyOn(GithubService.prototype, "createRepo").mockResolvedValue({
      full_name: "testorg/task-manager-pro-j-test-d",
      clone_url: "https://github.com/testorg/task-manager-pro-j-test-d.git",
      html_url: "https://github.com/testorg/task-manager-pro-j-test-d",
    });
    vi.spyOn(GithubService.prototype, "pushWorkspace").mockResolvedValue(
      undefined,
    );

    const mockCreateProject = vi.fn().mockResolvedValue({
      id: "prj_test123",
      name: "task-manager-pro",
    });
    vi.spyOn(VercelService.prototype, "createProject").mockImplementation(
      mockCreateProject,
    );
    vi.spyOn(
      VercelService.prototype,
      "triggerDeployment",
    ).mockResolvedValue({
      id: "dpl_test123",
      url: "https://task-manager-pro.vercel.app",
      readyState: "BUILDING",
    });
    vi.spyOn(
      VercelService.prototype,
      "waitForDeployment",
    ).mockResolvedValue({
      url: "https://task-manager-pro.vercel.app",
      readyState: "READY",
    });

    const state = makeState();
    await deploymentHandler(state);

    // Verify env vars were passed to createProject
    const envVarsArg = mockCreateProject.mock.calls[0][2];
    expect(envVarsArg).toEqual({
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
      CLERK_SECRET_KEY: "sk_test_def",
      NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
    });
  });
});

// ─── Graph routing ────────────────────────────────────────────────────

describe("graph routing: validator_runner → deployment_handler → __end__", () => {
  it("graph.ts imports deployment-handler and wires it after validator_runner", async () => {
    // Read graph.ts source and verify it imports/registers deployment_handler.
    // We can't call buildAESGraph directly because the full graph imports
    // many modules with external dependencies, but we can verify the source.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");

    const graphSource = readFileSync(
      join(import.meta.dirname, "..", "src", "graph.ts"),
      "utf-8",
    );

    // Verify deployment_handler is imported
    expect(graphSource).toContain(
      'import { deploymentHandler } from "./nodes/deployment-handler.js"',
    );

    // Verify deployment_handler is added as a node
    expect(graphSource).toContain(
      'graph.addNode("deployment_handler", deploymentHandler)',
    );

    // Verify validator_runner routes to deployment_handler
    expect(graphSource).toContain('return "deployment_handler"');

    // Verify deployment_handler has conditional edges to __end__
    expect(graphSource).toContain(
      'graph.addConditionalEdges("deployment_handler", routeAfterDeploymentHandler)',
    );

    // Verify routeAfterDeploymentHandler always returns __end__
    expect(graphSource).toMatch(
      /routeAfterDeploymentHandler.*\{[\s\S]*?return "__end__"/,
    );
  });
});
