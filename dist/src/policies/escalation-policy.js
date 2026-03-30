export const escalationPolicy = {
    rules: [
        { condition: "veto_triggered", action: "block", timeout_ms: 0 },
        { condition: "confidence_below_floor", action: "escalate", timeout_ms: 300000 },
        { condition: "auth_ambiguity", action: "block", timeout_ms: 0 },
        { condition: "destructive_action_unconfirmed", action: "block", timeout_ms: 0 },
        { condition: "dependency_conflict", action: "escalate", timeout_ms: 300000 },
        { condition: "build_timeout", action: "warn", timeout_ms: 600000 },
        { condition: "validator_failure_rate_high", action: "escalate", timeout_ms: 300000 },
        { condition: "cross_feature_conflict", action: "block", timeout_ms: 0 },
    ],
    defaultTimeout: 300000,
    maxEscalationAge: 86400000, // 24 hours
};
export function shouldEscalate(condition) {
    return escalationPolicy.rules.find(r => r.condition === condition) ?? null;
}
export function isHardBlock(condition) {
    const rule = shouldEscalate(condition);
    return rule?.action === "block";
}
