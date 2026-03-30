/**
 * Layer 4 — Pattern Requirements Schema
 *
 * Defines what a "well-built page" looks like for each page archetype.
 * Used by the Composition Validator to check that built pages conform
 * to patterns, not just that they use the right components.
 */
export interface PatternRequirement {
    pattern_id: string;
    pattern_name: string;
    required_sections: {
        id: string;
        name: string;
        description: string;
        markers: string[];
    }[];
    required_states: {
        state: string;
        description: string;
        markers: string[];
    }[];
    required_interactions: {
        interaction: string;
        description: string;
        markers: string[];
    }[];
    richness_checks: {
        check: string;
        description: string;
        markers: string[];
        severity: "error" | "warning";
    }[];
}
export declare const PAGE_PATTERNS: Record<string, PatternRequirement>;
export declare const FEATURE_TO_PATTERN: Record<string, string[]>;
