// Engines
export {
  computeConfidence,
  computeEvidenceCoverage,
  computeDependencyCompleteness,
  computeFreshness,
  computeTestCoverage,
  computeContradictionPenalty,
  ConfidenceDimensionSchema,
  CONFIDENCE_WEIGHTS,
  CONFIDENCE_THRESHOLDS,
  type ConfidenceDimensions,
  type ConfidenceResult,
} from "./engines/confidence-engine.js";

export {
  evaluateVetoes,
  VetoCodeSchema,
  type VetoCode,
  type VetoInput,
  type VetoResult,
  type VetoEvaluation,
} from "./engines/veto-engine.js";

export {
  analyzeDependencies,
  type DependencyNode,
  type DependencyChain,
  type ImpactRadius,
  type DependencyAnalysis,
} from "./engines/dependency-engine.js";

export {
  analyzeScopeDrift,
  type ScopeDefinition,
  type ActualChanges,
  type ScopeDriftViolation,
  type ScopeDriftResult,
} from "./engines/scope-drift-engine.js";

export {
  rankPriorities,
  PRIORITY_WEIGHTS,
  type PriorityCandidate,
  type PriorityResult,
} from "./engines/priority-engine.js";

// State machine
export {
  ARTIFACT_STATES,
  type ArtifactState,
} from "./state/artifact-states.js";

export {
  canTransition,
  TRANSITION_RULES,
  type TransitionRule,
  type TransitionPrerequisite,
} from "./state/transition-rules.js";

// Bridge
export {
  type BridgeMathFields,
} from "./bridge/math-fields.js";

export {
  enrichBridgeWithMath,
} from "./bridge/bridge-enricher.js";

// Validators
export {
  runAllValidators,
  runValidator,
  type ValidatorInput,
  type ValidatorOutput,
  type AggregatedValidation,
} from "./validators/validator-runner.js";

export { validateStructure } from "./validators/structure-validator.js";
export { validateDependencyIntegrity } from "./validators/dependency-integrity-validator.js";
export { validateScopeCompliance } from "./validators/scope-compliance-validator.js";
export { validateInterfaceCoverage } from "./validators/interface-coverage-validator.js";
export { validateRuleCompliance } from "./validators/rule-compliance-validator.js";
export { validateTestMapping } from "./validators/test-mapping-validator.js";

// Persistence
export {
  type MathEvaluationRecord,
} from "./persistence/types.js";

export {
  ScoreRecorder,
} from "./persistence/score-recorder.js";
