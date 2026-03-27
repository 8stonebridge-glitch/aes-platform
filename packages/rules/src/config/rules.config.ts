/**
 * Central configuration that loads and re-exports all gate rules and policies.
 */

import { GATE_0_RULES, evaluateGate0, type IntentInput, type Gate0Result } from "../gate-rules/gate-0-rules.js";
import { GATE_1_RULES, evaluateGate1, type AppSpec, type Gate1Result } from "../gate-rules/gate-1-rules.js";
import { GATE_2_RULES, evaluateGate2, type BridgeCompilation, type Gate2Result } from "../gate-rules/gate-2-rules.js";
import { evaluateGate3, type VetoContext, type Gate3Result } from "../gate-rules/gate-3-rules.js";
import { evaluateGate4, type BuildArtifact, type Gate4Result } from "../gate-rules/gate-4-rules.js";
import { GATE_5_RULES, evaluateGate5, type FixEntry, type Gate5Result } from "../gate-rules/gate-5-rules.js";

import { VETO_REGISTRY } from "../policies/veto-registry.js";
import { CONFIDENCE_THRESHOLDS } from "../policies/confidence-thresholds.js";
import { VALIDATOR_ROUTING, resolveValidators } from "../policies/validator-routing-policy.js";
import { CATALOG_ADMISSION_CHECKLIST, evaluateAdmission } from "../policies/catalog-admission-policy.js";
import { ESCALATION_POLICY, resolveEscalation } from "../policies/escalation-policy.js";
import { APP_CLASS_ROUTING, routingForClass, riskForClass } from "../policies/app-class-routing.js";

export const RULES_VERSION = "12.0.0";

export const GATE_EVALUATORS = {
  gate_0: evaluateGate0,
  gate_1: evaluateGate1,
  gate_2: evaluateGate2,
  gate_3: evaluateGate3,
  gate_4: evaluateGate4,
  gate_5: evaluateGate5,
} as const;

export const GATE_RULE_SETS = {
  gate_0: GATE_0_RULES,
  gate_1: GATE_1_RULES,
  gate_2: GATE_2_RULES,
  gate_5: GATE_5_RULES,
} as const;

export const POLICIES = {
  vetoes: VETO_REGISTRY,
  confidence: CONFIDENCE_THRESHOLDS,
  validators: VALIDATOR_ROUTING,
  admission: CATALOG_ADMISSION_CHECKLIST,
  escalation: ESCALATION_POLICY,
  appClassRouting: APP_CLASS_ROUTING,
} as const;

export const POLICY_FUNCTIONS = {
  resolveValidators,
  evaluateAdmission,
  resolveEscalation,
  routingForClass,
  riskForClass,
} as const;

export type {
  IntentInput,
  Gate0Result,
  AppSpec,
  Gate1Result,
  BridgeCompilation,
  Gate2Result,
  VetoContext,
  Gate3Result,
  BuildArtifact,
  Gate4Result,
  FixEntry,
  Gate5Result,
};
