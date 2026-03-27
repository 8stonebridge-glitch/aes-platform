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

import { mkdtempSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

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
export function createBaseRepo(
  jobId: string,
  repoUrl?: string,
): { path: string; branch: string } {
  const basePath = mkdtempSync(join(tmpdir(), `aes-base-${jobId.slice(0, 8)}-`));

  if (repoUrl) {
    // Clone the real repo
    execSync(`git clone --depth 1 ${repoUrl} .`, {
      cwd: basePath,
      stdio: "pipe",
      timeout: 60_000,
    });
  } else {
    // Initialize fresh repo
    execSync("git init", { cwd: basePath, stdio: "pipe" });
    execSync("git checkout -b main", { cwd: basePath, stdio: "pipe" });
    // Create initial commit
    execSync("touch .aes-init", { cwd: basePath, stdio: "pipe" });
    execSync("git add -A", { cwd: basePath, stdio: "pipe" });
    execSync('git commit -m "AES base repo init"', { cwd: basePath, stdio: "pipe" });
  }

  const branch = execSync("git branch --show-current", { cwd: basePath, stdio: "pipe" })
    .toString()
    .trim();

  return { path: basePath, branch };
}

/**
 * Create a worktree pool for a job. The pool manages a base repo and
 * creates worktrees for each feature build.
 */
export function createWorktreePool(
  jobId: string,
  repoUrl?: string,
): WorktreePool {
  const { path, branch } = createBaseRepo(jobId, repoUrl);

  // Create integration branch where successful builds merge to
  const integrationBranch = `aes/integration/${jobId.slice(0, 8)}`;
  execSync(`git checkout -b ${integrationBranch}`, { cwd: path, stdio: "pipe" });

  return {
    job_id: jobId,
    base_repo_path: path,
    integration_branch: integrationBranch,
    active_worktrees: new Map(),
    merged_features: [],
  };
}

/**
 * Create an isolated worktree for a single feature build.
 * The worktree is branched from the integration branch so it can see
 * files from previously merged features.
 */
export function createWorktree(
  pool: WorktreePool,
  featureId: string,
  featureName: string,
): IsolatedWorktree {
  const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
  const branch = `aes/${pool.job_id.slice(0, 8)}/${slug}`;
  const worktreeId = `wt-${pool.job_id.slice(0, 8)}-${slug}`;

  // Create worktree directory
  const worktreePath = join(tmpdir(), `aes-wt-${worktreeId}`);

  // Ensure the branch doesn't already exist
  try {
    execSync(`git branch -D ${branch}`, { cwd: pool.base_repo_path, stdio: "pipe" });
  } catch {
    // Branch doesn't exist — that's fine
  }

  // Create the worktree branched from integration
  execSync(
    `git worktree add -b ${branch} "${worktreePath}" ${pool.integration_branch}`,
    { cwd: pool.base_repo_path, stdio: "pipe" },
  );

  const baseCommit = execSync("git rev-parse HEAD", { cwd: worktreePath, stdio: "pipe" })
    .toString()
    .trim();

  const worktree: IsolatedWorktree = {
    worktree_id: worktreeId,
    job_id: pool.job_id,
    feature_id: featureId,
    base_repo_path: pool.base_repo_path,
    worktree_path: worktreePath,
    branch,
    base_commit: baseCommit,
    created_at: new Date().toISOString(),
  };

  pool.active_worktrees.set(featureId, worktree);
  return worktree;
}

/**
 * Merge a completed feature worktree back into the integration branch.
 * This makes the feature's files visible to subsequent feature worktrees.
 */
export function mergeWorktree(
  pool: WorktreePool,
  featureId: string,
  commitMessage?: string,
): { merged: boolean; conflicts: string[] } {
  const worktree = pool.active_worktrees.get(featureId);
  if (!worktree) {
    return { merged: false, conflicts: ["Worktree not found for feature: " + featureId] };
  }

  try {
    // Commit any uncommitted changes in the worktree
    execSync("git add -A", { cwd: worktree.worktree_path, stdio: "pipe" });
    try {
      const msg = commitMessage || `[AES] feat(${featureId}): build complete`;
      execSync(`git commit -m "${msg.replace(/"/g, '\\"')}"`, {
        cwd: worktree.worktree_path,
        stdio: "pipe",
      });
    } catch {
      // Nothing to commit — that's OK if files were already committed
    }

    // Switch base repo to integration branch and merge
    execSync(`git checkout ${pool.integration_branch}`, {
      cwd: pool.base_repo_path,
      stdio: "pipe",
    });

    execSync(`git merge ${worktree.branch} --no-edit`, {
      cwd: pool.base_repo_path,
      stdio: "pipe",
    });

    pool.merged_features.push(featureId);
    return { merged: true, conflicts: [] };
  } catch (err: any) {
    // Merge conflict — try to extract conflict info
    const conflicts: string[] = [];
    try {
      const status = execSync("git diff --name-only --diff-filter=U", {
        cwd: pool.base_repo_path,
        stdio: "pipe",
      }).toString();
      conflicts.push(...status.trim().split("\n").filter(Boolean));
      // Abort the failed merge
      execSync("git merge --abort", { cwd: pool.base_repo_path, stdio: "pipe" });
    } catch {
      // Can't recover — just abort
      try {
        execSync("git merge --abort", { cwd: pool.base_repo_path, stdio: "pipe" });
      } catch {
        // Already aborted or no merge in progress
      }
    }
    return { merged: false, conflicts };
  }
}

/**
 * Clean up a single worktree after build.
 */
export function cleanupWorktree(pool: WorktreePool, featureId: string): void {
  const worktree = pool.active_worktrees.get(featureId);
  if (!worktree) return;

  try {
    // Remove the worktree from git
    execSync(`git worktree remove "${worktree.worktree_path}" --force`, {
      cwd: pool.base_repo_path,
      stdio: "pipe",
    });
  } catch {
    // Force cleanup the directory
    try {
      rmSync(worktree.worktree_path, { recursive: true, force: true });
      // Prune stale worktree references
      execSync("git worktree prune", { cwd: pool.base_repo_path, stdio: "pipe" });
    } catch {
      // Best effort
    }
  }

  pool.active_worktrees.delete(featureId);
}

/**
 * Clean up all worktrees and the base repo.
 */
export function cleanupPool(pool: WorktreePool): void {
  // Clean up all active worktrees
  for (const featureId of pool.active_worktrees.keys()) {
    cleanupWorktree(pool, featureId);
  }

  // Remove base repo
  try {
    rmSync(pool.base_repo_path, { recursive: true, force: true });
  } catch {
    // Best effort
  }
}

/**
 * Get a diff of changes in a worktree since it was created.
 */
export function getWorktreeDiff(worktree: IsolatedWorktree): string {
  try {
    return execSync(`git diff ${worktree.base_commit} HEAD`, {
      cwd: worktree.worktree_path,
      stdio: "pipe",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    }).toString();
  } catch {
    return "";
  }
}

/**
 * Get changed files in a worktree.
 */
export function getWorktreeChanges(worktree: IsolatedWorktree): {
  created: string[];
  modified: string[];
  deleted: string[];
} {
  const created: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  try {
    const output = execSync(`git diff --name-status ${worktree.base_commit} HEAD`, {
      cwd: worktree.worktree_path,
      stdio: "pipe",
    }).toString();

    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const [status, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (status === "A") created.push(filePath);
      else if (status === "M") modified.push(filePath);
      else if (status === "D") deleted.push(filePath);
    }
  } catch {
    // Empty worktree or error
  }

  return { created, modified, deleted };
}

/**
 * Get the final integration result: a single path containing all merged features.
 */
export function getIntegrationResult(pool: WorktreePool): {
  path: string;
  branch: string;
  merged_features: string[];
  commit: string;
} {
  // Ensure we're on the integration branch
  execSync(`git checkout ${pool.integration_branch}`, {
    cwd: pool.base_repo_path,
    stdio: "pipe",
  });

  const commit = execSync("git rev-parse HEAD", {
    cwd: pool.base_repo_path,
    stdio: "pipe",
  }).toString().trim();

  return {
    path: pool.base_repo_path,
    branch: pool.integration_branch,
    merged_features: [...pool.merged_features],
    commit,
  };
}
