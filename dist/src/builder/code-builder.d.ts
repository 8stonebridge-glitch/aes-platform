import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
import { type Workspace } from "./workspace-manager.js";
export declare const CATALOG_ENFORCEMENT_RULES = "\n## CATALOG ENFORCEMENT \u2014 HARD RULES\n\nFORBIDDEN \u2014 Writing these raw HTML elements:\n- <button> \u2014 use Button from @aes/ui\n- <input> \u2014 use Input from @aes/ui\n- <textarea> \u2014 use Textarea from @aes/ui\n- <table>, <thead>, <tbody>, <tr>, <td>, <th> \u2014 use Table from @aes/ui\n- <select> \u2014 use Select from @aes/ui\n- Custom card divs (div with border+rounded) \u2014 use Card from @aes/ui\n- Custom badge spans (span with rounded-full+text-xs) \u2014 use Badge from @aes/ui\n- Custom loading spinners \u2014 use LoadingState from @aes/ui\n- Custom empty states \u2014 use EmptyState from @aes/ui\n- Custom error displays \u2014 use ErrorState from @aes/ui\n- Custom toast/notification displays \u2014 use Toast from @aes/ui\n\nREQUIRED \u2014 Every page file must:\n- Import at least one component from @aes/ui\n- Use Button for all clickable actions\n- Use Input/Textarea for all form fields\n- Use Card for all content containers\n- Use Badge for all status indicators\n- Use Table for all tabular data\n- Use LoadingState when data is loading\n- Use EmptyState when no data exists\n- Use ErrorState when fetch fails\n\nIf a component exists in @aes/ui that matches what you need, you MUST use it.\nWriting a custom version of any @aes/ui component is a SCOPE VIOLATION.\n";
/**
 * Context for LLM code generation — enriches BuilderPackage with AppSpec data.
 */
export interface BuilderContext {
    feature?: {
        name: string;
        description: string;
        summary?: string;
        outcome: string;
        actor_ids?: string[];
        destructive_actions?: {
            action_name: string;
            reversible: boolean;
            confirmation_required: boolean;
            audit_logged: boolean;
        }[];
        audit_required?: boolean;
    };
    appSpec?: {
        title: string;
        summary: string;
        roles?: {
            role_id: string;
            name: string;
            description: string;
        }[];
        permissions?: {
            role_id: string;
            resource: string;
            effect: string;
        }[];
    };
}
export declare class CodeBuilder {
    private workspaceManager;
    build(jobId: string, pkg: BuilderPackage, repoUrl?: string, context?: BuilderContext): Promise<{
        run: BuilderRunRecord;
        workspace: Workspace;
        prSummary: string;
    }>;
    private ensureDir;
    /** Read a written file's content and store it in the tracking map */
    private trackFile;
    /** Helper to write a file and track its content simultaneously */
    private writeAndTrack;
    private writeConvexSchema;
    private writeConvexFunctions;
    private writePages;
    private writeFormPage;
    private writeListPage;
    private writeDetailPage;
    private writeComponents;
    private writeTests;
    private toPascalCase;
}
