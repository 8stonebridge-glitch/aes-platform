/**
 * Layer 4 — Composition Validator (Tier B)
 *
 * Checks that built pages conform to expected patterns, not just that
 * they use the right components. Validates section presence, state handling,
 * interaction support, and visual richness.
 *
 * Layer 1-3 check: "Did you use @aes/ui/Button?"
 * Layer 4 checks: "Did you build a proper data-table-page with all
 *   required sections, states, and interactions?"
 */
export interface CompositionViolation {
    file: string;
    pattern: string;
    category: "section" | "state" | "interaction" | "richness";
    check: string;
    description: string;
    severity: "error" | "warning";
}
export interface CompositionValidatorResult {
    verdict: "PASS" | "PASS_WITH_CONCERNS" | "FAIL";
    score: number;
    violations: CompositionViolation[];
    stats: {
        patterns_checked: number;
        sections_found: number;
        sections_required: number;
        states_found: number;
        states_required: number;
        interactions_found: number;
        interactions_required: number;
        richness_passed: number;
        richness_total: number;
    };
}
export declare function validateComposition(files: {
    path: string;
    content: string;
}[], featureNames: string[]): CompositionValidatorResult;
