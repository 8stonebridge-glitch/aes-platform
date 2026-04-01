import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
/** Run a git command safely using execFileSync (no shell interpolation). */
function gitExec(args, cwd) {
    return execFileSync("git", args, { cwd, stdio: "pipe" }).toString();
}
/** Strip characters that aren't alphanumeric, dash, underscore, or dot. */
function sanitizeId(value) {
    return value.replace(/[^a-zA-Z0-9\-_.]/g, "");
}
export class WorkspaceManager {
    /**
     * Create an isolated workspace for a feature build.
     * If targetPath is provided, writes into that directory instead of a temp dir.
     * Uses a temp directory with git init — fully isolated from any real repo.
     */
    createWorkspace(jobId, featureName, targetPath) {
        const safeJobId = sanitizeId(jobId);
        const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
        const branch = `aes/${safeJobId}/${slug}`;
        const workspaceId = `ws-${safeJobId}-${slug}`;
        // Use target path if provided, otherwise create temp directory
        let basePath;
        if (targetPath) {
            basePath = targetPath;
            if (!existsSync(basePath)) {
                mkdirSync(basePath, { recursive: true });
            }
        }
        else {
            const buildDir = process.env.AES_BUILD_DIR || tmpdir();
            if (buildDir !== tmpdir() && !existsSync(buildDir)) {
                mkdirSync(buildDir, { recursive: true });
            }
            basePath = mkdtempSync(join(buildDir, "aes-build-"));
        }
        // Initialize git repo with AES identity for containerized environments
        gitExec(["init"], basePath);
        gitExec(["config", "user.email", "aes-builder@aes.dev"], basePath);
        gitExec(["config", "user.name", "AES Builder"], basePath);
        gitExec(["checkout", "-b", branch], basePath);
        // Create initial commit so we have a base to diff against
        writeFileSync(join(basePath, ".aes-workspace"), JSON.stringify({
            workspace_id: workspaceId,
            job_id: safeJobId,
            feature: featureName,
            branch,
            created_at: new Date().toISOString(),
        }, null, 2));
        gitExec(["add", "-A"], basePath);
        gitExec(["commit", "-m", "AES workspace init"], basePath);
        const baseCommit = gitExec(["rev-parse", "HEAD"], basePath).trim();
        return { workspace_id: workspaceId, path: basePath, branch, base_commit: baseCommit };
    }
    /**
     * Clone an existing repo and create a feature branch.
     * If repoUrl is provided, clone it. Otherwise create a fresh workspace.
     */
    createFromRepo(jobId, featureName, repoUrl) {
        const safeJobId = sanitizeId(jobId);
        const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").substring(0, 40);
        const branch = `aes/${safeJobId}/${slug}`;
        const workspaceId = `ws-${safeJobId}-${slug}`;
        const buildDir = process.env.AES_BUILD_DIR || tmpdir();
        if (buildDir !== tmpdir() && !existsSync(buildDir)) {
            mkdirSync(buildDir, { recursive: true });
        }
        const basePath = mkdtempSync(join(buildDir, "aes-build-"));
        if (repoUrl) {
            // Clone the real repo — repoUrl is passed as a single argument, not interpolated into a shell string
            gitExec(["clone", "--depth", "1", repoUrl, "."], basePath);
            gitExec(["config", "user.email", "aes-builder@aes.dev"], basePath);
            gitExec(["config", "user.name", "AES Builder"], basePath);
            gitExec(["checkout", "-b", branch], basePath);
        }
        else {
            // Fresh workspace (same as createWorkspace)
            gitExec(["init"], basePath);
            gitExec(["config", "user.email", "aes-builder@aes.dev"], basePath);
            gitExec(["config", "user.name", "AES Builder"], basePath);
            gitExec(["checkout", "-b", branch], basePath);
            writeFileSync(join(basePath, ".aes-workspace"), JSON.stringify({
                workspace_id: workspaceId,
                job_id: safeJobId,
                feature: featureName,
                branch,
                created_at: new Date().toISOString(),
            }, null, 2));
            gitExec(["add", "-A"], basePath);
            gitExec(["commit", "-m", "AES workspace init"], basePath);
        }
        const baseCommit = gitExec(["rev-parse", "HEAD"], basePath).trim();
        return { workspace_id: workspaceId, path: basePath, branch, base_commit: baseCommit };
    }
    /**
     * Get the diff of all changes since workspace creation.
     */
    getDiff(workspace) {
        try {
            return gitExec(["diff", workspace.base_commit, "HEAD"], workspace.path);
        }
        catch {
            return gitExec(["diff", "--cached"], workspace.path);
        }
    }
    /**
     * Get list of changed files since workspace creation.
     */
    getChangedFiles(workspace) {
        let output;
        try {
            output = gitExec(["diff", "--name-status", workspace.base_commit, "HEAD"], workspace.path);
        }
        catch {
            output = gitExec(["diff", "--name-status", "--cached"], workspace.path);
        }
        const created = [];
        const modified = [];
        const deleted = [];
        for (const line of output.trim().split("\n")) {
            if (!line)
                continue;
            const [status, ...pathParts] = line.split("\t");
            const filePath = pathParts.join("\t");
            if (filePath === ".aes-workspace")
                continue; // Skip workspace marker
            if (status === "A")
                created.push(filePath);
            else if (status === "M")
                modified.push(filePath);
            else if (status === "D")
                deleted.push(filePath);
        }
        return { created, modified, deleted };
    }
    /**
     * Commit all changes in the workspace.
     */
    commitChanges(workspace, message) {
        gitExec(["add", "-A"], workspace.path);
        try {
            gitExec(["commit", "-m", message], workspace.path);
        }
        catch {
            // Nothing to commit
        }
        return gitExec(["rev-parse", "HEAD"], workspace.path).trim();
    }
    /**
     * Generate a PR-style summary of the workspace changes.
     */
    generatePRSummary(workspace, featureName, objective) {
        const files = this.getChangedFiles(workspace);
        const diffStats = gitExec(["diff", "--stat", workspace.base_commit, "HEAD"], workspace.path);
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
    cleanup(workspace) {
        try {
            rmSync(workspace.path, { recursive: true, force: true });
        }
        catch {
            // Best effort
        }
    }
}
/**
 * Remove a workspace directory. Failures are caught so cleanup never crashes the process.
 */
export function cleanupWorkspace(workspace) {
    try {
        rmSync(workspace.path, { recursive: true, force: true });
    }
    catch (_err) {
        // Cleanup is best-effort — log but don't throw
        console.warn(`[workspace-cleanup] Failed to remove ${workspace.path}:`, _err);
    }
}
/**
 * Scan /tmp for stale aes-build-* directories older than maxAgeMs and remove them.
 * Defaults to 1 hour (3600000 ms). Failures on individual directories are caught
 * so one stuck directory doesn't prevent cleanup of others.
 */
export function cleanupOldWorkspaces(maxAgeMs = 3600000) {
    const removed = [];
    const errors = [];
    const now = Date.now();
    const buildDir = process.env.AES_BUILD_DIR || tmpdir();
    let entries;
    try {
        entries = readdirSync(buildDir);
    }
    catch {
        return { removed, errors };
    }
    for (const entry of entries) {
        if (!entry.startsWith("aes-build-"))
            continue;
        const fullPath = join(buildDir, entry);
        try {
            const stat = statSync(fullPath);
            if (!stat.isDirectory())
                continue;
            if (now - stat.mtimeMs > maxAgeMs) {
                rmSync(fullPath, { recursive: true, force: true });
                removed.push(fullPath);
            }
        }
        catch (err) {
            errors.push(`${fullPath}: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    return { removed, errors };
}
