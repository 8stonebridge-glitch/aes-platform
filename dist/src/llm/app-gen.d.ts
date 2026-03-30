/**
 * LLM-powered generation for app-level files (layout, sidebar, dashboard, unified schema).
 *
 * Each function tries the LLM first; returns null when the model is
 * unavailable so the caller can fall back to its template path.
 */
/**
 * Generate the root layout.tsx with ClerkProvider, ConvexClientProvider, and Sidebar.
 */
export declare function generateAppLayout(appSpec: any): Promise<string | null>;
/**
 * Generate the sidebar navigation component.
 */
export declare function generateSidebar(appSpec: any): Promise<string | null>;
/**
 * Generate the dashboard/home page.
 */
export declare function generateDashboard(appSpec: any): Promise<string | null>;
/**
 * Generate the unified Convex schema for all features.
 */
export declare function generateUnifiedSchema(appSpec: any): Promise<string | null>;
