/**
 * P5 — Parallel Execution with Semaphore.
 * Runs independent features concurrently with configurable concurrency limits
 * based on feature build class tiers.
 */
const TIER_CONCURRENCY = {
    high: 6,
    medium: 3,
    low: 1,
};
/**
 * Simple counting semaphore for concurrency control.
 */
class Semaphore {
    max;
    current = 0;
    waiting = [];
    constructor(max) {
        this.max = max;
    }
    async acquire() {
        if (this.current < this.max) {
            this.current++;
            return;
        }
        return new Promise((resolve) => {
            this.waiting.push(() => {
                this.current++;
                resolve();
            });
        });
    }
    release() {
        this.current--;
        const next = this.waiting.shift();
        if (next)
            next();
    }
    get available() {
        return this.max - this.current;
    }
}
/**
 * Execute build tasks respecting dependency order and concurrency limits.
 * Tasks are grouped by dependency level and run with a semaphore.
 */
export async function executeParallel(tasks, onProgress) {
    const results = [];
    const completed = new Set();
    const taskMap = new Map(tasks.map(t => [t.feature_id, t]));
    // Build dependency levels (topological sort into layers)
    const levels = buildDependencyLevels(tasks);
    for (const level of levels) {
        // Determine concurrency for this level based on the most restrictive tier
        const maxConcurrency = Math.min(...level.map(id => {
            const task = taskMap.get(id);
            return TIER_CONCURRENCY[task.concurrency_tier] || 3;
        }));
        const semaphore = new Semaphore(maxConcurrency);
        const levelTasks = level.map(id => taskMap.get(id));
        const levelResults = await Promise.all(levelTasks.map(async (task) => {
            await semaphore.acquire();
            try {
                onProgress?.(task.feature_id, "building");
                const start = Date.now();
                try {
                    const result = await task.execute();
                    completed.add(task.feature_id);
                    onProgress?.(task.feature_id, result.success ? "built" : "failed");
                    return result;
                }
                catch (err) {
                    const errorMsg = err instanceof Error ? err.message : String(err);
                    onProgress?.(task.feature_id, "failed");
                    return {
                        feature_id: task.feature_id,
                        success: false,
                        duration_ms: Date.now() - start,
                        error: errorMsg,
                    };
                }
            }
            finally {
                semaphore.release();
            }
        }));
        results.push(...levelResults);
        // Check if any failures should block downstream
        const failedIds = levelResults.filter(r => !r.success).map(r => r.feature_id);
        if (failedIds.length > 0) {
            // Mark downstream tasks as blocked
            for (const task of tasks) {
                if (completed.has(task.feature_id))
                    continue;
                const blockedBy = task.dependencies.filter(d => failedIds.includes(d));
                if (blockedBy.length > 0) {
                    results.push({
                        feature_id: task.feature_id,
                        success: false,
                        duration_ms: 0,
                        error: `Blocked by failed dependencies: ${blockedBy.join(", ")}`,
                    });
                    onProgress?.(task.feature_id, "blocked");
                }
            }
        }
    }
    return results;
}
/**
 * Group features into dependency levels for parallel execution.
 * Level 0 = no dependencies, Level 1 = depends on level 0, etc.
 */
function buildDependencyLevels(tasks) {
    const taskMap = new Map(tasks.map(t => [t.feature_id, t]));
    const levels = [];
    const assigned = new Set();
    const allIds = new Set(tasks.map(t => t.feature_id));
    let remaining = tasks.length;
    let maxIterations = tasks.length + 1; // Safety valve
    while (remaining > 0 && maxIterations-- > 0) {
        const level = [];
        for (const task of tasks) {
            if (assigned.has(task.feature_id))
                continue;
            // Check if all dependencies are satisfied
            const depsReady = task.dependencies
                .filter(d => allIds.has(d)) // Only consider deps that are in our task set
                .every(d => assigned.has(d));
            if (depsReady) {
                level.push(task.feature_id);
            }
        }
        if (level.length === 0) {
            // Circular dependency or unresolvable — force remaining into one level
            for (const task of tasks) {
                if (!assigned.has(task.feature_id)) {
                    level.push(task.feature_id);
                }
            }
        }
        for (const id of level) {
            assigned.add(id);
            remaining--;
        }
        levels.push(level);
    }
    return levels;
}
