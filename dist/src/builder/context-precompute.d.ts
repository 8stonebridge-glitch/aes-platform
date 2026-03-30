/**
 * P3 — Shared Context Precompute.
 * Scans the target workspace once and caches route maps, schema summaries,
 * and component lists so each feature build doesn't re-discover them.
 */
export interface PrecomputedContext {
    route_map: Record<string, string>;
    schema_tables: string[];
    schema_summary: string;
    components: ComponentEntry[];
    shared_utils: string[];
    existing_pages: string[];
    timestamp: number;
}
export interface ComponentEntry {
    name: string;
    path: string;
    exports: string[];
}
/**
 * Precompute shared context from a workspace directory.
 */
export declare function precomputeContext(workspacePath: string): PrecomputedContext;
/**
 * Scan for API routes (Next.js app router convention).
 */
export declare function scanRouteMap(workspacePath: string): Record<string, string>;
/**
 * Scan for schema definitions (Convex schema.ts or Prisma schema).
 */
export declare function scanSchemaSummary(workspacePath: string): {
    tables: string[];
    summary: string;
};
/**
 * Scan for React components in src/components.
 */
export declare function scanComponents(workspacePath: string): ComponentEntry[];
/**
 * Update context after a feature build completes (incremental).
 */
export declare function updateContextAfterBuild(ctx: PrecomputedContext, filesCreated: string[], workspacePath: string): PrecomputedContext;
