import type { FixPattern } from "../types/fix-pattern.js";
import type { PreventionRule } from "../types/prevention-rule.js";

export interface PromotionCandidate {
  fix: FixPattern;
  eligible: boolean;
  reasons: string[];
  suggested_rule: PreventionRule | null;
}

/**
 * Determines whether a fix pattern has been applied enough times with
 * sufficient success to become a prevention rule.
 *
 * Thresholds:
 * - times_applied >= 3
 * - success_rate >= 0.75
 *
 * Assigns the prevention gate based on the fix's resolution_action:
 * - spec/scope fixes -> gate_1 (spec review)
 * - bridge/template fixes -> gate_2 (bridge review)
 * - test/fallback fixes -> gate_3 (build review)
 * - rollback -> gate_4 (validation)
 */
export function evaluateFixForPromotion(fix: FixPattern): PromotionCandidate {
  const reasons: string[] = [];
  let eligible = true;

  if (fix.times_applied < 3) {
    eligible = false;
    reasons.push(`Insufficient applications: ${fix.times_applied}/3`);
  } else {
    reasons.push(`Applied ${fix.times_applied} times (threshold: 3)`);
  }

  if (fix.success_rate < 0.75) {
    eligible = false;
    reasons.push(`Success rate too low: ${(fix.success_rate * 100).toFixed(0)}%/75%`);
  } else {
    reasons.push(`Success rate: ${(fix.success_rate * 100).toFixed(0)}% (threshold: 75%)`);
  }

  if (!eligible) {
    return { fix, eligible, reasons, suggested_rule: null };
  }

  const gate = mapActionToGate(fix.resolution_action);
  const ruleId = `pr-auto-${fix.pattern_id}`;

  const suggested_rule: PreventionRule = {
    rule_id: ruleId,
    name: `Prevent: ${fix.name}`,
    description: `Auto-promoted from fix "${fix.name}" after ${fix.times_applied} successful applications (${(fix.success_rate * 100).toFixed(0)}% success rate). Checks for the condition that "${fix.description}" addresses.`,
    target_failure_patterns: fix.target_failure_patterns,
    gate,
    check_logic: `// Auto-generated check from fix template:\n// Action: ${fix.resolution_action}\n// Template: ${fix.resolution_template}\n// Verify that the fix condition is already satisfied before build proceeds.`,
    added_after_incident: undefined,
  };

  return { fix, eligible, reasons, suggested_rule };
}

function mapActionToGate(action: FixPattern["resolution_action"]): PreventionRule["gate"] {
  switch (action) {
    case "update_spec":
    case "narrow_scope":
      return "gate_1";
    case "patch_bridge":
    case "fix_template":
      return "gate_2";
    case "replace_reuse_candidate":
    case "add_fallback":
    case "add_offline_state":
    case "add_test":
    case "add_rule":
      return "gate_3";
    case "rollback_change":
      return "gate_4";
    default:
      return "gate_3";
  }
}

/**
 * Batch-evaluate all fix patterns for promotion eligibility.
 */
export function findPromotableFixes(fixes: FixPattern[]): PromotionCandidate[] {
  return fixes
    .map(evaluateFixForPromotion)
    .filter((c) => c.eligible);
}
