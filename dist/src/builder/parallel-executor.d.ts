/**
 * P5 — Parallel Execution with Semaphore.
 * Runs independent features concurrently with configurable concurrency limits
 * based on feature build class tiers.
 */
export interface BuildTask {
    feature_id: string;
    feature_name: string;
    concurrency_tier: "high" | "medium" | "low";
    dependencies: string[];
    execute: () => Promise<BuildResult>;
}
export interface BuildResult {
    feature_id: string;
    success: boolean;
    duration_ms: number;
    error?: string;
    result?: unknown;
}
/**
 * Execute build tasks respecting dependency order and concurrency limits.
 * Tasks are grouped by dependency level and run with a semaphore.
 */
export declare function executeParallel(tasks: BuildTask[], onProgress?: (featureId: string, status: string) => void): Promise<BuildResult[]>;
