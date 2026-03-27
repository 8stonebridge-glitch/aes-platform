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

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

// ── Types ────────────────────────────────────────────────────────────

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

// ── File bundler ─────────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", ".vercel", "dist", ".turbo", ".cache",
]);

const SKIP_FILES = new Set([
  ".DS_Store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);

const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file

function getModuleType(filePath: string): BundledModule["type"] {
  const ext = extname(filePath).toLowerCase();
  switch (ext) {
    case ".js":
    case ".mjs":
    case ".ts":
    case ".tsx":
    case ".jsx":
      return "esm";
    case ".cjs":
      return "cjs";
    case ".json":
      return "json";
    case ".css":
    case ".html":
    case ".md":
    case ".txt":
    case ".svg":
    case ".env":
      return "text";
    default:
      return "text";
  }
}

/**
 * Recursively collect all source files from a workspace directory.
 */
export function bundleWorkspace(workspacePath: string): BundledModule[] {
  const modules: BundledModule[] = [];

  function walk(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (SKIP_FILES.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(fullPath);
      } else if (entry.isFile()) {
        const stat = statSync(fullPath);
        if (stat.size > MAX_FILE_SIZE) continue;

        const relativePath = relative(workspacePath, fullPath);
        const content = readFileSync(fullPath, "utf-8");
        modules.push({
          path: relativePath,
          content,
          type: getModuleType(relativePath),
        });
      }
    }
  }

  walk(workspacePath);
  return modules;
}

// ── Deploy to Gateway ────────────────────────────────────────────────

/**
 * Deploy a bundled app to the AES Cloudflare Gateway Worker.
 *
 * The gateway accepts a POST with the bundled modules and config,
 * loads them as a Dynamic Worker, and returns the preview URL.
 */
export async function deployToCloudflare(
  workspacePath: string,
  config: CloudflareDeployConfig,
): Promise<CloudflareDeployResult> {
  try {
    // 1. Bundle workspace files
    const modules = bundleWorkspace(workspacePath);
    if (modules.length === 0) {
      return {
        success: false,
        previewUrl: null,
        workerId: null,
        fileCount: 0,
        bundleSize: 0,
        error: "No files found in workspace to deploy",
      };
    }

    const bundleSize = modules.reduce((sum, m) => sum + m.content.length, 0);

    // 2. Find entry point
    const entryPoint = findEntryPoint(modules);

    // 3. Send to gateway
    const payload = {
      appName: config.appName || `aes-app-${Date.now()}`,
      entryPoint,
      modules: modules.map((m) => ({
        path: m.path,
        content: m.content,
        type: m.type,
      })),
      bindings: {
        d1DatabaseId: config.d1DatabaseId,
        kvNamespaceId: config.kvNamespaceId,
        r2BucketName: config.r2BucketName,
      },
    };

    const res = await fetch(`${config.gatewayUrl}/api/deploy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiToken}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        previewUrl: null,
        workerId: null,
        fileCount: modules.length,
        bundleSize,
        error: `Gateway returned ${res.status}: ${text}`,
      };
    }

    const result = (await res.json()) as {
      workerId: string;
      previewUrl: string;
    };

    return {
      success: true,
      previewUrl: result.previewUrl,
      workerId: result.workerId,
      fileCount: modules.length,
      bundleSize,
      error: null,
    };
  } catch (e: any) {
    return {
      success: false,
      previewUrl: null,
      workerId: null,
      fileCount: 0,
      bundleSize: 0,
      error: e.message,
    };
  }
}

/**
 * Alternatively, deploy directly via the Cloudflare Workers API
 * (for when no gateway worker is available).
 */
export async function deployViaApi(
  workspacePath: string,
  config: CloudflareDeployConfig,
): Promise<CloudflareDeployResult> {
  try {
    const modules = bundleWorkspace(workspacePath);
    if (modules.length === 0) {
      return {
        success: false,
        previewUrl: null,
        workerId: null,
        fileCount: 0,
        bundleSize: 0,
        error: "No files found in workspace",
      };
    }

    const bundleSize = modules.reduce((sum, m) => sum + m.content.length, 0);
    const appName = config.appName || `aes-app-${Date.now()}`;
    const entryPoint = findEntryPoint(modules);

    // Build the Worker script that serves the app
    const workerScript = generateWorkerScript(entryPoint, modules);

    // Upload via Cloudflare API
    const formData = new FormData();

    // Main worker module
    formData.append(
      "worker.js",
      new Blob([workerScript], { type: "application/javascript+module" }),
      "worker.js",
    );

    // Metadata
    const metadata: Record<string, unknown> = {
      main_module: "worker.js",
      compatibility_date: "2026-03-01",
      bindings: [],
    };

    if (config.d1DatabaseId) {
      metadata.bindings = [
        ...(metadata.bindings as any[]),
        { type: "d1", name: "DB", id: config.d1DatabaseId },
      ];
    }
    if (config.kvNamespaceId) {
      metadata.bindings = [
        ...(metadata.bindings as any[]),
        { type: "kv_namespace", name: "KV", namespace_id: config.kvNamespaceId },
      ];
    }
    if (config.r2BucketName) {
      metadata.bindings = [
        ...(metadata.bindings as any[]),
        { type: "r2_bucket", name: "STORAGE", bucket_name: config.r2BucketName },
      ];
    }

    formData.append("metadata", JSON.stringify(metadata));

    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${appName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
        },
        body: formData,
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        success: false,
        previewUrl: null,
        workerId: null,
        fileCount: modules.length,
        bundleSize,
        error: `Cloudflare API returned ${res.status}: ${text}`,
      };
    }

    // Enable the workers.dev subdomain route
    await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${appName}/subdomain`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      },
    );

    const previewUrl = `https://${appName}.${config.accountId}.workers.dev`;

    return {
      success: true,
      previewUrl,
      workerId: appName,
      fileCount: modules.length,
      bundleSize,
      error: null,
    };
  } catch (e: any) {
    return {
      success: false,
      previewUrl: null,
      workerId: null,
      fileCount: 0,
      bundleSize: 0,
      error: e.message,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

function findEntryPoint(modules: BundledModule[]): string {
  // Look for common entry points in priority order
  const candidates = [
    "src/index.ts",
    "src/index.js",
    "index.ts",
    "index.js",
    "src/app.ts",
    "src/app.js",
    "src/server.ts",
    "src/server.js",
    "src/worker.ts",
    "src/worker.js",
    "worker.js",
    "worker.ts",
  ];

  for (const candidate of candidates) {
    if (modules.some((m) => m.path === candidate)) return candidate;
  }

  // Fallback: first JS/TS file
  const firstJs = modules.find(
    (m) => m.type === "esm" || m.type === "cjs",
  );
  return firstJs?.path || modules[0].path;
}

/**
 * Generate a Worker script that embeds all app files as a virtual filesystem
 * and serves them. For full-stack apps, this creates a simple asset server
 * with API route handling.
 */
function generateWorkerScript(
  entryPoint: string,
  modules: BundledModule[],
): string {
  // Embed all files as a virtual FS
  const fileMap = modules
    .map(
      (m) =>
        `  ${JSON.stringify(m.path)}: ${JSON.stringify(m.content)}`,
    )
    .join(",\n");

  return `
// AES Dynamic Worker — auto-generated
const FILES = {
${fileMap}
};

// Simple static file server with API route support
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let path = url.pathname === "/" ? "/index.html" : url.pathname.slice(1);

    // Check for API routes (src/app/api/*)
    const apiMatch = Object.keys(FILES).find(
      f => f.startsWith("src/app/api/") && path.startsWith("api/")
    );

    if (apiMatch) {
      // Dynamic import would go here in a real Dynamic Worker
      return new Response(JSON.stringify({ status: "ok", route: path }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Try to serve static files
    const candidates = [path, path + ".html", path + "/index.html"];
    for (const c of candidates) {
      if (FILES[c]) {
        return new Response(FILES[c], {
          headers: { "Content-Type": guessContentType(c) },
        });
      }
    }

    // SPA fallback
    if (FILES["index.html"]) {
      return new Response(FILES["index.html"], {
        headers: { "Content-Type": "text/html" },
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};

function guessContentType(path) {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}
`;
}

// ── Teardown ─────────────────────────────────────────────────────────

/**
 * Delete a deployed worker.
 */
export async function deleteWorker(
  config: CloudflareDeployConfig,
  workerId: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${workerId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
        },
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
