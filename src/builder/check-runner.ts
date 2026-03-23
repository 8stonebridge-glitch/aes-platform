import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CheckResult } from "../types/artifacts.js";

export type CheckName = "typecheck" | "lint" | "test" | "build";

/**
 * Run repo-level checks against a workspace.
 * Checks are best-effort: if a tool isn't configured (no tsconfig, no eslint, etc),
 * the check is marked as skipped, not failed.
 */
export class CheckRunner {

  async runAll(workspacePath: string): Promise<CheckResult[]> {
    const results: CheckResult[] = [];

    results.push(await this.runTypecheck(workspacePath));
    results.push(await this.runLint(workspacePath));
    results.push(await this.runTests(workspacePath));
    results.push(await this.runBuild(workspacePath));

    return results;
  }

  async runTypecheck(workspacePath: string): Promise<CheckResult> {
    const start = Date.now();

    // Check if tsconfig exists
    if (!existsSync(join(workspacePath, "tsconfig.json"))) {
      return { check: "typecheck", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No tsconfig.json found" };
    }

    try {
      const output = execSync("npx tsc --noEmit 2>&1", { cwd: workspacePath, timeout: 60000, stdio: "pipe" }).toString();
      return { check: "typecheck", passed: true, output, duration_ms: Date.now() - start, skipped: false };
    } catch (err: any) {
      return { check: "typecheck", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
    }
  }

  async runLint(workspacePath: string): Promise<CheckResult> {
    const start = Date.now();

    // Check for eslint or biome config
    const hasEslint = existsSync(join(workspacePath, ".eslintrc.json")) ||
      existsSync(join(workspacePath, ".eslintrc.js")) ||
      existsSync(join(workspacePath, "eslint.config.js")) ||
      existsSync(join(workspacePath, "eslint.config.mjs"));
    const hasBiome = existsSync(join(workspacePath, "biome.json"));

    if (!hasEslint && !hasBiome) {
      return { check: "lint", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No linter config found" };
    }

    try {
      const cmd = hasBiome ? "npx biome check . 2>&1" : "npx eslint . 2>&1";
      const output = execSync(cmd, { cwd: workspacePath, timeout: 60000, stdio: "pipe" }).toString();
      return { check: "lint", passed: true, output, duration_ms: Date.now() - start, skipped: false };
    } catch (err: any) {
      return { check: "lint", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
    }
  }

  async runTests(workspacePath: string): Promise<CheckResult> {
    const start = Date.now();

    // Check for vitest or jest config
    const hasVitest = existsSync(join(workspacePath, "vitest.config.ts")) ||
      existsSync(join(workspacePath, "vitest.config.js"));
    const hasJest = existsSync(join(workspacePath, "jest.config.js")) ||
      existsSync(join(workspacePath, "jest.config.ts"));

    if (!hasVitest && !hasJest) {
      return { check: "test", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No test runner config found" };
    }

    try {
      const cmd = hasVitest ? "npx vitest run 2>&1" : "npx jest 2>&1";
      const output = execSync(cmd, { cwd: workspacePath, timeout: 120000, stdio: "pipe" }).toString();
      return { check: "test", passed: true, output, duration_ms: Date.now() - start, skipped: false };
    } catch (err: any) {
      return { check: "test", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
    }
  }

  async runBuild(workspacePath: string): Promise<CheckResult> {
    const start = Date.now();

    // Check for package.json with build script
    if (!existsSync(join(workspacePath, "package.json"))) {
      return { check: "build", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No package.json found" };
    }

    try {
      const pkg = JSON.parse(readFileSync(join(workspacePath, "package.json"), "utf-8"));
      if (!pkg.scripts?.build) {
        return { check: "build", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No build script in package.json" };
      }
      const output = execSync("npm run build 2>&1", { cwd: workspacePath, timeout: 120000, stdio: "pipe" }).toString();
      return { check: "build", passed: true, output, duration_ms: Date.now() - start, skipped: false };
    } catch (err: any) {
      return { check: "build", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
    }
  }
}
