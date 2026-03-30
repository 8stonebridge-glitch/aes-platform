export interface RepoConfig {
    app_name: string;
    app_slug: string;
    org_id?: string;
}
/**
 * Scaffolds a real Next.js + Clerk + Convex project in a workspace.
 * This produces an actually buildable/deployable project, not stubs.
 */
export declare class RepoScaffolder {
    scaffold(workspacePath: string, config: RepoConfig): void;
    private ensureDir;
    private writePackageJson;
    private writeTsConfig;
    private writeNextConfig;
    private writeTailwindConfig;
    private writePostcssConfig;
    private writeEnvExample;
    private writeConvexBase;
    private writeClerkMiddleware;
    private writeAppLayout;
    private writeHomePage;
    private writeGlobalCss;
    private writeGitignore;
    private writeAesConfig;
}
