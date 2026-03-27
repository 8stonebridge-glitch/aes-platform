// ─── AES v12 Contracts ────────────────────────────────────────────────
// Canonical typed contracts for the AES governed software factory.
// Every artifact, gate, and state machine in AES is defined here.

// Enums
export * from "./enums.js";

// Gate 0 — Intent Disambiguation
export {
  IntentBriefSchema,
  type IntentBrief,
  canProceedToDecomposition,
  buildConfirmationPrompt,
} from "./intent-brief.js";

// Gate 1 — AppSpec / Decomposition
export {
  AppSpecSchema,
  type AppSpec,
  AppActorSchema,
  type AppActor,
  DomainEntitySchema,
  type DomainEntity,
  EntityFieldSchema,
  type EntityField,
  RoleSchema,
  type Role,
  PermissionSchema,
  type Permission,
  DestructiveActionSchema,
  type DestructiveAction,
  FeatureSchema,
  type Feature,
  WorkflowSchema,
  type Workflow,
  WorkflowStepSchema,
  type WorkflowStep,
  IntegrationSchema,
  type Integration,
  NonFunctionalRequirementSchema,
  type NonFunctionalRequirement,
  ComplianceRequirementSchema,
  type ComplianceRequirement,
  DesignConstraintSchema,
  type DesignConstraint,
  AcceptanceTestSchema,
  type AcceptanceTest,
  DependencyEdgeSchema,
  type DependencyEdge,
  RiskSchema,
  type Risk,
  ConfidenceSchema,
  type Confidence,
} from "./app-spec.js";

// Gate 2 — FeatureBridge
export {
  FeatureBridgeSchema,
  type FeatureBridge,
  BuildScopeSchema,
  type BuildScope,
  ReadScopeSchema,
  type ReadScope,
  WriteScopeSchema,
  type WriteScope,
  ReuseCandidateSchema,
  type ReuseCandidate,
  AppliedRuleSchema,
  type AppliedRule,
  RequiredTestSchema,
  type RequiredTest,
  BridgeDependencySchema,
  type BridgeDependency,
  HardVetoTriggerSchema,
  type HardVetoTrigger,
  SuccessDefinitionSchema,
  type SuccessDefinition,
  ConfidenceBreakdownSchema,
  type ConfidenceBreakdown,
} from "./feature-bridge.js";

// Gate 3 — Hard Vetoes
export {
  HardVetoSchema,
  type HardVeto,
  VetoEvaluationResultSchema,
  type VetoEvaluationResult,
  hasTriggeredVetoes,
  getTriggeredVetoes,
  getTriggeredVetoCodes,
} from "./hard-veto.js";

// Gate 4 — Catalog Admission
export {
  CatalogCandidateSchema,
  type CatalogCandidate,
  CatalogAdmissionResultSchema,
  type CatalogAdmissionResult,
  evaluateCatalogAdmission,
} from "./catalog-admission.js";

// Gate 5 — FixTrail
export { FixTrailSchema, type FixTrail } from "./fix-trail.js";

// Gate Rules & Validation
export {
  GateRuleResultSchema,
  type GateRuleResult,
  GATE_1_RULES,
  type Gate1RuleCode,
  GATE_2_RULES,
  type Gate2RuleCode,
  validateAppSpec,
  validateBridge,
  allRulesPassed,
  getFailedRules,
} from "./gate-rules.js";

// State Machines
export {
  TransitionSchema,
  type Transition,
  APP_PLAN_TRANSITIONS,
  BRIDGE_TRANSITIONS,
  isValidAppPlanTransition,
  isValidBridgeTransition,
  getValidAppPlanNextStates,
  getValidBridgeNextStates,
} from "./state-machines.js";
