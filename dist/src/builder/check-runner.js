import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
/**
 * Run repo-level checks against a workspace.
 * Checks are best-effort: if a tool isn't configured (no tsconfig, no eslint, etc),
 * the check is marked as skipped, not failed.
 */
export class CheckRunner {
    async runAll(workspacePath) {
        const results = [];
        results.push(await this.runTypecheck(workspacePath));
        results.push(await this.runLint(workspacePath));
        results.push(await this.runTests(workspacePath));
        results.push(await this.runBuild(workspacePath));
        return results;
    }
    /** Fast convex-only typecheck — catches bare v.id(), defineTable(), shorthand form errors
     *  before running the full app typecheck (which is much slower).
     */
    async runConvexTypecheck(workspacePath) {
        const start = Date.now();
        const convexDir = join(workspacePath, "convex");
        if (!existsSync(convexDir)) {
            return { check: "convex-typecheck", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No convex/ directory" };
        }
        // Check if there's a tsconfig in convex/ or use the root one
        const tsconfigFlag = existsSync(join(convexDir, "tsconfig.json"))
            ? `--project ${join(convexDir, "tsconfig.json")}`
            : "";
        try {
            // Type-check only convex/ files by including them explicitly
            const cmd = tsconfigFlag
                ? `npx tsc --noEmit ${tsconfigFlag} 2>&1`
                : `npx tsc --noEmit --strict false 2>&1 | grep -E "^convex/" || true`;
            const output = execSync(cmd, { cwd: workspacePath, timeout: 30000, stdio: "pipe" }).toString();
            // If grep found convex/ errors, it's a failure
            const hasConvexErrors = /^convex\/.*error TS/m.test(output);
            return {
                check: "convex-typecheck",
                passed: !hasConvexErrors,
                output: hasConvexErrors ? output : "",
                duration_ms: Date.now() - start,
                skipped: false,
            };
        }
        catch (err) {
            const output = err.stdout?.toString() || err.message;
            // Filter to only convex/ errors
            const convexErrors = output.split("\n").filter((l) => /^convex\//.test(l)).join("\n");
            return {
                check: "convex-typecheck",
                passed: convexErrors.length === 0,
                output: convexErrors || output,
                duration_ms: Date.now() - start,
                skipped: false,
            };
        }
    }
    async runTypecheck(workspacePath) {
        const start = Date.now();
        // Check if tsconfig exists
        if (!existsSync(join(workspacePath, "tsconfig.json"))) {
            return { check: "typecheck", passed: true, output: "", duration_ms: 0, skipped: true, skip_reason: "No tsconfig.json found" };
        }
        try {
            const output = execSync("npx tsc --noEmit 2>&1", { cwd: workspacePath, timeout: 60000, stdio: "pipe" }).toString();
            return { check: "typecheck", passed: true, output, duration_ms: Date.now() - start, skipped: false };
        }
        catch (err) {
            return { check: "typecheck", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
        }
    }
    async runLint(workspacePath) {
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
        }
        catch (err) {
            return { check: "lint", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
        }
    }
    async runTests(workspacePath) {
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
        }
        catch (err) {
            return { check: "test", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
        }
    }
    async runBuild(workspacePath) {
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
        }
        catch (err) {
            return { check: "build", passed: false, output: err.stdout?.toString() || err.message, duration_ms: Date.now() - start, skipped: false };
        }
    }
}
