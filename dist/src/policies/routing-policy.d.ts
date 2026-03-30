/**
 * Routing Policy — conditional routing logic between graph nodes.
 */
export declare const routingPolicy: {
    /** Skip research if rawRequest is under this word count */
    skipResearchBelowWords: number;
    /** Auto-confirm intent if these conditions are all met */
    autoConfirmConditions: {
        maxAmbiguityFlags: number;
        riskClass: "low";
    };
    /** Max spec validation retries before failing */
    maxSpecRetries: number;
    /** Skip catalog search if no features decomposed */
    requireFeaturesForCatalog: boolean;
    /** Allow parallel feature builds when feature count exceeds this */
    parallelBuildThreshold: number;
    /** Skip deployment if build has failures */
    skipDeployOnFailure: boolean;
};
export declare function shouldSkipResearch(wordCount: number): boolean;
export declare function shouldAutoConfirm(ambiguityFlags: number, riskClass: string): boolean;
export declare function shouldParallelBuild(featureCount: number): boolean;
