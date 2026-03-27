/**
 * @aes/rules - Validation and policy rules for AES v12
 *
 * This package provides the complete rule set for all six AES gates,
 * plus policy registries for vetoes, confidence thresholds, validator routing,
 * catalog admission, escalation handling, and app class routing.
 */

// Gate rule evaluators
export { evaluateGate0, GATE_0_RULES, IntentInput, Gate0Result } from "./gate-rules/gate-0-rules.js";
export { evaluateGate1, GATE_1_RULES, AppSpec, FeatureSpec, Gate1Result } from "./gate-rules/gate-1-rules.js";
export { evaluateGate2, GATE_2_RULES, BridgeCompilation, BridgeAsset, BridgeRule, Gate2Result } from "./gate-rules/gate-2-rules.js";
export { evaluateGate3, VetoContext, VetoCheckResult, Gate3Result } from "./gate-rules/gate-3-rules.js";
export { evaluateGate4, BuildArtifact, Gate4Result } from "./gate-rules/gate-4-rules.js";
export { evaluateGate5, GATE_5_RULES, FixEntry, Gate5Result } from "./gate-rules/gate-5-rules.js";

// Policy registries
export { VETO_REGISTRY, findVeto, vetosForGate, criticalVetos, VetoEntry, VetoSeverity } from "./policies/veto-registry.js";
export { CONFIDENCE_THRESHOLDS, thresholdForGate, meetsThreshold, GateName } from "./policies/confidence-thresholds.js";
export { VALIDATOR_ROUTING, resolveValidators, ValidatorId, FeatureProperties } from "./policies/validator-routing-policy.js";
export { CATALOG_ADMISSION_CHECKLIST, evaluateAdmission, AdmissionCheckId, AdmissionResult } from "./policies/catalog-admission-policy.js";
export { ESCALATION_POLICY, resolveEscalation, EscalationAction, EscalationContext } from "./policies/escalation-policy.js";
export { APP_CLASS_ROUTING, routingForClass, riskForClass, validatorEmphasisForClass, AppClass, RiskLevel } from "./policies/app-class-routing.js";

// Central config
export { RULES_VERSION, GATE_EVALUATORS, GATE_RULE_SETS, POLICIES, POLICY_FUNCTIONS } from "./config/rules.config.js";
