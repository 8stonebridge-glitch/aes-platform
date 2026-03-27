// Types
export { FailurePatternSchema, type FailurePattern } from "./types/failure-pattern.js";
export { FixPatternSchema, type FixPattern } from "./types/fix-pattern.js";
export { PreventionRuleSchema, type PreventionRule } from "./types/prevention-rule.js";
export { ValidatorHeuristicSchema, type ValidatorHeuristic } from "./types/validator-heuristic.js";
export { IncidentExampleSchema, type IncidentExample } from "./types/incident-example.js";

// Matching
export { findSimilarPatterns, type SimilarityMatch } from "./matching/similarity-matcher.js";
export { suggestFixes, type FixSuggestion } from "./matching/fix-suggester.js";

// Promotion
export {
  evaluateFixForPromotion,
  findPromotableFixes,
  type PromotionCandidate,
} from "./promotion/fix-to-prevention.js";
export {
  evaluateRuleForPromotion,
  findPromotableRules,
  type HeuristicCandidate,
} from "./promotion/prevention-to-heuristic.js";
export {
  linkIncident,
  updatePatternFromIncident,
  recordFixApplication,
  type IncidentLink,
} from "./promotion/incident-linker.js";

// Seeds
export { FAILURE_PATTERN_SEEDS } from "./seed/failure-patterns.seed.js";
export { FIX_PATTERN_SEEDS } from "./seed/fix-patterns.seed.js";
export { PREVENTION_RULE_SEEDS } from "./seed/prevention-rules.seed.js";
export { VALIDATOR_HEURISTIC_SEEDS } from "./seed/validator-heuristics.seed.js";
