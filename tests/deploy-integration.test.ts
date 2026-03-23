import { describe, it, expect, afterEach } from "vitest";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { RepoScaffolder } from "../src/deploy/repo-scaffolder.js";
import { FrameworkValidator } from "../src/deploy/framework-validator.js";
import { DeployManager } from "../src/deploy/deploy-manager.js";
import { validateEnv, generateEnvFile, ALL_APP_ENV, CLERK_ENV, CONVEX_ENV } from "../src/deploy/env-contract.js";
import { WorkspaceManager, type Workspace } from "../src/builder/workspace-manager.js";

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "aes-deploy-test-"));
}

describe("RepoScaffolder", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirs.length = 0;
  });

  it("creates valid Next.js structure", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    expect(existsSync(join(dir, "app", "layout.tsx"))).toBe(true);
    expect(existsSync(join(dir, "app", "page.tsx"))).toBe(true);
    expect(existsSync(join(dir, "next.config.mjs"))).toBe(true);
    expect(existsSync(join(dir, "package.json"))).toBe(true);
    expect(existsSync(join(dir, "tsconfig.json"))).toBe(true);
    expect(existsSync(join(dir, "tailwind.config.ts"))).toBe(true);

    // Verify package.json content
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf-8"));
    expect(pkg.name).toBe("test-app");
    expect(pkg.dependencies.next).toBeTruthy();
    expect(pkg.dependencies["@clerk/nextjs"]).toBeTruthy();
    expect(pkg.dependencies.convex).toBeTruthy();
  });

  it("creates Convex schema with audit_logs", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    const schemaPath = join(dir, "convex", "schema.ts");
    expect(existsSync(schemaPath)).toBe(true);

    const content = readFileSync(schemaPath, "utf-8");
    expect(content).toContain("defineSchema");
    expect(content).toContain("audit_logs");
    expect(content).toContain("defineTable");
    expect(content).toContain("orgId");

    // Audit mutation should exist
    expect(existsSync(join(dir, "convex", "audit.ts"))).toBe(true);
    const auditContent = readFileSync(join(dir, "convex", "audit.ts"), "utf-8");
    expect(auditContent).toContain("mutation");
    expect(auditContent).toContain("orgId");
  });

  it("creates Clerk proxy.ts with clerkMiddleware", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    const proxyPath = join(dir, "proxy.ts");
    expect(existsSync(proxyPath)).toBe(true);
    expect(existsSync(join(dir, "middleware.ts"))).toBe(false);

    const content = readFileSync(proxyPath, "utf-8");
    expect(content).toContain("clerkMiddleware");
  });
});

describe("FrameworkValidator", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      try { rmSync(d, { recursive: true, force: true }); } catch {}
    }
    dirs.length = 0;
  });

  it("passes for valid scaffold", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    // All 7 checks should pass
    expect(results.length).toBe(7);
    const allPassed = results.every(r => r.passed);
    expect(allPassed).toBe(true);
  });

  it("catches missing proxy.ts and middleware.ts", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    // Remove proxy.ts
    unlinkSync(join(dir, "proxy.ts"));

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    const clerkCheck = results.find(r => r.check === "clerk_middleware");
    expect(clerkCheck).toBeTruthy();
    expect(clerkCheck!.passed).toBe(false);
    expect(clerkCheck!.detail).toContain("Neither proxy.ts nor middleware.ts found");

    const routeCheck = results.find(r => r.check === "route_protection");
    expect(routeCheck).toBeTruthy();
    expect(routeCheck!.passed).toBe(false);
  });

  it("passes when proxy.ts exists with clerkMiddleware", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    const clerkCheck = results.find(r => r.check === "clerk_middleware");
    expect(clerkCheck).toBeTruthy();
    expect(clerkCheck!.passed).toBe(true);
    expect(clerkCheck!.detail).toContain("proxy.ts");
  });

  it("catches deprecated authMiddleware", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    // Overwrite proxy.ts with deprecated authMiddleware
    writeFileSync(join(dir, "proxy.ts"), `import { authMiddleware, clerkMiddleware } from "@clerk/nextjs/server";
export default authMiddleware();
`);

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    const clerkCheck = results.find(r => r.check === "clerk_middleware");
    expect(clerkCheck).toBeTruthy();
    expect(clerkCheck!.passed).toBe(false);
    expect(clerkCheck!.detail).toContain("deprecated authMiddleware");
  });

  it("catches missing schema", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    // Remove convex schema
    unlinkSync(join(dir, "convex", "schema.ts"));

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    const schemaCheck = results.find(r => r.check === "convex_schema");
    expect(schemaCheck).toBeTruthy();
    expect(schemaCheck!.passed).toBe(false);
    expect(schemaCheck!.detail).toContain("not found");
  });

  it("catches missing orgId in queries", () => {
    const dir = createTempDir();
    dirs.push(dir);

    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(dir, { app_name: "Test App", app_slug: "test-app" });

    // Add a query file without orgId
    mkdirSync(join(dir, "convex", "bad-feature"), { recursive: true });
    writeFileSync(join(dir, "convex", "bad-feature", "queries.ts"), `
import { query } from "../_generated/server";
import { v } from "convex/values";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("items").collect();
  },
});
`);

    const validator = new FrameworkValidator();
    const results = validator.validateAll(dir);

    const orgCheck = results.find(r => r.check === "convex_org_filter");
    expect(orgCheck).toBeTruthy();
    expect(orgCheck!.passed).toBe(false);
    expect(orgCheck!.detail).toContain("bad-feature");
  });
});

