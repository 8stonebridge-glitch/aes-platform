/**
 * Escalation Policy — when to escalate to human operator.
 */
export interface EscalationRule {
  condition: string;
  action: "block" | "warn" | "escalate";
  timeout_ms: number;
}

export const escalationPolicy = {
  rules: [
    { condition: "veto_triggered", action: "block" as const, timeout_ms: 0 },
    { condition: "confidence_below_floor", action: "escalate" as const, timeout_ms: 300000 },
    { condition: "auth_ambiguity", action: "block" as const, timeout_ms: 0 },
    { condition: "destructive_action_unconfirmed", action: "block" as const, timeout_ms: 0 },
    { condition: "dependency_conflict", action: "escalate" as const, timeout_ms: 300000 },
    { condition: "build_timeout", action: "warn" as const, timeout_ms: 600000 },
    { condition: "validator_failure_rate_high", action: "escalate" as const, timeout_ms: 300000 },
    { condition: "cross_feature_conflict", action: "block" as const, timeout_ms: 0 },
  ] as EscalationRule[],

  defaultTimeout: 300000,
  maxEscalationAge: 86400000, // 24 hours
};

export function shouldEscalate(condition: string): EscalationRule | null {
  return escalationPolicy.rules.find(r => r.condition === condition) ?? null;
}

export function isHardBlock(condition: string): boolean {
  const rule = shouldEscalate(condition);
  return rule?.action === "block";
}
