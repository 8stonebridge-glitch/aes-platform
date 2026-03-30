/**
 * Worktree-Based Builder Isolation.
 *
 * Each feature build gets its own git worktree:
 *   1. A shared base repo is cloned once per job (or uses an existing repo)
 *   2. Each feature gets a worktree branched from main
 *   3. Builds happen in isolation — parallel features can't interfere
 *   4. Successful builds are merged back to the integration branch
 *   5. Worktrees are cleaned up after build (or on failure)
 *
 * This enables safe parallel execution (P5) where multiple builders
 * write files simultaneously without conflicts.
 */
export interface IsolatedWorktree {
    worktree_id: string;
    job_id: string;
    feature_id: string;
    base_repo_path: string;
    worktree_path: string;
    branch: string;
    base_commit: string;
    created_at: string;
}
export interface WorktreePool {
    job_id: string;
    base_repo_path: string;
    integration_branch: string;
    active_worktrees: Map<string, IsolatedWorktree>;
    merged_features: string[];
}
/**
 * Create a base repo for a job. This is the shared repo that all
 * worktrees branch from.
 */
export declare function createBaseRepo(jobId: string, repoUrl?: string): {
    path: string;
    branch: string;
};
/**
 * Create a worktree pool for a job. The pool manages a base repo and
 * creates worktrees for each feature build.
 */
export declare function createWorktreePool(jobId: string, repoUrl?: string): WorktreePool;
/**
 * Create an isolated worktree for a single feature build.
 * The worktree is branched from the integration branch so it can see
 * files from previously merged features.
 */
export declare function createWorktree(pool: WorktreePool, featureId: string, featureName: string): IsolatedWorktree;
/**
 * Merge a completed feature worktree back into the integration branch.
 * This makes the feature's files visible to subsequent feature worktrees.
 */
export declare function mergeWorktree(pool: WorktreePool, featureId: string, commitMessage?: string): {
    merged: boolean;
    conflicts: string[];
};
/**
 * Clean up a single worktree after build.
 */
export declare function cleanupWorktree(pool: WorktreePool, featureId: string): void;
/**
 * Clean up all worktrees and the base repo.
 */
export declare function cleanupPool(pool: WorktreePool): void;
/**
 * Get a diff of changes in a worktree since it was created.
 */
export declare function getWorktreeDiff(worktree: IsolatedWorktree): string;
/**
 * Get changed files in a worktree.
 */
export declare function getWorktreeChanges(worktree: IsolatedWorktree): {
    created: string[];
    modified: string[];
    deleted: string[];
};
/**
 * Get the final integration result: a single path containing all merged features.
 */
export declare function getIntegrationResult(pool: WorktreePool): {
    path: string;
    branch: string;
    merged_features: string[];
    commit: string;
};
