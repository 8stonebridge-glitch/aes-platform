/**
 * VercelService — manages Vercel deployment operations.
 *
 * Creates projects linked to GitHub repos, sets environment variables,
 * triggers deployments, and polls for readiness.
 */
export declare class VercelService {
    private token;
    constructor();
    private request;
    /**
     * Build the query string suffix for team-scoped API calls.
     */
    private teamQuery;
    private withTeamQuery;
    /**
     * Create a Vercel project linked to a GitHub repo.
     */
    createProject(name: string, gitRepo: {
        repo: string;
        org: string;
        repoId: number;
        repoOwnerId: number;
        productionBranch?: string;
    }, envVars?: Record<string, string>): Promise<{
        id: string;
        name: string;
    }>;
    /**
     * Set environment variables on a Vercel project.
     */
    setEnvVars(projectId: string, envVars: Record<string, string>): Promise<void>;
    createDeploymentFromGit(input: {
        project: string;
        repo: string;
        org: string;
        repoId: number;
        repoOwnerId: number;
        ref?: string;
    }): Promise<{
        id: string;
        url: string;
        readyState: string;
    }>;
    /**
     * Trigger a deployment (Vercel auto-deploys on push, but this can force one).
     */
    /**
     * Poll the project's deployments list until one is READY (or ERROR).
     *
     * Vercel auto-deploys when a GitHub-linked project receives a push.
     * We don't need to trigger manually — we just wait for the deployment
     * Vercel creates in response to the GitHub push.
     */
    waitForProjectDeployment(projectId: string, timeoutMs?: number): Promise<{
        id: string;
        url: string;
        readyState: string;
    }>;
    /**
     * Wait for a specific deployment by ID to be ready (poll status).
     */
    waitForDeployment(deploymentId: string, timeoutMs?: number): Promise<{
        url: string;
        readyState: string;
    }>;
    /**
     * Fetch recent deployment events for debugging failures.
     */
    getDeploymentEvents(deploymentId: string, limit?: number): Promise<string[]>;
    /**
     * Fetch a tail of deployment events (v2) for build-log context.
     * Best-effort: returns [] on errors.
     */
    getDeploymentLogTail(deploymentId: string, limit?: number): Promise<string[]>;
}
export declare function isVercelConfigured(): boolean;
