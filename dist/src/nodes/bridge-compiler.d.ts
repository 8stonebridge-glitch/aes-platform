import type { AESStateType } from "../state.js";
import { type ValidationResult } from "../types/artifacts.js";
import { type PatternRequirement } from "../types/pattern-requirements.js";
export interface ReuseRequirement {
    package: string;
    components: string[];
    reason: string;
}
export declare function resolveReuseRequirements(feature: any): ReuseRequirement[];
/**
 * Resolve which page-level pattern requirements apply to a feature.
 * Maps feature names to pattern IDs using FEATURE_TO_PATTERN, then
 * returns the full PatternRequirement objects for the builder.
 */
export declare function resolvePatternRequirements(feature: any): PatternRequirement[];
/**
 * Validate a compiled bridge against all 10 G2 rules.
 * Returns an array of ValidationResult for each check.
 * Failed checks set bridge status to "blocked".
 */
export declare function validateBridge(bridge: any): ValidationResult[];
export declare function bridgeCompiler(state: AESStateType): Promise<Partial<AESStateType>>;
