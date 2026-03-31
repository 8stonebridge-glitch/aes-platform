/**
 * Workspace Manifest — post-scaffold import resolver and manifest emitter.
 *
 * After AES scaffolds a generated app workspace, this module:
 *   1. Scans all generated .ts/.tsx files
 *   2. Builds a manifest of available exports (file → exported symbols)
 *   3. Validates that every import in the workspace resolves to a real file
 *   4. Reports unresolvable imports so the compile gate can act on them
 *
 * This catches guessed @/app/ imports, missing component files, and
 * cross-feature imports that don't exist — before tsc runs.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
/** Recursively collect all .ts/.tsx files under a directory. */
function collectFiles(dir, rootDir) {
    const results = [];
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                // Skip node_modules, .next, dist, .git
                if (["node_modules", ".next", "dist", ".git", "_generated"].includes(entry.name))
                    continue;
                results.push(...collectFiles(fullPath, rootDir));
            }
            else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
                results.push(relative(rootDir, fullPath));
            }
        }
    }
    catch {
        // directory not readable
    }
    return results;
}
/** Extract named and default exports from a file's content via regex. */
function extractExports(content) {
    const named = [];
    // export const/let/function/class Name
    for (const m of content.matchAll(/export\s+(?:const|let|var|function|class)\s+(\w+)/g)) {
        named.push(m[1]);
    }
    // export { Name, Name2 }
    for (const m of content.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const n of m[1].split(",")) {
            const trimmed = n.replace(/\s+as\s+\w+/, "").trim();
            if (trimmed)
                named.push(trimmed);
        }
    }
    const hasDefault = /export\s+default\b/.test(content);
    return { named: Array.from(new Set(named)), hasDefault };
}
/** Extract import specifiers from a file's content. */
function extractImports(content) {
    const imports = [];
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Static imports: import ... from "specifier"
        const m = line.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
        if (m) {
            imports.push({ specifier: m[1], line: i + 1 });
            continue;
        }
        // Dynamic imports: import("specifier")
        const d = line.match(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/);
        if (d) {
            imports.push({ specifier: d[1], line: i + 1 });
        }
    }
    return imports;
}
/** Check if a relative or alias import resolves to a file in the workspace. */
function resolveSpecifier(specifier, sourceFile, workspacePath, fileSet) {
    // Skip external packages (no . or @ prefix, or @-scoped npm packages)
    if (!specifier.startsWith(".") && !specifier.startsWith("@/"))
        return true;
    // Skip known external aliases
    if (specifier.startsWith("@clerk/") || specifier.startsWith("@aes/") ||
        specifier.startsWith("@testing-library/") || specifier === "convex/react" ||
        specifier === "convex/values" || specifier === "convex/server" ||
        specifier.startsWith("convex/"))
        return true;
    // Resolve @/ alias to workspace root
    let resolved;
    if (specifier.startsWith("@/")) {
        resolved = specifier.slice(2); // strip @/
    }
    else {
        // Relative import — resolve from source file's directory
        resolved = join(dirname(sourceFile), specifier).replace(/\\/g, "/");
    }
    // Try with various extensions and index files
    const candidates = [
        resolved,
        `${resolved}.ts`,
        `${resolved}.tsx`,
        `${resolved}/index.ts`,
        `${resolved}/index.tsx`,
        `${resolved}/page.tsx`,
        `${resolved}/page.ts`,
    ];
    return candidates.some((c) => fileSet.has(c));
}
/**
 * Build a manifest of all generated files and validate imports.
 * Call this after scaffolding and code generation, before the compile gate.
 */
export function buildWorkspaceManifest(workspacePath) {
    const files = collectFiles(workspacePath, workspacePath);
    const fileSet = new Set(files);
    const entries = [];
    const issues = [];
    let totalImports = 0;
    for (const relativePath of files) {
        const absPath = join(workspacePath, relativePath);
        let content;
        try {
            content = readFileSync(absPath, "utf-8");
        }
        catch {
            continue;
        }
        // Build export manifest
        const { named, hasDefault } = extractExports(content);
        entries.push({ relativePath, namedExports: named, hasDefaultExport: hasDefault });
        // Validate imports
        const imports = extractImports(content);
        totalImports += imports.length;
        for (const imp of imports) {
            if (!resolveSpecifier(imp.specifier, relativePath, workspacePath, fileSet)) {
                issues.push({
                    sourceFile: relativePath,
                    specifier: imp.specifier,
                    line: imp.line,
                });
            }
        }
    }
    return {
        entries,
        issues,
        totalFiles: files.length,
        totalImports,
        unresolvedCount: issues.length,
    };
}
/**
 * Write the manifest to a JSON file in the workspace for debugging/audit.
 */
export function writeManifestFile(workspacePath, manifest) {
    const outPath = join(workspacePath, ".aes-manifest.json");
    writeFileSync(outPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        totalFiles: manifest.totalFiles,
        totalImports: manifest.totalImports,
        unresolvedCount: manifest.unresolvedCount,
        issues: manifest.issues,
        files: manifest.entries.map((e) => ({
            path: e.relativePath,
            exports: e.namedExports,
            default: e.hasDefaultExport,
        })),
    }, null, 2));
    return outPath;
}
/**
 * Format unresolved imports as a human-readable string for the compile gate log.
 */
export function formatImportIssues(issues) {
    if (issues.length === 0)
        return "All imports resolve.";
    const lines = issues.slice(0, 20).map((i) => `  ${i.sourceFile}:${i.line} → import "${i.specifier}" (not found)`);
    const suffix = issues.length > 20 ? `\n  ...and ${issues.length - 20} more` : "";
    return `Unresolved imports (${issues.length}):\n${lines.join("\n")}${suffix}`;
}
