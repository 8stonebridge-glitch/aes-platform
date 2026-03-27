import { z } from "zod";
import {
  AppPlanState,
  AppPlanTransitionAuthority,
  BridgeStatus,
  BridgeTransitionAuthority,
} from "./enums.js";

// ─── Transition Definition ────────────────────────────────────────────

export const TransitionSchema = z.object({
  from: z.string(),
  to: z.string(),
  authority: z.string(),
  guard: z.string().optional(),
});
export type Transition = z.infer<typeof TransitionSchema>;

// ─── App Plan State Machine ───────────────────────────────────────────

export const APP_PLAN_TRANSITIONS: Transition[] = [
  // Gate 0
  { from: "intent_received", to: "intent_confirmed", authority: "intent_classifier", guard: "auto_confirmed_low_ambiguity" },
  { from: "intent_received", to: "intent_confirmed", authority: "intent_confirmation_service", guard: "user_confirmed" },
  { from: "intent_received", to: "failed", authority: "intent_confirmation_service", guard: "user_rejected" },

  // Gate 1
  { from: "intent_confirmed", to: "spec_generating", authority: "spec_orchestrator" },
  { from: "spec_generating", to: "spec_validated", authority: "spec_validator", guard: "all_rules_passed" },
  { from: "spec_generating", to: "spec_blocked", authority: "spec_validator", guard: "rules_failed_after_retries" },
  { from: "spec_blocked", to: "spec_generating", authority: "spec_orchestrator", guard: "clarification_received" },
  { from: "spec_blocked", to: "failed", authority: "spec_orchestrator", guard: "unresolvable" },

  // User Approval Point A
  { from: "spec_validated", to: "awaiting_user_approval", authority: "orchestrator" },
  { from: "awaiting_user_approval", to: "approved_for_build", authority: "user", guard: "user_approved" },
  { from: "awaiting_user_approval", to: "failed", authority: "user", guard: "user_rejected" },

  // Build phase
  { from: "approved_for_build", to: "building", authority: "orchestrator" },
  { from: "building", to: "partially_blocked", authority: "build_monitor", guard: "some_bridges_blocked" },
  { from: "partially_blocked", to: "building", authority: "orchestrator", guard: "blocks_resolved" },
  { from: "building", to: "deployed", authority: "deployment_validator", guard: "all_features_passed_and_deployed" },
  { from: "building", to: "failed", authority: "build_monitor", guard: "unrecoverable_failure" },

  // Terminal
  { from: "deployed", to: "archived", authority: "orchestrator" },
  { from: "failed", to: "archived", authority: "orchestrator" },
];

// ─── Feature Bridge State Machine ─────────────────────────────────────

export const BRIDGE_TRANSITIONS: Transition[] = [
  // Compilation
  { from: "draft", to: "validated", authority: "bridge_validator", guard: "all_compile_checks_passed" },
  { from: "draft", to: "blocked", authority: "bridge_validator", guard: "compile_checks_failed" },

  // Veto check
  { from: "validated", to: "blocked", authority: "policy_engine", guard: "hard_veto_triggered" },
  { from: "validated", to: "blocked", authority: "dependency_resolver", guard: "dependency_unresolved" },
  { from: "validated", to: "approved", authority: "policy_engine", guard: "no_vetoes_and_confidence_met" },

  // Repair loop
  { from: "blocked", to: "draft", authority: "repair_compiler", guard: "upstream_fix_applied" },

  // Execution
  { from: "approved", to: "executing", authority: "orchestrator_dispatcher" },
  { from: "executing", to: "passed", authority: "validator_aggregate", guard: "validators_pass" },
  { from: "executing", to: "failed", authority: "validator_aggregate", guard: "validators_fail" },

  // Repair after failure
  { from: "failed", to: "draft", authority: "repair_compiler", guard: "repair_initiated" },
];

// ─── Transition Validation ────────────────────────────────────────────

/**
 * Check if a transition is valid given current state and authority.
 */
export function isValidAppPlanTransition(
  from: string,
  to: string,
  authority: string
): boolean {
  return APP_PLAN_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.authority === authority
  );
}

export function isValidBridgeTransition(
  from: string,
  to: string,
  authority: string
): boolean {
  return BRIDGE_TRANSITIONS.some(
    (t) => t.from === from && t.to === to && t.authority === authority
  );
}

/**
 * Get all valid next states from a given state.
 */
export function getValidAppPlanNextStates(from: string): string[] {
  return [...new Set(
    APP_PLAN_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
  )];
}

export function getValidBridgeNextStates(from: string): string[] {
  return [...new Set(
    BRIDGE_TRANSITIONS.filter((t) => t.from === from).map((t) => t.to)
  )];
}
