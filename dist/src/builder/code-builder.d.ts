import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
import { type Workspace } from "./workspace-manager.js";
export declare const CATALOG_ENFORCEMENT_RULES = "\n## CATALOG ENFORCEMENT \u2014 HARD RULES\n\nFORBIDDEN \u2014 Writing these raw HTML elements:\n- <button> \u2014 use Button from @aes/ui\n- <input> \u2014 use Input from @aes/ui\n- <textarea> \u2014 use Textarea from @aes/ui\n- <table>, <thead>, <tbody>, <tr>, <td>, <th> \u2014 use Table from @aes/ui\n- <select> \u2014 use Select from @aes/ui\n- Custom card divs (div with border+rounded) \u2014 use Card from @aes/ui\n- Custom badge spans (span with rounded-full+text-xs) \u2014 use Badge from @aes/ui\n- Custom loading spinners \u2014 use LoadingState from @aes/ui\n- Custom empty states \u2014 use EmptyState from @aes/ui\n- Custom error displays \u2014 use ErrorState from @aes/ui\n- Custom toast/notification displays \u2014 use Toast from @aes/ui\n\nREQUIRED \u2014 Every page file must:\n- Import at least one component from @aes/ui\n- Use Button for all clickable actions\n- Use Input/Textarea for all form fields\n- Use Card for all content containers\n- Use Badge for all status indicators\n- Use Table for all tabular data\n- Use LoadingState when data is loading\n- Use EmptyState when no data exists\n- Use ErrorState when fetch fails\n\nIf a component exists in @aes/ui that matches what you need, you MUST use it.\nWriting a custom version of any @aes/ui component is a SCOPE VIOLATION.\n";
/**
 * Context for LLM code generation — enriches BuilderPackage with AppSpec data.
 */
export interface GraphGuidance {
    /** Prior violations relevant to this feature/app class */
    violations: {
        code: string;
        description: string;
        resolution: string;
        severity: string;
    }[];
    /** Known failure patterns from prior builds */
    failurePatterns: {
        pattern: string;
        diagnosis: string;
        fixAction: string;
    }[];
    /** Corrections learned from prior builds */
    corrections: {
        description: string;
        resolution: string;
    }[];
    /** Reusable patterns from similar features */
    knownPatterns: {
        name: string;
        description: string;
    }[];
    /** Learned feature structures from prior builds */
    learnedFeatures: {
        name: string;
        description: string;
        capabilities?: string;
    }[];
    /** Learned data models from prior builds */
    learnedModels: {
        name: string;
        fields: string;
        schemaSource?: string;
    }[];
    /** Learned integrations from prior builds */
    learnedIntegrations: {
        name: string;
        type: string;
        description: string;
    }[];
    /** Learned UI/data flow patterns */
    learnedFlows: {
        name: string;
        description: string;
    }[];
    /** External research findings relevant to this build */
    learnedResearch: {
        topic: string;
        finding: string;
    }[];
    /** Models extracted from prior successful builds */
    buildExtractedModels: {
        name: string;
        fields: string;
        appClass: string;
    }[];
    /** Patterns extracted from prior builds with code samples */
    buildExtractedPatterns: {
        name: string;
        type: string;
        description: string;
        codeSample?: string;
    }[];
    /** Tech stacks from prior builds */
    buildExtractedTech: {
        name: string;
        version: string;
        category: string;
    }[];
    /** Learned component patterns — reusable UI building blocks */
    learnedComponentPatterns: {
        name: string;
        category: string;
        description: string;
        props?: string;
        usageExample?: string;
    }[];
    /** Learned form patterns — validated form structures */
    learnedFormPatterns: {
        name: string;
        description: string;
        fields?: string;
        validationRules?: string;
    }[];
    /** Learned navigation patterns */
    learnedNavigation: {
        name: string;
        type: string;
        description: string;
    }[];
    /** Learned page section layouts */
    learnedPageSections: {
        name: string;
        type: string;
        description: string;
        layout?: string;
    }[];
    /** Learned state management patterns */
    learnedStatePatterns: {
        name: string;
        patternType: string;
        description: string;
    }[];
    /** Design system references */
    learnedDesignSystems: {
        name: string;
        description: string;
        componentLibrary?: string;
    }[];
    /** Prevention rules — proactive error avoidance */
    preventionRules: {
        name: string;
        condition: string;
        action: string;
        severity: string;
    }[];
    /** Fix patterns — known fix strategies for recurring errors */
    fixPatterns: {
        name: string;
        errorPattern: string;
        fixStrategy: string;
        successRate?: string;
    }[];
    /** Working Convex schemas from prior builds */
    convexSchemas: {
        name: string;
        tables: string;
        appClass: string;
        schemaText?: string;
    }[];
    /** Reference data model templates */
    referenceSchemas: {
        name: string;
        domain: string;
        tables: string;
        schemaText?: string;
    }[];
    /** AES system lessons */
    aesLessons: {
        title: string;
        summary: string;
        category: string;
    }[];
    /** Proven app architecture blueprints */
    aesBlueprints: {
        name: string;
        appClass: string;
        description: string;
        featureList?: string;
    }[];
    /** Prior app contexts with full feature/model/integration graphs */
    learnedAppContext: {
        appName: string;
        appClass: string;
        features: string;
        models: string;
        integrations: string;
    }[];
    /** AES reasoning rules and search strategies */
    reasoningRules: {
        title: string;
        summary: string;
        strategies: string;
    }[];
    /** AES preflight checklists */
    aesPreflight: {
        title: string;
        steps: string;
    }[];
    /** Unified reasoner: domain decomposition with best source apps */
    unifiedDomainSources: {
        domain: string;
        bestApp: string;
        features: string;
        models: string;
        integrations: string;
    }[];
    /** Unified reasoner: composite architecture blueprint */
    unifiedBlueprint: string[];
    /** Unified reasoner: knowledge gaps identified */
    unifiedGaps: string[];
    /** Unified reasoner: discovered knowledge from beam search */
    unifiedDiscoveredKnowledge: {
        category: string;
        items: string;
    }[];
    /** Unified reasoner: universal patterns (found in 5+ apps) */
    unifiedUniversalPatterns: {
        name: string;
        type: string;
        percentage: string;
    }[];
    /** Unified reasoner: concept confidence scores */
    unifiedConceptScores: {
        concept: string;
        confidence: string;
        totalHits: string;
        evidence: string;
    }[];
}
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
    /** Graph-derived guidance: prior violations, failure patterns, corrections */
    graphGuidance?: GraphGuidance;
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
