import { z } from "zod";

export const GateThreshold = z.object({
  min_overall: z.number().min(0).max(1),
});

export const CONFIDENCE_THRESHOLDS = {
  gate_0_auto_confirm: {
    min_overall: 0.8,
    requires_zero_ambiguity_flags: true,
    requires_low_risk: true,
    description: "Intent can be auto-confirmed without user interaction if confidence is high and no ambiguity flags are present",
  },
  gate_1_spec_pass: {
    min_overall: 0.7,
    min_intent_clarity: 0.8,
    min_scope_completeness: 0.6,
    min_dependency_clarity: 0.7,
    description: "AppSpec passes validation when intent is clear, scope is reasonably complete, and dependencies are identified",
  },
  gate_2_bridge_pass: {
    min_overall: 0.7,
    min_scope_clarity: 0.8,
    min_reuse_fit: 0.5,
    min_rule_coverage: 0.7,
    min_test_coverage: 0.6,
    description: "Bridge compilation passes when scope is clear, reuse candidates are identified, and rules and tests cover the feature surface",
  },
  gate_3_veto_clear: {
    min_overall: 0.9,
    requires_zero_critical_vetoes: true,
    requires_zero_blocking_vetoes: true,
    max_high_vetoes: 0,
    description: "Hard veto gate requires near-perfect confidence and zero unresolved critical or blocking vetoes",
  },
  gate_4_catalog_admission: {
    min_overall: 0.8,
    min_build_completeness: 0.9,
    min_test_pass_rate: 0.95,
    min_validator_pass_rate: 0.9,
    description: "Catalog admission requires high build completeness, near-total test pass rate, and strong validator coverage",
  },
  gate_5_fix_trail: {
    min_overall: 0.7,
    min_fix_specificity: 0.8,
    min_regression_safety: 0.9,
    description: "FixTrail recording requires specific fix targeting and high regression safety confidence",
  },
} as const;

export type GateName = keyof typeof CONFIDENCE_THRESHOLDS;

export function thresholdForGate(gate: GateName) {
  return CONFIDENCE_THRESHOLDS[gate];
}

export function meetsThreshold(gate: GateName, scores: Record<string, number>): { pass: boolean; failures: string[] } {
  const threshold = CONFIDENCE_THRESHOLDS[gate];
  const failures: string[] = [];

  for (const [key, value] of Object.entries(threshold)) {
    if (typeof value === "number" && key.startsWith("min_")) {
      const score = scores[key.replace("min_", "")];
      if (score === undefined || score < value) {
        failures.push(`${key}: required ${value}, got ${score ?? "missing"}`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}
