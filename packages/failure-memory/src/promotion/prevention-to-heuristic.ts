import type { PreventionRule } from "../types/prevention-rule.js";
import type { ValidatorHeuristic } from "../types/validator-heuristic.js";
import type { IncidentExample } from "../types/incident-example.js";

export interface HeuristicCandidate {
  rule: PreventionRule;
  eligible: boolean;
  reasons: string[];
  suggested_heuristic: ValidatorHeuristic | null;
}

/**
 * Determines whether a prevention rule should be promoted to a validator heuristic.
 *
 * A prevention rule becomes a heuristic when:
 * - It has been linked to 2+ resolved incidents (proving real-world value)
 * - The pattern it targets has appeared at least 3 times
 *
 * Assigns validator tier based on the gate:
 * - gate_0, gate_1 -> tier_a (critical, blocks build)
 * - gate_2, gate_3 -> tier_b (important, warns loudly)
 * - gate_4, gate_5 -> tier_c (advisory, reports only)
 */
export function evaluateRuleForPromotion(
  rule: PreventionRule,
  incidents: IncidentExample[]
): HeuristicCandidate {
  const reasons: string[] = [];
  let eligible = true;

  const linkedIncidents = incidents.filter(
    (inc) => inc.led_to_prevention_rule === rule.rule_id ||
             rule.target_failure_patterns.includes(inc.failure_pattern_id)
  );

  const resolvedLinkedIncidents = linkedIncidents.filter((inc) => inc.resolved_at);

  if (resolvedLinkedIncidents.length < 2) {
    eligible = false;
    reasons.push(`Insufficient resolved incidents: ${resolvedLinkedIncidents.length}/2`);
  } else {
    reasons.push(`Linked to ${resolvedLinkedIncidents.length} resolved incidents (threshold: 2)`);
  }

  const totalOccurrences = linkedIncidents.length;
  if (totalOccurrences < 3) {
    eligible = false;
    reasons.push(`Insufficient total occurrences: ${totalOccurrences}/3`);
  } else {
    reasons.push(`${totalOccurrences} total occurrences (threshold: 3)`);
  }

  if (!eligible) {
    return { rule, eligible, reasons, suggested_heuristic: null };
  }

  const tier = mapGateToTier(rule.gate);
  const heuristicId = `vh-auto-${rule.rule_id}`;

  const suggested_heuristic: ValidatorHeuristic = {
    heuristic_id: heuristicId,
    name: `Detect: ${rule.name}`,
    description: `Auto-promoted from prevention rule "${rule.name}". Validated by ${resolvedLinkedIncidents.length} resolved incidents across ${totalOccurrences} occurrences.`,
    target_failure_patterns: rule.target_failure_patterns,
    validator_tier: tier,
    detection_logic: `// Auto-generated detection from prevention rule:\n// Gate: ${rule.gate}\n// Check: ${rule.check_logic}\n// Scan build output for conditions matching the prevention check.`,
    false_positive_rate: 0,
  };

  return { rule, eligible, reasons, suggested_heuristic };
}

function mapGateToTier(gate: PreventionRule["gate"]): ValidatorHeuristic["validator_tier"] {
  switch (gate) {
    case "gate_0":
    case "gate_1":
      return "tier_a";
    case "gate_2":
    case "gate_3":
      return "tier_b";
    case "gate_4":
    case "gate_5":
      return "tier_c";
    default:
      return "tier_b";
  }
}

/**
 * Batch-evaluate all prevention rules for heuristic promotion.
 */
export function findPromotableRules(
  rules: PreventionRule[],
  incidents: IncidentExample[]
): HeuristicCandidate[] {
  return rules
    .map((rule) => evaluateRuleForPromotion(rule, incidents))
    .filter((c) => c.eligible);
}
