import { z } from "zod";

export const ValidatorId = z.enum([
  "type_check",
  "permission",
  "rule_coverage",
  "scope",
  "test_presence",
  "hard_veto",
  "workflow_integrity",
  "responsive_ui",
  "offline_reconnect",
  "audit_trail",
  "external_api_fallback",
  "e2e_journey",
  "regression",
  "deployment_readiness",
  "cross_feature_integrity",
  "pii_compliance",
  "idempotency_check",
  "tenant_isolation",
]);
export type ValidatorId = z.infer<typeof ValidatorId>;

export const VALIDATOR_ROUTING = {
  tier_a: {
    always_run: true,
    description: "Core validators that run on every feature regardless of type or risk",
    validators: [
      "type_check",
      "permission",
      "rule_coverage",
      "scope",
      "test_presence",
      "hard_veto",
    ] as const,
  },
  tier_b: {
    description: "Conditional validators triggered by feature properties",
    conditions: {
      workflow_integrity: {
        when: "feature has workflows",
        check: (feature: FeatureProperties) => feature.has_workflows === true,
      },
      responsive_ui: {
        when: "feature has frontend surfaces",
        check: (feature: FeatureProperties) => feature.has_frontend_surfaces === true,
      },
      offline_reconnect: {
        when: "feature.offline_behavior_required === true",
        check: (feature: FeatureProperties) => feature.offline_behavior_required === true,
      },
      audit_trail: {
        when: "feature.audit_required === true",
        check: (feature: FeatureProperties) => feature.audit_required === true,
      },
      external_api_fallback: {
        when: "feature.external_dependencies.length > 0",
        check: (feature: FeatureProperties) => (feature.external_dependencies?.length ?? 0) > 0,
      },
      pii_compliance: {
        when: "feature.handles_pii === true",
        check: (feature: FeatureProperties) => feature.handles_pii === true,
      },
      idempotency_check: {
        when: "feature.financial_transactions === true",
        check: (feature: FeatureProperties) => feature.financial_transactions === true,
      },
      tenant_isolation: {
        when: "feature.multi_tenant === true",
        check: (feature: FeatureProperties) => feature.multi_tenant === true,
      },
    },
  },
  tier_c: {
    when: "all features built, pre-deployment",
    description: "System-level validators that run after all features are built",
    validators: [
      "e2e_journey",
      "regression",
      "deployment_readiness",
      "cross_feature_integrity",
    ] as const,
  },
} as const;

export interface FeatureProperties {
  has_workflows?: boolean;
  has_frontend_surfaces?: boolean;
  offline_behavior_required?: boolean;
  audit_required?: boolean;
  external_dependencies?: string[];
  handles_pii?: boolean;
  financial_transactions?: boolean;
  multi_tenant?: boolean;
}

export function resolveValidators(feature: FeatureProperties, phase: "build" | "deploy"): ValidatorId[] {
  const validators: ValidatorId[] = [...VALIDATOR_ROUTING.tier_a.validators];

  for (const [validatorName, condition] of Object.entries(VALIDATOR_ROUTING.tier_b.conditions)) {
    if (condition.check(feature)) {
      validators.push(validatorName as ValidatorId);
    }
  }

  if (phase === "deploy") {
    validators.push(...VALIDATOR_ROUTING.tier_c.validators);
  }

  return [...new Set(validators)];
}
