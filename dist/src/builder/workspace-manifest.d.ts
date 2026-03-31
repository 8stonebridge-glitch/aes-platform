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
export interface ManifestEntry {
    /** Relative path from workspace root, e.g. "app/features/shoutouts/page.tsx" */
    relativePath: string;
    /** Named exports extracted via regex */
    namedExports: string[];
    /** Whether the file has a default export */
    hasDefaultExport: boolean;
}
export interface ImportIssue {
    /** File that contains the broken import */
    sourceFile: string;
    /** The import specifier that doesn't resolve */
    specifier: string;
    /** Line number (1-based) */
    line: number;
}
export interface ManifestResult {
    entries: ManifestEntry[];
    issues: ImportIssue[];
    totalFiles: number;
    totalImports: number;
    unresolvedCount: number;
}
/**
 * Build a manifest of all generated files and validate imports.
 * Call this after scaffolding and code generation, before the compile gate.
 */
export declare function buildWorkspaceManifest(workspacePath: string): ManifestResult;
/**
 * Write the manifest to a JSON file in the workspace for debugging/audit.
 */
export declare function writeManifestFile(workspacePath: string, manifest: ManifestResult): string;
/**
 * Format unresolved imports as a human-readable string for the compile gate log.
 */
export declare function formatImportIssues(issues: ImportIssue[]): string;
