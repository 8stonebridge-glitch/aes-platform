import { z } from "zod";
import {
  AppClass,
  RiskClass,
  Platform,
  ConfirmationStatus,
  AmbiguityFlag,
} from "./enums.js";

// ─── IntentBrief — Gate 0 Output ──────────────────────────────────────

export const IntentBriefSchema = z.object({
  request_id: z.string().uuid(),
  raw_request: z.string().min(1),

  // Inferred fields — system-derived from raw request
  inferred_app_class: AppClass,
  inferred_primary_users: z.array(z.string()).min(1),
  inferred_core_outcome: z.string().min(1),
  inferred_platforms: z.array(Platform).min(1),
  inferred_risk_class: RiskClass,
  inferred_integrations: z.array(z.string()).default([]),

  // Explicit user-provided scope boundaries
  explicit_inclusions: z.array(z.string()).default([]),
  explicit_exclusions: z.array(z.string()).default([]),

  // Ambiguity assessment
  ambiguity_flags: z.array(AmbiguityFlag).default([]),
  assumptions: z.array(z.string()).default([]),

  // Confirmation
  confirmation_statement: z.string().min(1),
  confirmation_status: ConfirmationStatus,

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type IntentBrief = z.infer<typeof IntentBriefSchema>;

// ─── Gate 0 Proceed Rule ──────────────────────────────────────────────

/**
 * Gate 0 proceed rule.
 * AES cannot proceed to decomposition unless:
 * - User explicitly confirmed, OR
 * - System auto-confirmed with low ambiguity + low risk + zero flags
 */
export function canProceedToDecomposition(intent: IntentBrief): boolean {
  return (
    intent.confirmation_status === "confirmed" ||
    (intent.confirmation_status === "auto_confirmed_low_ambiguity" &&
      intent.ambiguity_flags.length === 0 &&
      intent.inferred_risk_class === "low")
  );
}

// ─── Confirmation Prompt Builder ──────────────────────────────────────

/**
 * Generates the one-sentence confirmation prompt for Gate 0.
 *
 * Template:
 * "You want a {app_class} for {primary_users}, focused on {core_outcome},
 *  delivered as {platforms}, with {key_integrations} — correct?"
 */
export function buildConfirmationPrompt(intent: IntentBrief): string {
  const appClass = intent.inferred_app_class.replace(/_/g, " ");
  const users = intent.inferred_primary_users.join(" and ");
  const platforms = intent.inferred_platforms.join(" + ");
  const integrations =
    intent.inferred_integrations.length > 0
      ? `with ${intent.inferred_integrations.join(", ")}`
      : "with no external integrations";

  return `You want a ${appClass} for ${users}, focused on ${intent.inferred_core_outcome}, delivered as ${platforms}, ${integrations} — correct?`;
}
