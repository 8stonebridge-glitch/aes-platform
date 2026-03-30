/**
 * Routing Policy — conditional routing logic between graph nodes.
 */
export const routingPolicy = {
    /** Skip research if rawRequest is under this word count */
    skipResearchBelowWords: 3,
    /** Auto-confirm intent if these conditions are all met */
    autoConfirmConditions: {
        maxAmbiguityFlags: 0,
        riskClass: "low",
    },
    /** Max spec validation retries before failing */
    maxSpecRetries: 3,
    /** Skip catalog search if no features decomposed */
    requireFeaturesForCatalog: true,
    /** Allow parallel feature builds when feature count exceeds this */
    parallelBuildThreshold: 3,
    /** Skip deployment if build has failures */
    skipDeployOnFailure: true,
};
export function shouldSkipResearch(wordCount) {
    return wordCount < routingPolicy.skipResearchBelowWords;
}
export function shouldAutoConfirm(ambiguityFlags, riskClass) {
    return ambiguityFlags <= routingPolicy.autoConfirmConditions.maxAmbiguityFlags
        && riskClass === routingPolicy.autoConfirmConditions.riskClass;
}
export function shouldParallelBuild(featureCount) {
    return featureCount >= routingPolicy.parallelBuildThreshold;
}
