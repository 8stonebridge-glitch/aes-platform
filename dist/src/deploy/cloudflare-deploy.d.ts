/**
 * Cloudflare Dynamic Workers deploy target.
 *
 * Flow:
 *   1. AES builder generates app files in a workspace
 *   2. This service bundles them into a WorkerCode payload
 *   3. Sends to the AES Gateway Worker on Cloudflare
 *   4. Gateway uses env.LOADER.load() to spin up the app
 *   5. Returns a live preview URL
 *
 * The gateway worker must be deployed once to Cloudflare with:
 *   - worker_loaders binding (LOADER)
 *   - D1 database binding (DB)
 *   - KV namespace binding (KV)
 *   - R2 bucket binding (STORAGE)
 */
export interface CloudflareDeployConfig {
    /** URL of the AES Gateway Worker (e.g. https://aes-gateway.your-subdomain.workers.dev) */
    gatewayUrl: string;
    /** Cloudflare API token with Workers permissions */
    apiToken: string;
    /** Cloudflare account ID */
    accountId: string;
    /** Optional: app name used as the worker slug */
    appName?: string;
    /** Optional: D1 database ID to bind */
    d1DatabaseId?: string;
    /** Optional: KV namespace ID to bind */
    kvNamespaceId?: string;
    /** Optional: R2 bucket name to bind */
    r2BucketName?: string;
    /** Workers subdomain (e.g. "your-subdomain" from your-subdomain.workers.dev). Falls back to env AES_CF_WORKERS_SUBDOMAIN. */
    workersSubdomain?: string;
}
export interface CloudflareDeployResult {
    success: boolean;
    /** Live preview URL for the deployed app */
    previewUrl: string | null;
    /** Worker instance ID */
    workerId: string | null;
    /** Number of files bundled */
    fileCount: number;
    /** Total bundle size in bytes */
    bundleSize: number;
    error: string | null;
}
export interface BundledModule {
    path: string;
    content: string;
    type: "esm" | "cjs" | "json" | "text" | "binary";
}
/**
 * Recursively collect all source files from a workspace directory.
 */
export declare function bundleWorkspace(workspacePath: string): BundledModule[];
/**
 * Deploy a bundled app to the AES Cloudflare Gateway Worker.
 *
 * The gateway accepts a POST with the bundled modules and config,
 * loads them as a Dynamic Worker, and returns the preview URL.
 */
export declare function deployToCloudflare(workspacePath: string, config: CloudflareDeployConfig): Promise<CloudflareDeployResult>;
/**
 * Alternatively, deploy directly via the Cloudflare Workers API
 * (for when no gateway worker is available).
 */
export declare function deployViaApi(workspacePath: string, config: CloudflareDeployConfig): Promise<CloudflareDeployResult>;
/**
 * Delete a deployed worker.
 */
export declare function deleteWorker(config: CloudflareDeployConfig, workerId: string): Promise<boolean>;
