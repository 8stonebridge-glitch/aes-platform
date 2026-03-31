export type FrameworkId = "convex" | "clerk" | "nextjs" | "vercel";
export type FrameworkCodeKind = "query" | "mutation" | "auth" | "middleware" | "route" | "page" | "schema";
export type FrameworkContractPackId = "convex/query-core" | "convex/mutation-core" | "convex/schema-core" | "clerk/client-auth" | "clerk/server-auth";
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
