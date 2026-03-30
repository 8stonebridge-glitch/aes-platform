export interface Workspace {
    workspace_id: string;
    path: string;
    branch: string;
    base_commit: string;
}
export declare class WorkspaceManager {
    /**
     * Create an isolated workspace for a feature build.
     * If targetPath is provided, writes into that directory instead of a temp dir.
     * Uses a temp directory with git init — fully isolated from any real repo.
     */
    createWorkspace(jobId: string, featureName: string, targetPath?: string | null): Workspace;
    /**
     * Clone an existing repo and create a feature branch.
     * If repoUrl is provided, clone it. Otherwise create a fresh workspace.
     */
    createFromRepo(jobId: string, featureName: string, repoUrl?: string): Workspace;
    /**
     * Get the diff of all changes since workspace creation.
     */
    getDiff(workspace: Workspace): string;
    /**
     * Get list of changed files since workspace creation.
     */
    getChangedFiles(workspace: Workspace): {
        created: string[];
        modified: string[];
        deleted: string[];
    };
    /**
     * Commit all changes in the workspace.
     */
    commitChanges(workspace: Workspace, message: string): string;
    /**
     * Generate a PR-style summary of the workspace changes.
     */
    generatePRSummary(workspace: Workspace, featureName: string, objective: string): string;
    /**
     * Clean up workspace.
     */
    cleanup(workspace: Workspace): void;
}
/**
 * Remove a workspace directory. Failures are caught so cleanup never crashes the process.
 */
export declare function cleanupWorkspace(workspace: Workspace): void;
/**
 * Scan /tmp for stale aes-build-* directories older than maxAgeMs and remove them.
 * Defaults to 1 hour (3600000 ms). Failures on individual directories are caught
 * so one stuck directory doesn't prevent cleanup of others.
 */
export declare function cleanupOldWorkspaces(maxAgeMs?: number): {
    removed: string[];
    errors: string[];
};
