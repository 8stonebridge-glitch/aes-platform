import { z } from "zod";
export declare const ConfidenceDimensionSchema: z.ZodObject<{
    evidence_coverage: z.ZodNumber;
    dependency_completeness: z.ZodNumber;
    pattern_match_quality: z.ZodNumber;
    test_coverage: z.ZodNumber;
    freshness: z.ZodNumber;
    contradiction_penalty: z.ZodNumber;
}, z.core.$strip>;
export type ConfidenceDimensions = z.infer<typeof ConfidenceDimensionSchema>;
export declare const CONFIDENCE_WEIGHTS: {
    readonly evidence_coverage: 0.2;
    readonly dependency_completeness: 0.2;
    readonly pattern_match_quality: 0.15;
    readonly test_coverage: 0.2;
    readonly freshness: 0.1;
    readonly contradiction_penalty: 0.15;
};
export declare const CONFIDENCE_THRESHOLDS: {
    readonly promotion_minimum: 0.7;
    readonly bridge_approval_minimum: 0.65;
    readonly auto_approve_minimum: 0.85;
    readonly warning_below: 0.5;
    readonly block_below: 0.3;
};
export interface ConfidenceResult {
    composite: number;
    dimensions: ConfidenceDimensions;
    weights_used: typeof CONFIDENCE_WEIGHTS;
    meets_promotion: boolean;
    meets_bridge_approval: boolean;
    meets_auto_approve: boolean;
    warnings: string[];
    blockers: string[];
}
export declare function computeConfidence(dimensions: ConfidenceDimensions): ConfidenceResult;
export declare function computeEvidenceCoverage(params: {
    total_claims: number;
    evidenced_claims: number;
    source_count: number;
    min_sources: number;
}): number;
export declare function computeDependencyCompleteness(params: {
    total_dependencies: number;
    resolved_dependencies: number;
    blocked_dependencies: number;
}): number;
export declare function computeFreshness(params: {
    artifact_created_at: Date;
    evidence_max_age_days: number;
    now?: Date;
}): number;
export declare function computeTestCoverage(params: {
    required_tests: number;
    passing_tests: number;
    failing_tests: number;
    missing_tests: number;
}): number;
export declare function computeContradictionPenalty(params: {
    contradictions: {
        severity: "low" | "medium" | "high" | "critical";
    }[];
}): number;
