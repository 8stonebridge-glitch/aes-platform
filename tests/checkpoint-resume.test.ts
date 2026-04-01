import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { resetJobStore, getJobStore } from "../src/store.js";
import { recordCheckpoint } from "../src/checkpoints.js";
import { invalidationToResumeGate } from "../src/checkpoints.js";

// Stub CheckRunner so compile gate is fast and deterministic
vi.mock("../src/builder/check-runner.js", () => {
  class FakeCheckRunner {
    async runConvexTypecheck(_workspace: string) {
      return { passed: true, check: "convex", output: "" };
    }
    async runTypecheck(_workspace: string) {
      return { passed: true, check: "typecheck", output: "" };
    }
    async runBuild(_workspace: string) {
      return { passed: true, check: "build", output: "" };
    }
  }
  return { CheckRunner: FakeCheckRunner };
});

// Import after mock is registered
import { resumeCompileGate } from "../src/nodes/deployment-handler.js";

describe("checkpoint resume from compile gate", () => {
  beforeEach(() => {
    resetJobStore();
  });

  afterEach(() => {
    resetJobStore();
  });

  it("records checkpoints and passes when rerunning compile gate on existing workspace", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "aes-compile-resume-"));
    mkdirSync(join(workspace, "node_modules")); // skip install

    // git init so git status/add/commit don't explode even if unused
    execSync("git init -q", { cwd: workspace });
    execSync('git config user.email "tests@example.com"', { cwd: workspace });
    execSync('git config user.name "AES Tests"', { cwd: workspace });

    const store = getJobStore();
    store.create({
      jobId: "job-test-compile",
      requestId: "job-test-compile",
      rawRequest: "resume compile gate",
      currentGate: "deploying",
      createdAt: new Date().toISOString(),
      durability: "memory_only",
    });

    const result = await resumeCompileGate("job-test-compile", workspace);
    expect(result.passed).toBe(true);

    const latest = await store.latestCheckpoint("job-test-compile");
    expect(latest).not.toBeNull();
    expect(latest!.gate).toBe("compile_gate");
    expect(latest!.status).toBe("passed");
    expect(latest!.workspace_path).toBe(workspace);
    expect(latest!.resume_eligible).toBe(true);
  });

  it("maps invalidation kinds to resume gates", () => {
    expect(invalidationToResumeGate("classification")).toBe("gate_0");
    expect(invalidationToResumeGate("research")).toBe("research");
    expect(invalidationToResumeGate("decomposition")).toBe("gate_1");
    expect(invalidationToResumeGate("builder")).toBe("builder_dispatcher");
    expect(invalidationToResumeGate("compile_gate")).toBe("deploying");
  });

  it("can persist a manual checkpoint via helper", async () => {
    const store = getJobStore();
    await recordCheckpoint({
      job_id: "job-manual",
      gate: "builder_dispatcher",
      status: "in_progress",
      resume_eligible: true,
      resume_reason: "manual-test",
    });
    const latest = await store.latestCheckpoint("job-manual");
    expect(latest).not.toBeNull();
    expect(latest!.gate).toBe("builder_dispatcher");
    expect(latest!.resume_reason).toBe("manual-test");
  });
});
