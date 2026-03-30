/**
 * VercelService — manages Vercel deployment operations.
 *
 * Creates projects linked to GitHub repos, sets environment variables,
 * triggers deployments, and polls for readiness.
 */
export class VercelService {
    token;
    constructor() {
        const token = process.env.VERCEL_TOKEN || process.env.AES_VERCEL_TOKEN;
        if (!token)
            throw new Error("VERCEL_TOKEN not configured");
        this.token = token;
    }
    /**
     * Build the query string suffix for team-scoped API calls.
     */
    teamQuery() {
        const teamId = process.env.VERCEL_TEAM_ID;
        return teamId ? `?teamId=${teamId}` : "";
    }
    /**
     * Create a Vercel project linked to a GitHub repo.
     */
    async createProject(name, githubRepoFullName, envVars) {
        const endpoint = `https://api.vercel.com/v10/projects${this.teamQuery()}`;
        const body = {
            name,
            framework: "nextjs",
            gitRepository: {
                type: "github",
                repo: githubRepoFullName,
            },
        };
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vercel create project failed (${response.status}): ${error}`);
        }
        const project = await response.json();
        // Set environment variables if provided
        if (envVars && Object.keys(envVars).length > 0) {
            await this.setEnvVars(project.id, envVars);
        }
        return { id: project.id, name: project.name };
    }
    /**
     * Set environment variables on a Vercel project.
     */
    async setEnvVars(projectId, envVars) {
        const endpoint = `https://api.vercel.com/v10/projects/${projectId}/env${this.teamQuery()}`;
        const envList = Object.entries(envVars).map(([key, value]) => ({
            key,
            value,
            type: key.startsWith("NEXT_PUBLIC_") ? "plain" : "encrypted",
            target: ["production", "preview", "development"],
        }));
        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(envList),
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Vercel set env vars failed (${response.status}): ${error}`);
        }
    }
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
    async waitForProjectDeployment(projectId, timeoutMs = 300000) {
        const startTime = Date.now();
        // Give Vercel a few seconds to register the GitHub webhook before polling
        await new Promise((resolve) => setTimeout(resolve, 8000));
        while (Date.now() - startTime < timeoutMs) {
            const endpoint = `https://api.vercel.com/v6/deployments?projectId=${projectId}&limit=5${this.teamQuery() ? "&" + this.teamQuery().slice(1) : ""}`;
            const response = await fetch(endpoint, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (!response.ok) {
                throw new Error(`Vercel deployment list failed (${response.status})`);
            }
            const data = await response.json();
            const deployments = data.deployments || [];
            // Find the most recent deployment that is not CANCELED
            const active = deployments.find((d) => d.state !== "CANCELED" && d.state !== "ERROR");
            const errored = deployments.find((d) => d.state === "ERROR");
            if (active?.state === "READY") {
                return {
                    id: active.uid,
                    url: `https://${active.url}`,
                    readyState: "READY",
                };
            }
            if (!active && errored) {
                throw new Error(`Deployment errored: ${errored.errorMessage || "unknown error"}`);
            }
            // Still building — wait and retry
            await new Promise((resolve) => setTimeout(resolve, 8000));
        }
        throw new Error(`Deployment timed out after ${timeoutMs / 1000}s`);
    }
    /**
     * Wait for a specific deployment by ID to be ready (poll status).
     */
    async waitForDeployment(deploymentId, timeoutMs = 300000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            const endpoint = `https://api.vercel.com/v13/deployments/${deploymentId}${this.teamQuery()}`;
            const response = await fetch(endpoint, {
                headers: { Authorization: `Bearer ${this.token}` },
            });
            if (!response.ok) {
                throw new Error(`Vercel status check failed (${response.status})`);
            }
            const data = await response.json();
            if (data.readyState === "READY") {
                return { url: `https://${data.url}`, readyState: "READY" };
            }
            if (data.readyState === "ERROR" || data.readyState === "CANCELED") {
                throw new Error(`Deployment ${data.readyState}: ${data.errorMessage || "unknown error"}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
        throw new Error(`Deployment timed out after ${timeoutMs / 1000}s`);
    }
}
export function isVercelConfigured() {
    return !!(process.env.VERCEL_TOKEN || process.env.AES_VERCEL_TOKEN);
}
