export type FrameworkId = "convex" | "clerk" | "nextjs" | "vercel";
export type FrameworkCodeKind = "query" | "mutation" | "auth" | "middleware" | "route" | "page" | "schema" | "test";
export type FrameworkContractPackId = "convex/query-core" | "convex/mutation-core" | "convex/schema-core" | "clerk/client-auth" | "clerk/server-auth" | "clerk/middleware" | "test/vitest-core";
export interface ContractTemplate {
    id: string;
    title: string;
    slotNotes?: string[];
    code: string;
}
export interface VerifiedPattern {
    id: string;
    title: string;
    codeKind: FrameworkCodeKind;
    source: "manual" | "successful-build" | "curated";
    code: string;
    notes?: string[];
    passedChecks: string[];
}
export interface RepairRule {
    id: string;
    trigger: {
        errorRegex: string;
        fileHint?: string;
    };
    diagnosis: string;
    fixInstruction: string;
    replacementPatternId?: string;
}
export interface FrameworkContractPack {
    id: FrameworkContractPackId;
    framework: FrameworkId;
    area: string;
    versionTag: string;
    status: "draft" | "verified" | "deprecated";
    appliesWhen: {
        fileGlobs?: string[];
        codeKind?: FrameworkCodeKind[];
        stackSignals?: string[];
    };
    hardRules: string[];
    forbiddenPatterns: string[];
    preferredImports?: string[];
    templateSkeletons: ContractTemplate[];
    verifiedPatterns: VerifiedPattern[];
    repairRules: RepairRule[];
    testCases: string[];
}
export interface ContractGuardResult {
    content: string;
    changed: boolean;
    appliedRules: string[];
    packIds: FrameworkContractPackId[];
}
export declare function getFrameworkContractPack(id: FrameworkContractPackId): FrameworkContractPack;
export declare function listFrameworkContractPacks(ids?: FrameworkContractPackId[]): FrameworkContractPack[];
/**
 * Retrieve the closest verified pattern + template skeleton for a given
 * part kind. Used by the decomposed builder to ground each LLM call
 * with a real, verified example instead of hoping the model guesses right.
 *
 * Returns a formatted string to inject into the generation prompt.
 */
export declare function retrieveVerifiedContextForPart(partKind: string): string;
export declare function buildFrameworkContractContext(ids: FrameworkContractPackId[]): string;
export declare function getContractPackIdsForGeneration(args: {
    framework?: FrameworkId;
    codeKind?: FrameworkCodeKind;
    filePath?: string;
    usesClerkAuth?: boolean;
    serverAuth?: boolean;
}): FrameworkContractPackId[];
export declare function detectContractPackIdsForFile(filePath: string, content: string): FrameworkContractPackId[];
export declare function applyFrameworkContractGuardrails(filePath: string, content: string): ContractGuardResult;
export type FeatureArchetypeId = "settings" | "auth" | "org-management" | "profile" | "admin-panel";
export interface FeatureArchetypeSlots {
    TABLE: string;
    FEATURE_LABEL: string;
    FEATURE_SLUG: string;
    ROUTE: string;
    FIELDS: {
        name: string;
        type: string;
        label: string;
        default?: string;
    }[];
    ROLES?: string[];
    PAGE_TITLE?: string;
}
export interface FeatureArchetype {
    id: FeatureArchetypeId;
    matchKeywords: string[];
    description: string;
    /** Complete file templates with {{SLOT}} placeholders */
    files: {
        queries: string;
        mutations: string;
        schemaFields: string;
        listPage: string;
        formPage: string;
        detailPage?: string;
        test: string;
    };
}
/**
 * Match a feature against the archetype registry.
 * Returns the archetype if the feature name/description/capabilities
 * match any archetype's keywords. Returns null for generic features.
 */
export declare function matchFeatureArchetype(featureName: string, featureDescription?: string, capabilities?: string[]): FeatureArchetype | null;
/**
 * Derive default slots from a feature name and archetype.
 * The builder can override any slot.
 */
export declare function deriveArchetypeSlots(featureName: string, archetype: FeatureArchetype): FeatureArchetypeSlots;
/**
 * Render an archetype's file templates with filled slots.
 * Returns a record of logical file key → rendered content.
 * Empty strings mean "skip this file".
 */
export declare function renderArchetypeFiles(archetype: FeatureArchetype, slots: FeatureArchetypeSlots): Record<keyof FeatureArchetype["files"], string>;
/** Get all registered archetype IDs */
export declare function getArchetypeIds(): FeatureArchetypeId[];
/** Get an archetype by ID */
export declare function getArchetype(id: FeatureArchetypeId): FeatureArchetype;
