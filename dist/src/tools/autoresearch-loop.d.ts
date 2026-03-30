/**
 * autoresearch-loop.ts — Autonomous self-improvement loop for the graph reasoner.
 *
 * Inspired by Karpathy's autoresearch: propose → run → measure → keep/discard.
 *
 * The loop:
 *   1. Load current tunable parameters
 *   2. Propose a mutation (random tweak to one or more params)
 *   3. Run the benchmark suite with the mutated params
 *   4. Compute a composite score
 *   5. If score improved → keep the mutation, commit to git
 *   6. If score worsened → discard, revert
 *   7. Repeat
 *
 * Usage:
 *   npx tsx src/tools/autoresearch-loop.ts                    # run 1 iteration
 *   npx tsx src/tools/autoresearch-loop.ts --loops 50         # run 50 iterations
 *   npx tsx src/tools/autoresearch-loop.ts --loops 100 --tag mar26   # overnight run
 *   npx tsx src/tools/autoresearch-loop.ts --benchmark        # just run benchmark, no mutation
 *   npx tsx src/tools/autoresearch-loop.ts --show-params      # show current params
 */
export interface ReasonerParams {
    beamWidth: number;
    maxHops: number;
    hungerFeatures: number;
    hungerModels: number;
    hungerIntegrations: number;
    hungerPatterns: number;
    hungerFlows: number;
    hungerApps: number;
    hungerBonusFeature: number;
    hungerBonusModel: number;
    hungerBonusIntegration: number;
    hungerBonusPattern: number;
    hungerBonusFlow: number;
    hungerBonusApp: number;
    keywordMatchBonus: number;
    modelStructuralBonus: number;
    patternStructuralBonus: number;
    flowStructuralBonus: number;
    complexityBonus: number;
    sameCategoryPenalty: number;
    vectorBoostMultiplier: number;
    synonymCoOccurrenceMin: number;
    synonymMinLength: number;
    synonymMaxPerKeyword: number;
    rrfK: number;
    dualSourceBoost: number;
    maxSeeds: number;
    maxAppSeeds: number;
    universalPatternPercent: number;
}
export declare const DEFAULT_PARAMS: ReasonerParams;
