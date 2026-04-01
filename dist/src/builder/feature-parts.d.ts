/**
 * Feature decomposition — splits a feature into atomic build parts
 * before generation. Each part is a narrow, focused generation unit
 * that succeeds or fails independently.
 *
 * Instead of one giant "generate settings page" LLM call, the builder
 * decomposes into: page-shell → auth-guard → form-body → mutation → validation → test.
 * Each part has a fixed preamble and produces a code fragment.
 * Fragments compose into final files.
 */
import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderContext } from "./code-builder.js";
export type PartKind = "page-shell" | "auth-guard" | "data-loader" | "form-body" | "submit-handler" | "query" | "mutation" | "validation" | "test" | "component";
export interface FeatureBuildPart {
    kind: PartKind;
    /** Target file this part contributes to */
    targetFile: string;
    /** Order within the target file (lower = earlier in composed output) */
    order: number;
    /** Narrow generation prompt for this part only */
    prompt: string;
    /** Fixed preamble — deterministic code that doesn't need LLM */
    preamble?: string;
    /** Whether this part requires LLM or is fully deterministic */
    deterministic: boolean;
    /** Dependencies — other part kinds that must complete first */
    dependsOn: PartKind[];
}
export interface DecomposedFeature {
    featureSlug: string;
    tableName: string;
    parts: FeatureBuildPart[];
    /** Files that will be produced and which parts compose them */
    fileMap: Record<string, PartKind[]>;
}
/**
 * Decompose a feature into atomic build parts.
 * Returns an ordered list of parts, each with a narrow prompt scope.
 */
export declare function decomposeFeature(pkg: BuilderPackage, context?: BuilderContext): DecomposedFeature;
export interface GeneratedFragment {
    part: FeatureBuildPart;
    code: string;
    success: boolean;
    error?: string;
}
/**
 * Compose fragments for a single target file.
 * Deterministic parts use their preamble directly.
 * LLM parts use the generated code.
 * Order is respected within each file.
 */
export declare function composeFile(targetFile: string, fragments: GeneratedFragment[]): string;
/**
 * Get parts for a specific file, sorted by order.
 */
export declare function getPartsForFile(decomposed: DecomposedFeature, targetFile: string): FeatureBuildPart[];
/**
 * Get all unique target files from a decomposed feature.
 */
export declare function getTargetFiles(decomposed: DecomposedFeature): string[];
/**
 * Check if all dependencies for a part have been satisfied.
 */
export declare function dependenciesSatisfied(part: FeatureBuildPart, completedKinds: Set<PartKind>): boolean;
