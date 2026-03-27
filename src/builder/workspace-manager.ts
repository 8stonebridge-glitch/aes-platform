import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";

export interface Workspace {
  workspace_id: string;
  path: string;
  branch: string;
  base_commit: string;
}

export class WorkspaceManager {

  /**
   * Create an isolated workspace for a feature build.
   * If targetPath is provided, writes into that directory instead of a temp dir.
   * Uses a temp directory with git init — fully isolated from any real repo.
   */
  createWorkspace(jobId: string, featureName: string, targetPath?: string | null): Workspace {
    const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
    const branch = `aes/${jobId}/${slug}`;
    const workspaceId = `ws-${jobId}-${slug}`;

    // Use target path if provided, otherwise create temp directory
    let basePath: string;
    if (targetPath) {
      basePath = targetPath;
      if (!existsSync(basePath)) {
        mkdirSync(basePath, { recursive: true });
      }
    } else {
      basePath = mkdtempSync(join(tmpdir(), "aes-build-"));
    }

    // Initialize git repo
    execSync("git init", { cwd: basePath, stdio: "pipe" });
    execSync("git checkout -b " + branch, { cwd: basePath, stdio: "pipe" });

    // Create initial commit so we have a base to diff against
    writeFileSync(join(basePath, ".aes-workspace"), JSON.stringify({
      workspace_id: workspaceId,
      job_id: jobId,
      feature: featureName,
      branch,
      created_at: new Date().toISOString(),
    }, null, 2));
    execSync("git add -A", { cwd: basePath, stdio: "pipe" });
    execSync('git commit -m "AES workspace init"', { cwd: basePath, stdio: "pipe" });

    const baseCommit = execSync("git rev-parse HEAD", { cwd: basePath, stdio: "pipe" }).toString().trim();

    return { workspace_id: workspaceId, path: basePath, branch, base_commit: baseCommit };
  }

  /**
   * Clone an existing repo and create a feature branch.
   * If repoUrl is provided, clone it. Otherwise create a fresh workspace.
   */
  createFromRepo(jobId: string, featureName: string, repoUrl?: string): Workspace {
    const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
    const branch = `aes/${jobId}/${slug}`;
    const workspaceId = `ws-${jobId}-${slug}`;

    const basePath = mkdtempSync(join(tmpdir(), "aes-build-"));

    if (repoUrl) {
      // Clone the real repo
      execSync(`git clone --depth 1 ${repoUrl} .`, { cwd: basePath, stdio: "pipe" });
      execSync(`git checkout -b ${branch}`, { cwd: basePath, stdio: "pipe" });
    } else {
      // Fresh workspace (same as createWorkspace)
      execSync("git init", { cwd: basePath, stdio: "pipe" });
      execSync(`git checkout -b ${branch}`, { cwd: basePath, stdio: "pipe" });
      writeFileSync(join(basePath, ".aes-workspace"), JSON.stringify({
        workspace_id: workspaceId,
        job_id: jobId,
        feature: featureName,
        branch,
        created_at: new Date().toISOString(),
      }, null, 2));
      execSync("git add -A", { cwd: basePath, stdio: "pipe" });
      execSync('git commit -m "AES workspace init"', { cwd: basePath, stdio: "pipe" });
    }

    const baseCommit = execSync("git rev-parse HEAD", { cwd: basePath, stdio: "pipe" }).toString().trim();
    return { workspace_id: workspaceId, path: basePath, branch, base_commit: baseCommit };
  }

  /**
   * Get the diff of all changes since workspace creation.
   */
  getDiff(workspace: Workspace): string {
    try {
      return execSync(`git diff ${workspace.base_commit} HEAD`, { cwd: workspace.path, stdio: "pipe" }).toString();
    } catch {
      return execSync("git diff --cached", { cwd: workspace.path, stdio: "pipe" }).toString();
    }
  }

  /**
   * Get list of changed files since workspace creation.
   */
  getChangedFiles(workspace: Workspace): { created: string[]; modified: string[]; deleted: string[] } {
    let output: string;
    try {
      output = execSync(`git diff --name-status ${workspace.base_commit} HEAD`, { cwd: workspace.path, stdio: "pipe" }).toString();
    } catch {
      output = execSync("git diff --name-status --cached", { cwd: workspace.path, stdio: "pipe" }).toString();
    }

    const created: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    for (const line of output.trim().split("\n")) {
      if (!line) continue;
      const [status, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (filePath === ".aes-workspace") continue; // Skip workspace marker
      if (status === "A") created.push(filePath);
      else if (status === "M") modified.push(filePath);
      else if (status === "D") deleted.push(filePath);
    }

    return { created, modified, deleted };
  }

  /**
   * Commit all changes in the workspace.
   */
  commitChanges(workspace: Workspace, message: string): string {
    execSync("git add -A", { cwd: workspace.path, stdio: "pipe" });
    try {
      execSync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: workspace.path, stdio: "pipe" });
    } catch {
      // Nothing to commit
    }
    return execSync("git rev-parse HEAD", { cwd: workspace.path, stdio: "pipe" }).toString().trim();
  }

  /**
   * Generate a PR-style summary of the workspace changes.
   */
  generatePRSummary(workspace: Workspace, featureName: string, objective: string): string {
    const files = this.getChangedFiles(workspace);
    const diffStats = execSync(`git diff --stat ${workspace.base_commit} HEAD`, { cwd: workspace.path, stdio: "pipe" }).toString();

    return [
      `## AES Build: ${featureName}`,
      "",
      `**Branch:** \`${workspace.branch}\``,
      `**Objective:** ${objective}`,
      `**Workspace:** \`${workspace.workspace_id}\``,
      "",
      "### Changed Files",
      ...files.created.map(f => `+ \`${f}\``),
      ...files.modified.map(f => `~ \`${f}\``),
      ...files.deleted.map(f => `- \`${f}\``),
      "",
      "### Diff Stats",
      "```",
      diffStats.trim(),
      "```",
      "",
      "---",
      "_Generated by AES v12 — Governed Software Factory_",
    ].join("\n");
  }

  /**
   * Clean up workspace.
   */
  cleanup(workspace: Workspace): void {
    try {
      rmSync(workspace.path, { recursive: true, force: true });
    } catch {
      // Best effort
    }
  }
}