describe("env-contract", () => {
  it("validates required keys — Clerk keys are optional (keyless mode)", () => {
    // Missing all keys — only Convex keys should be required
    const result1 = validateEnv(ALL_APP_ENV, {});
    expect(result1.valid).toBe(false);
    // Clerk keys are now optional
    expect(result1.missing).not.toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
    expect(result1.missing).not.toContain("CLERK_SECRET_KEY");
    // Convex keys are still required
    expect(result1.missing).toContain("NEXT_PUBLIC_CONVEX_URL");

    // Convex keys provided (Clerk keys optional)
    const result2 = validateEnv(ALL_APP_ENV, {
      NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
      CONVEX_DEPLOYMENT: "dev:test",
    });
    expect(result2.valid).toBe(true);
    expect(result2.missing).toHaveLength(0);
  });

  it("generates valid .env file", () => {
    const content = generateEnvFile(CLERK_ENV, {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_abc",
      CLERK_SECRET_KEY: "sk_test_def",
    });

    expect(content).toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_abc");
    expect(content).toContain("CLERK_SECRET_KEY=sk_test_def");
    // Should use example for missing values
    expect(content).toContain("NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in");
    // Should have section headers
    expect(content).toContain("# Clerk");
    expect(content).toContain("# Manual");
  });
});

describe("DeployManager", () => {
  const wm = new WorkspaceManager();
  const workspaces: Workspace[] = [];

  afterEach(() => {
    for (const ws of workspaces) {
      wm.cleanup(ws);
    }
    workspaces.length = 0;
  });

  it("creates vercel.json and manifest", async () => {
    const ws = wm.createWorkspace("j-deploy-test", "Deploy Test");
    workspaces.push(ws);

    // Scaffold a project so package.json exists
    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(ws.path, { app_name: "Deploy Test", app_slug: "deploy-test" });
    execSync("git add -A && git commit -m 'scaffold'", { cwd: ws.path, stdio: "pipe" });

    const manager = new DeployManager();
    const result = await manager.prepareDeploy(ws, {});

    expect(result.success).toBe(true);
    expect(result.steps_completed).toContain("vercel_config_written");
    expect(result.steps_completed).toContain("deploy_manifest_written");

    // Verify vercel.json
    const vercelConfig = JSON.parse(readFileSync(join(ws.path, "vercel.json"), "utf-8"));
    expect(vercelConfig.framework).toBe("nextjs");
    expect(vercelConfig.version).toBe(2);

    // Verify deploy manifest
    const manifest = JSON.parse(readFileSync(join(ws.path, ".aes-deploy-manifest.json"), "utf-8"));
    expect(manifest.app_name).toBe("deploy-test");
    expect(manifest.ready_for_deploy).toBe(true);
    expect(manifest.env_vars_required).toContain("NEXT_PUBLIC_CONVEX_URL");
    expect(manifest.branch).toBe(ws.branch);
  });
});
