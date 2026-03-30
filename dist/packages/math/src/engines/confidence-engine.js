import { z } from "zod";
export const ConfidenceDimensionSchema = z.object({
    evidence_coverage: z.number().min(0).max(1),
    dependency_completeness: z.number().min(0).max(1),
    pattern_match_quality: z.number().min(0).max(1),
    test_coverage: z.number().min(0).max(1),
    freshness: z.number().min(0).max(1),
    contradiction_penalty: z.number().min(0).max(1), // 1.0 = no contradictions, 0.0 = severe
});
export const CONFIDENCE_WEIGHTS = {
    evidence_coverage: 0.20,
    dependency_completeness: 0.20,
    pattern_match_quality: 0.15,
    test_coverage: 0.20,
    freshness: 0.10,
    contradiction_penalty: 0.15,
};
export const CONFIDENCE_THRESHOLDS = {
    promotion_minimum: 0.70,
    bridge_approval_minimum: 0.65,
    auto_approve_minimum: 0.85,
    warning_below: 0.50,
    block_below: 0.30,
};
export function computeConfidence(dimensions) {
    // Validate
    ConfidenceDimensionSchema.parse(dimensions);
    // Weighted average
    let composite = 0;
    for (const [key, weight] of Object.entries(CONFIDENCE_WEIGHTS)) {
        composite += dimensions[key] * weight;
    }
    composite = Math.round(composite * 1000) / 1000; // 3 decimal places
    const warnings = [];
    const blockers = [];
    // Check individual dimensions
    for (const [key, value] of Object.entries(dimensions)) {
        if (value < CONFIDENCE_THRESHOLDS.block_below) {
            blockers.push(`${key} is critically low (${value})`);
        }
        else if (value < CONFIDENCE_THRESHOLDS.warning_below) {
            warnings.push(`${key} is below warning threshold (${value})`);
        }
    }
    // Hard block if any dimension is zero
    for (const [key, value] of Object.entries(dimensions)) {
        if (value === 0) {
            blockers.push(`${key} is zero — cannot proceed`);
        }
    }
    return {
        composite,
        dimensions,
        weights_used: CONFIDENCE_WEIGHTS,
        meets_promotion: composite >= CONFIDENCE_THRESHOLDS.promotion_minimum && blockers.length === 0,
        meets_bridge_approval: composite >= CONFIDENCE_THRESHOLDS.bridge_approval_minimum && blockers.length === 0,
        meets_auto_approve: composite >= CONFIDENCE_THRESHOLDS.auto_approve_minimum && blockers.length === 0,
        warnings,
        blockers,
    };
}
// Compute evidence coverage from counts
export function computeEvidenceCoverage(params) {
    if (params.total_claims === 0)
        return 0;
    const claimRatio = params.evidenced_claims / params.total_claims;
    const sourceRatio = Math.min(params.source_count / Math.max(params.min_sources, 1), 1);
    return Math.round((claimRatio * 0.7 + sourceRatio * 0.3) * 1000) / 1000;
}
// Compute dependency completeness from graph
export function computeDependencyCompleteness(params) {
    if (params.total_dependencies === 0)
        return 1.0;
    if (params.blocked_dependencies > 0)
        return 0;
    return Math.round((params.resolved_dependencies / params.total_dependencies) * 1000) / 1000;
}
// Compute freshness from timestamps
export function computeFreshness(params) {
    const now = params.now || new Date();
    const ageMs = now.getTime() - params.artifact_created_at.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 0)
        return 1.0;
    if (ageDays >= params.evidence_max_age_days)
        return 0;
    return Math.round((1 - ageDays / params.evidence_max_age_days) * 1000) / 1000;
}
// Compute test coverage
export function computeTestCoverage(params) {
    if (params.required_tests === 0)
        return 1.0;
    if (params.failing_tests > 0)
        return Math.max(0, (params.passing_tests - params.failing_tests) / params.required_tests);
    return Math.round((params.passing_tests / params.required_tests) * 1000) / 1000;
}
// Compute contradiction penalty
export function computeContradictionPenalty(params) {
    if (params.contradictions.length === 0)
        return 1.0;
    const penalties = { low: 0.05, medium: 0.15, high: 0.30, critical: 1.0 };
    let totalPenalty = 0;
    for (const c of params.contradictions) {
        totalPenalty += penalties[c.severity];
    }
    return Math.max(0, Math.round((1 - totalPenalty) * 1000) / 1000);
}
