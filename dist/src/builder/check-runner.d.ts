import type { CheckResult } from "../types/artifacts.js";
export type CheckName = "typecheck" | "lint" | "test" | "build";
/**
 * Run repo-level checks against a workspace.
 * Checks are best-effort: if a tool isn't configured (no tsconfig, no eslint, etc),
 * the check is marked as skipped, not failed.
 */
export declare class CheckRunner {
    runAll(workspacePath: string): Promise<CheckResult[]>;
    runTypecheck(workspacePath: string): Promise<CheckResult>;
    runLint(workspacePath: string): Promise<CheckResult>;
    runTests(workspacePath: string): Promise<CheckResult>;
    runBuild(workspacePath: string): Promise<CheckResult>;
}
