import type { Workspace } from "../builder/workspace-manager.js";
export interface DeployConfig {
    supabase_url?: string;
    supabase_anon_key?: string;
    service_role_key?: string;
    jwt_secret?: string;
    database_url?: string;
    postgres_password?: string;
    google_client_id?: string;
    google_client_secret?: string;
    resend_api_key?: string;
    site_url?: string;
    secret_key_base?: string;
}
export interface DeployResult {
    success: boolean;
    deployment_url: string | null;
    deployment_id: string | null;
    error: string | null;
    steps_completed: string[];
}
/**
 * Manages deployment to a self-hosted VPS via Docker Compose + Caddy.
 * Generates deployment-ready config and manifests.
 */
export declare class DeployManager {
    /**
     * Prepare a workspace for deployment.
     * Generates .env.production, validates config, creates deploy manifest.
     */
    prepareDeploy(workspace: Workspace, config: DeployConfig): Promise<DeployResult>;
    private getAppName;
}
