export interface FrameworkCheckResult {
    check: string;
    passed: boolean;
    detail: string;
}
/**
 * Validates generated code against actual Next.js + Clerk + Convex constraints.
 * Runs before approval, after code generation.
 */
export declare class FrameworkValidator {
    validateAll(workspacePath: string): FrameworkCheckResult[];
    private checkNextjsStructure;
    private checkConvexSchema;
    private checkClerkMiddleware;
    private checkConvexOrgFiltering;
    private checkAuditLogging;
    private checkEnvConfig;
    private checkRouteProtection;
    private walkDir;
}
