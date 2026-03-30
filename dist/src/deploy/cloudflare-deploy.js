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
const PREVIEW_CSS = `
:root {
  color-scheme: light;
  --bg: #f5f7fb;
  --card: #ffffff;
  --ink: #172033;
  --muted: #5f6c86;
  --line: #d9e1f2;
  --accent: #2457f5;
  --accent-soft: #e8efff;
}

* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, #ffffff 0%, var(--bg) 50%, #edf2ff 100%);
  color: var(--ink);
}

a { color: inherit; text-decoration: none; }

.shell {
  width: min(1100px, calc(100vw - 32px));
  margin: 0 auto;
  padding: 32px 0 64px;
}

.hero {
  background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #60a5fa 100%);
  color: white;
  border-radius: 28px;
  padding: 32px;
  box-shadow: 0 32px 80px rgba(36, 87, 245, 0.2);
}

.eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.16);
  padding: 8px 12px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.hero h1 {
  margin: 18px 0 12px;
  font-size: clamp(2.1rem, 4vw, 3.6rem);
  line-height: 1;
}

.hero p {
  max-width: 58ch;
  color: rgba(255,255,255,0.86);
  font-size: 1rem;
  line-height: 1.7;
  margin: 0;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.pill {
  background: rgba(255,255,255,0.12);
  color: white;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: 999px;
  padding: 10px 14px;
  font-size: 0.95rem;
}

.section-title {
  margin: 28px 0 14px;
  font-size: 0.95rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.card {
  background: var(--card);
  border-radius: 22px;
  border: 1px solid var(--line);
  padding: 22px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.06);
}

.card h2, .card h3 {
  margin: 0 0 12px;
  font-size: 1.15rem;
}

.card p {
  margin: 0;
  color: var(--muted);
  line-height: 1.6;
}

.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  padding: 12px 16px;
  border-radius: 14px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.route-list {
  display: grid;
  gap: 12px;
}

.route-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: 0 14px 32px rgba(15, 23, 42, 0.05);
}

.route-link span:last-child {
  color: var(--muted);
  font-size: 0.92rem;
}

.source {
  margin-top: 24px;
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
  color: #dbe4ff;
  font: 12px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: auto;
  white-space: pre-wrap;
}

.breadcrumbs {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  margin: 18px 0 22px;
  font-size: 0.95rem;
}

@media (max-width: 700px) {
  .shell {
    width: min(100vw - 20px, 1100px);
    padding-top: 18px;
  }
  .hero {
    border-radius: 20px;
    padding: 24px;
  }
}
`;
async function resolveWorkersDevSubdomain(config) {
    const configured = config.workersSubdomain || process.env.AES_CF_WORKERS_SUBDOMAIN;
    if (configured) {
        return { subdomain: configured, error: null };
    }
    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/subdomain`, {
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
            },
        });
        const payload = await res.json().catch(() => null);
        const result = payload?.result;
        const subdomain = typeof result === "string"
            ? result
            : typeof result?.subdomain === "string"
                ? result.subdomain
                : typeof result?.name === "string"
                    ? result.name
                    : typeof result?.domain === "string"
                        ? result.domain.replace(/\.workers\.dev$/i, "")
                        : null;
        if (res.ok && subdomain) {
            return { subdomain, error: null };
        }
        const apiError = Array.isArray(payload?.errors) && payload.errors.length > 0
            ? payload.errors.map((e) => e?.message).filter(Boolean).join("; ")
            : `Cloudflare workers.dev subdomain lookup failed with ${res.status}`;
        return { subdomain: null, error: apiError };
    }
    catch (e) {
        return {
            subdomain: null,
            error: e?.message || "Could not resolve Cloudflare workers.dev subdomain",
        };
    }
}
async function waitForPreviewReady(previewUrl, attempts = 20, delayMs = 3000) {
    let lastStatus = null;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const res = await fetch(previewUrl, {
                redirect: "follow",
                headers: {
                    "Cache-Control": "no-cache",
                },
            });
            lastStatus = res.status;
            if (res.ok) {
                return { ready: true, lastStatus, lastError: null };
            }
        }
        catch (error) {
            lastError = error?.message || "Unknown preview readiness error";
        }
        if (attempt < attempts - 1) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    return { ready: false, lastStatus, lastError };
}
// ── File bundler ─────────────────────────────────────────────────────
const SKIP_DIRS = new Set([
    "node_modules", ".git", ".next", ".vercel", "dist", ".turbo", ".cache",
]);
const SKIP_FILES = new Set([
    ".DS_Store", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
]);
const MAX_FILE_SIZE = 1024 * 1024; // 1MB per file
function getModuleType(filePath) {
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
function decodeFileContent(content) {
    return content.replace(/\r\n/g, "\n");
}
function stripCodeFence(content) {
    const trimmed = content.trim();
    const fenceMatch = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
    return fenceMatch ? fenceMatch[1] : content;
}
function humanizeSlug(slug) {
    return slug
        .replace(/^\//, "")
        .replace(/\[[^\]]+\]/g, "Detail")
        .split("/")
        .filter(Boolean)
        .map((part) => part
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (match) => match.toUpperCase()))
        .join(" / ") || "Home";
}
function escapeHtml(value) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
function inferAppTitle(modules) {
    const packageJson = modules.find((module) => module.path === "package.json");
    if (packageJson) {
        try {
            const parsed = JSON.parse(packageJson.content);
            if (typeof parsed?.name === "string" && parsed.name.trim()) {
                return humanizeSlug(parsed.name.trim());
            }
        }
        catch {
            // fall through
        }
    }
    const titleSources = [
        modules.find((module) => /(^|\/)app\/layout\.(t|j)sx?$/.test(module.path)),
        modules.find((module) => /(^|\/)app\/page\.(t|j)sx?$/.test(module.path)),
    ].filter(Boolean);
    for (const source of titleSources) {
        const cleaned = stripCodeFence(decodeFileContent(source.content));
        const titleMatch = cleaned.match(/title:\s*["'`](.+?)["'`]/) ||
            cleaned.match(/<h1[^>]*>(.+?)<\/h1>/);
        if (titleMatch?.[1]) {
            return titleMatch[1].replace(/\{|\}/g, "").trim();
        }
    }
    return "AES Preview";
}
function inferRouteSummary(content) {
    const cleaned = stripCodeFence(decodeFileContent(content));
    const paragraph = cleaned.match(/<p[^>]*>(.+?)<\/p>/s)?.[1] ||
        cleaned.match(/description:\s*["'`](.+?)["'`]/)?.[1] ||
        cleaned.match(/summary:\s*["'`](.+?)["'`]/)?.[1];
    if (!paragraph)
        return null;
    return paragraph
        .replace(/\{|\}/g, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
function collectPreviewRoutes(modules) {
    const routes = modules
        .filter((module) => /(^|\/)(src\/)?app(?:\/.*)?\/page\.(t|j)sx?$/.test(module.path))
        .filter((module) => !module.path.includes("/api/"))
        .map((module) => {
        const relativeAppPath = module.path.replace(/^src\//, "");
        const routePart = relativeAppPath
            .replace(/^app\//, "")
            .replace(/page\.(t|j)sx?$/, "")
            .replace(/\/$/, "");
        const route = routePart ? `/${routePart}` : "/";
        return {
            route,
            label: humanizeSlug(route),
            sourcePath: module.path,
            summary: inferRouteSummary(module.content),
        };
    })
        .sort((left, right) => {
        if (left.route === "/")
            return -1;
        if (right.route === "/")
            return 1;
        return left.route.localeCompare(right.route);
    });
    return routes;
}
function previewOutputPath(route) {
    return route === "/" ? "index.html" : `${route.replace(/^\//, "")}/index.html`;
}
function renderPreviewIndex(appTitle, routes) {
    const routeLinks = routes
        .map((route) => {
        const href = route.route === "/" ? "/" : route.route;
        const detail = route.summary || `Preview route generated from ${route.sourcePath}`;
        return `<a class="route-link" href="${escapeHtml(href)}"><span><strong>${escapeHtml(route.label)}</strong></span><span>${escapeHtml(detail)}</span></a>`;
    })
        .join("\n");
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(appTitle)}</title>
    <link rel="stylesheet" href="/preview.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">AES Cloudflare Preview</div>
        <h1>${escapeHtml(appTitle)}</h1>
        <p>This preview was generated from the app workspace and published to Cloudflare Workers. Routes below are browsable so you can inspect the build output end to end.</p>
        <div class="meta">
          <div class="pill">${routes.length} route${routes.length === 1 ? "" : "s"} published</div>
          <div class="pill">Static preview shell</div>
          <div class="pill">Cloudflare Workers</div>
        </div>
      </section>

      <div class="section-title">Available routes</div>
      <section class="route-list">
        ${routeLinks}
      </section>
    </main>
  </body>
</html>`;
}
function renderPreviewRoute(appTitle, route, sourceContent) {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(`${route.label} · ${appTitle}`)}</title>
    <link rel="stylesheet" href="/preview.css" />
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">Route Preview</div>
        <h1>${escapeHtml(route.label)}</h1>
        <p>${escapeHtml(route.summary || `Generated from ${route.sourcePath}`)}</p>
        <div class="meta">
          <div class="pill">${escapeHtml(route.route)}</div>
          <div class="pill">${escapeHtml(route.sourcePath)}</div>
        </div>
      </section>

      <div class="breadcrumbs"><a href="/">Home</a> / <span>${escapeHtml(route.label)}</span></div>

      <section class="card">
        <h2>Preview Notes</h2>
        <p>This direct Cloudflare deployment path publishes a static preview shell for generated app routes when the workspace does not already contain browser-ready assets.</p>
        <a class="cta" href="/">Back to route index</a>
      </section>

      <section class="card">
        <h3>Generated source snapshot</h3>
        <pre class="source">${escapeHtml(sourceContent)}</pre>
      </section>
    </main>
  </body>
</html>`;
}
function withPreviewAssets(modules) {
    const alreadyHasStaticEntry = modules.some((module) => ["index.html", "public/index.html"].includes(module.path));
    if (alreadyHasStaticEntry) {
        return modules;
    }
    const routes = collectPreviewRoutes(modules);
    if (routes.length === 0) {
        return modules;
    }
    const appTitle = inferAppTitle(modules);
    const previewModules = [
        {
            path: "index.html",
            content: renderPreviewIndex(appTitle, routes),
            type: "text",
        },
        {
            path: "preview.css",
            content: PREVIEW_CSS,
            type: "text",
        },
    ];
    for (const route of routes.filter((candidate) => candidate.route !== "/")) {
        const sourceModule = modules.find((module) => module.path === route.sourcePath);
        previewModules.push({
            path: previewOutputPath(route.route),
            content: renderPreviewRoute(appTitle, route, stripCodeFence(decodeFileContent(sourceModule?.content || ""))),
            type: "text",
        });
    }
    return [...modules, ...previewModules];
}
/**
 * Recursively collect all source files from a workspace directory.
 */
export function bundleWorkspace(workspacePath) {
    const modules = [];
    function walk(dir) {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.name.startsWith(".") && entry.name !== ".env")
                continue;
            if (SKIP_FILES.has(entry.name))
                continue;
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (SKIP_DIRS.has(entry.name))
                    continue;
                walk(fullPath);
            }
            else if (entry.isFile()) {
                const stat = statSync(fullPath);
                if (stat.size > MAX_FILE_SIZE)
                    continue;
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
export async function deployToCloudflare(workspacePath, config) {
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
        const result = (await res.json());
        const readiness = await waitForPreviewReady(result.previewUrl);
        if (!readiness.ready) {
            return {
                success: false,
                previewUrl: result.previewUrl,
                workerId: result.workerId,
                fileCount: modules.length,
                bundleSize,
                error: `Gateway deployed worker but preview URL is not reachable yet. ` +
                    `${readiness.lastError || `Last status ${readiness.lastStatus ?? "unknown"}`}`,
            };
        }
        return {
            success: true,
            previewUrl: result.previewUrl,
            workerId: result.workerId,
            fileCount: modules.length,
            bundleSize,
            error: null,
        };
    }
    catch (e) {
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
export async function deployViaApi(workspacePath, config) {
    try {
        const modules = withPreviewAssets(bundleWorkspace(workspacePath));
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
        formData.append("worker.js", new Blob([workerScript], { type: "application/javascript+module" }), "worker.js");
        // Metadata
        const metadata = {
            main_module: "worker.js",
            compatibility_date: "2026-03-01",
            bindings: [],
        };
        if (config.d1DatabaseId) {
            metadata.bindings = [
                ...metadata.bindings,
                { type: "d1", name: "DB", id: config.d1DatabaseId },
            ];
        }
        if (config.kvNamespaceId) {
            metadata.bindings = [
                ...metadata.bindings,
                { type: "kv_namespace", name: "KV", namespace_id: config.kvNamespaceId },
            ];
        }
        if (config.r2BucketName) {
            metadata.bindings = [
                ...metadata.bindings,
                { type: "r2_bucket", name: "STORAGE", bucket_name: config.r2BucketName },
            ];
        }
        formData.append("metadata", JSON.stringify(metadata));
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${appName}`, {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
            },
            body: formData,
        });
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
        const enableSubdomain = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${appName}/subdomain`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ enabled: true }),
        });
        if (!enableSubdomain.ok) {
            const text = await enableSubdomain.text().catch(() => "");
            return {
                success: false,
                previewUrl: null,
                workerId: appName,
                fileCount: modules.length,
                bundleSize,
                error: `Cloudflare subdomain enable failed: ${enableSubdomain.status} ${text}`,
            };
        }
        const { subdomain, error: subdomainError } = await resolveWorkersDevSubdomain(config);
        if (!subdomain) {
            return {
                success: false,
                previewUrl: null,
                workerId: appName,
                fileCount: modules.length,
                bundleSize,
                error: `Cloudflare worker uploaded, but no workers.dev subdomain is configured. ` +
                    `${subdomainError || "Set AES_CF_WORKERS_SUBDOMAIN or open Workers & Pages once in Cloudflare."}`,
            };
        }
        const previewUrl = `https://${appName}.${subdomain}.workers.dev`;
        const readiness = await waitForPreviewReady(previewUrl);
        if (!readiness.ready) {
            return {
                success: false,
                previewUrl,
                workerId: appName,
                fileCount: modules.length,
                bundleSize,
                error: `Cloudflare worker uploaded, but preview URL is not reachable yet. ` +
                    `${readiness.lastError || `Last status ${readiness.lastStatus ?? "unknown"}`}`,
            };
        }
        return {
            success: true,
            previewUrl,
            workerId: appName,
            fileCount: modules.length,
            bundleSize,
            error: null,
        };
    }
    catch (e) {
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
function findEntryPoint(modules) {
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
        if (modules.some((m) => m.path === candidate))
            return candidate;
    }
    // Fallback: first JS/TS file
    const firstJs = modules.find((m) => m.type === "esm" || m.type === "cjs");
    return firstJs?.path || modules[0].path;
}
/**
 * Generate a Worker script that embeds all app files as a virtual filesystem
 * and serves them. For full-stack apps, this creates a simple asset server
 * with API route handling.
 */
function generateWorkerScript(entryPoint, modules) {
    // Embed all files as a virtual FS
    const fileMap = modules
        .map((m) => `  ${JSON.stringify(m.path)}: ${JSON.stringify(m.content)}`)
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
export async function deleteWorker(config, workerId) {
    try {
        const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts/${workerId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${config.apiToken}`,
            },
        });
        return res.ok;
    }
    catch {
        return false;
    }
}
