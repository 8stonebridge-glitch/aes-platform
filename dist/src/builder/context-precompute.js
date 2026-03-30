/**
 * P3 — Shared Context Precompute.
 * Scans the target workspace once and caches route maps, schema summaries,
 * and component lists so each feature build doesn't re-discover them.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, extname } from "node:path";
/**
 * Precompute shared context from a workspace directory.
 */
export function precomputeContext(workspacePath) {
    const routeMap = scanRouteMap(workspacePath);
    const { tables, summary } = scanSchemaSummary(workspacePath);
    const components = scanComponents(workspacePath);
    const sharedUtils = scanSharedUtils(workspacePath);
    const existingPages = scanPages(workspacePath);
    return {
        route_map: routeMap,
        schema_tables: tables,
        schema_summary: summary,
        components,
        shared_utils: sharedUtils,
        existing_pages: existingPages,
        timestamp: Date.now(),
    };
}
/**
 * Scan for API routes (Next.js app router convention).
 */
export function scanRouteMap(workspacePath) {
    const routeMap = {};
    const apiDir = join(workspacePath, "src", "app", "api");
    if (!existsSync(apiDir))
        return routeMap;
    walkDir(apiDir, (filePath) => {
        if (filePath.endsWith("route.ts") || filePath.endsWith("route.js")) {
            const rel = relative(apiDir, filePath);
            const route = "/api/" + rel.replace(/\/route\.(ts|js)$/, "").replace(/\\/g, "/");
            routeMap[route] = filePath;
        }
    });
    return routeMap;
}
/**
 * Scan for schema definitions (Convex schema.ts or Prisma schema).
 */
export function scanSchemaSummary(workspacePath) {
    const tables = [];
    // Check Convex schema
    const convexSchema = join(workspacePath, "convex", "schema.ts");
    if (existsSync(convexSchema)) {
        try {
            const content = readFileSync(convexSchema, "utf-8");
            const tableMatches = content.matchAll(/defineTable\s*\(/g);
            const nameMatches = content.matchAll(/(\w+)\s*:\s*defineTable/g);
            for (const m of nameMatches) {
                tables.push(m[1]);
            }
            return { tables, summary: `Convex schema with ${tables.length} tables: ${tables.join(", ")}` };
        }
        catch {
            // ignore read errors
        }
    }
    // Check Prisma schema
    const prismaSchema = join(workspacePath, "prisma", "schema.prisma");
    if (existsSync(prismaSchema)) {
        try {
            const content = readFileSync(prismaSchema, "utf-8");
            const modelMatches = content.matchAll(/model\s+(\w+)\s*\{/g);
            for (const m of modelMatches) {
                tables.push(m[1]);
            }
            return { tables, summary: `Prisma schema with ${tables.length} models: ${tables.join(", ")}` };
        }
        catch {
            // ignore read errors
        }
    }
    return { tables, summary: "No schema found" };
}
/**
 * Scan for React components in src/components.
 */
export function scanComponents(workspacePath) {
    const components = [];
    const compDir = join(workspacePath, "src", "components");
    if (!existsSync(compDir))
        return components;
    walkDir(compDir, (filePath) => {
        const ext = extname(filePath);
        if (ext === ".tsx" || ext === ".ts") {
            try {
                const content = readFileSync(filePath, "utf-8");
                const exports = [];
                const exportMatches = content.matchAll(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/g);
                for (const m of exportMatches) {
                    exports.push(m[1]);
                }
                if (exports.length > 0) {
                    components.push({
                        name: exports[0],
                        path: relative(workspacePath, filePath),
                        exports,
                    });
                }
            }
            catch {
                // ignore read errors
            }
        }
    });
    return components;
}
function scanSharedUtils(workspacePath) {
    const utils = [];
    const libDir = join(workspacePath, "src", "lib");
    if (!existsSync(libDir))
        return utils;
    walkDir(libDir, (filePath) => {
        const ext = extname(filePath);
        if (ext === ".ts" || ext === ".tsx") {
            utils.push(relative(workspacePath, filePath));
        }
    });
    return utils;
}
function scanPages(workspacePath) {
    const pages = [];
    const appDir = join(workspacePath, "src", "app");
    if (!existsSync(appDir))
        return pages;
    walkDir(appDir, (filePath) => {
        if (filePath.endsWith("page.tsx") || filePath.endsWith("page.ts")) {
            const rel = relative(appDir, filePath);
            pages.push("/" + rel.replace(/\/page\.(tsx|ts)$/, "").replace(/\\/g, "/"));
        }
    });
    return pages;
}
function walkDir(dir, callback, maxDepth = 6, depth = 0) {
    if (depth > maxDepth)
        return;
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.name.startsWith(".") || entry.name === "node_modules")
                continue;
            if (entry.isDirectory()) {
                walkDir(fullPath, callback, maxDepth, depth + 1);
            }
            else if (entry.isFile()) {
                callback(fullPath);
            }
        }
    }
    catch {
        // ignore permission errors
    }
}
/**
 * Update context after a feature build completes (incremental).
 */
export function updateContextAfterBuild(ctx, filesCreated, workspacePath) {
    const updated = { ...ctx, timestamp: Date.now() };
    for (const file of filesCreated) {
        // Update route map
        if (file.includes("/api/") && (file.endsWith("route.ts") || file.endsWith("route.js"))) {
            const route = file.replace(/.*\/api\//, "/api/").replace(/\/route\.(ts|js)$/, "");
            updated.route_map[route] = join(workspacePath, file);
        }
        // Update pages
        if (file.endsWith("page.tsx") || file.endsWith("page.ts")) {
            const page = file.replace(/.*\/app\//, "/").replace(/\/page\.(tsx|ts)$/, "");
            if (!updated.existing_pages.includes(page)) {
                updated.existing_pages.push(page);
            }
        }
        // Update components
        if (file.includes("/components/") && (file.endsWith(".tsx") || file.endsWith(".ts"))) {
            try {
                const content = readFileSync(join(workspacePath, file), "utf-8");
                const exportMatch = content.match(/export\s+(?:default\s+)?(?:function|const|class)\s+(\w+)/);
                if (exportMatch) {
                    updated.components.push({
                        name: exportMatch[1],
                        path: file,
                        exports: [exportMatch[1]],
                    });
                }
            }
            catch {
                // ignore
            }
        }
    }
    return updated;
}
