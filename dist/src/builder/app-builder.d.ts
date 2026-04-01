/**
 * AppBuilder — builds a complete, runnable Next.js + Clerk + Convex application.
 *
 * Two-phase build:
 *   Phase 1: Scaffold the full app (RepoScaffolder + app-level files)
 *   Phase 2: Build each feature INTO the shared workspace
 *
 * The result is a single git workspace containing the entire app, committed
 * as one atomic commit.
 */
import { type Workspace } from "./workspace-manager.js";
import { type BuilderContext } from "./code-builder.js";
import { type BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
import type { GraphCallbacks } from "../graph.js";
import type { AESStateType } from "../state.js";
import type { GraphGuidance } from "./code-builder.js";
export interface AppBuildResult {
    workspace: Workspace;
    run: BuilderRunRecord;
    featureResults: Record<string, BuilderRunRecord>;
    prSummary: string;
    file_contents: Record<string, string>;
}
/**
 * Formats graph guidance into a constraint block that can be injected
 * into LLM system prompts. Only includes non-empty sections.
 */
export declare function formatGraphGuidanceForPrompt(guidance?: GraphGuidance): string;
export declare class AppBuilder {
    private workspaceManager;
    private codeBuilder;
    private scaffolder;
    /**
     * Build a complete application from an AppSpec.
     *
     * Phase 1: Scaffold base project + generate app-level files
     * Phase 2: Build each feature into the shared workspace
     * Phase 3: Commit everything as a single atomic commit
     */
    buildApp(jobId: string, appSpec: any, featureBridges: Record<string, any>, featureBuildOrder: string[], callbacks?: GraphCallbacks | null, targetPath?: string | null, reusableSourceFiles?: Record<string, {
        repo: string;
        path: string;
        files: {
            path: string;
            content: string;
        }[];
    }>, graphContext?: AESStateType["graphContext"]): Promise<AppBuildResult>;
    private generateAppLevelFiles;
    private generateLayout;
    private generateSidebarFile;
    private generateDashboardFile;
    private generateSchemaFile;
    /**
     * Build a single feature INTO the existing workspace.
     *
     * Unlike CodeBuilder.build(), this:
     * - Does NOT create a new workspace (uses provided path)
     * - Does NOT commit (caller handles that)
     * - Does NOT generate per-feature schema.ts (unified schema handles it)
     * - Returns the files created and their contents
     */
    buildFeatureInPlace(workspacePath: string, pkg: BuilderPackage, context?: BuilderContext, fileContents?: Record<string, string>): Promise<{
        files_created: string[];
        file_contents: Record<string, string>;
    }>;
    /**
     * Write a page as a server-wrapper + client-component pair.
     * Returns the list of relative paths written.
     */
    private writePageWithServerWrapper;
    private ensureDir;
    private writeAndTrack;
    private writeConvexFunctions;
    private writePages;
    private writeFormPage;
    private writeListPage;
    private writeDetailPage;
    private writeComponents;
    private writeTests;
}
