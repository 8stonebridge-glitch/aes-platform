import { z } from "zod";

export const EscalationAction = z.enum([
  "continue_without",
  "block_bridge",
  "re_query_and_retry",
  "replace_and_recompile",
  "block_and_push_upstream",
  "escalate_to_user",
  "abort",
]);
export type EscalationAction = z.infer<typeof EscalationAction>;

export const ESCALATION_POLICY = {
  gate_0: {
    max_disambiguation_attempts: 2,
    escalate_to_user_after: 2,
    block_after: 3,
    description: "Intent disambiguation allows two auto-attempts before asking the user",
  },
  gate_1: {
    max_self_repair_attempts: 2,
    max_scoped_clarifications: 1,
    escalate_to_user_after: 3,
    block_after: 4,
    description: "Spec validation allows two self-repair attempts and one scoped clarification before escalating",
  },
  gate_2: {
    missing_reuse: "continue_without" as const,
    unresolved_dependency: "block_bridge" as const,
    rule_attachment_incomplete: "re_query_and_retry" as const,
    asset_incompatible: "replace_and_recompile" as const,
    triggered_veto: "block_and_push_upstream" as const,
    description: "Bridge compilation has specific actions per failure type rather than a generic retry loop",
  },
  gate_3: {
    on_critical_veto: "abort" as const,
    on_blocking_veto: "block_and_push_upstream" as const,
    on_high_veto: "escalate_to_user" as const,
    max_veto_resolution_attempts: 1,
    description: "Veto evaluation is strict: critical vetoes abort, blocking vetoes push upstream, high vetoes ask the user",
  },
  gate_4: {
    on_admission_failure: "block_and_push_upstream" as const,
    max_rebuild_attempts: 1,
    on_repeated_failure: "escalate_to_user" as const,
    description: "Catalog admission allows one rebuild attempt before escalating repeated failures",
  },
  gate_5: {
    on_fix_regression: "abort" as const,
    on_fix_scope_exceeded: "escalate_to_user" as const,
    max_fix_attempts: 3,
    description: "FixTrail aborts on regression, escalates if the fix exceeds its declared scope",
  },
} as const;

export type GateEscalation = keyof typeof ESCALATION_POLICY;

export interface EscalationContext {
  gate: string;
  failure_type: string;
  attempt_count: number;
}

export function resolveEscalation(ctx: EscalationContext): EscalationAction {
  const gatePolicy = ESCALATION_POLICY[ctx.gate as GateEscalation];
  if (!gatePolicy) return "escalate_to_user";

  // Check for direct failure-type mapping (gate_2 style)
  const directAction = (gatePolicy as Record<string, unknown>)[ctx.failure_type];
  if (typeof directAction === "string" && EscalationAction.safeParse(directAction).success) {
    return directAction as EscalationAction;
  }

  // Check for attempt-based escalation (gate_0/gate_1 style)
  const policy = gatePolicy as Record<string, unknown>;
  const blockAfter = policy["block_after"];
  const escalateAfter = policy["escalate_to_user_after"];

  if (typeof blockAfter === "number" && ctx.attempt_count >= blockAfter) {
    return "abort";
  }
  if (typeof escalateAfter === "number" && ctx.attempt_count >= escalateAfter) {
    return "escalate_to_user";
  }

  return "re_query_and_retry";
}
