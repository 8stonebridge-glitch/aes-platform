/**
 * Gate 0: Intent Disambiguation Rules
 *
 * These rules evaluate raw user intent and determine whether it can be
 * auto-confirmed or requires clarification before proceeding to AppSpec generation.
 */

import { z } from "zod";
import { CONFIDENCE_THRESHOLDS } from "../policies/confidence-thresholds.js";

export const IntentInput = z.object({
  raw_text: z.string().min(1),
  detected_app_class: z.string().optional(),
  detected_actors: z.array(z.string()).default([]),
  detected_features: z.array(z.string()).default([]),
  ambiguity_flags: z.array(z.string()).default([]),
  risk_signals: z.array(z.string()).default([]),
});
export type IntentInput = z.infer<typeof IntentInput>;

export const Gate0Result = z.object({
  pass: z.boolean(),
  auto_confirmed: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.array(
    z.object({
      rule: z.string(),
      message: z.string(),
      severity: z.enum(["error", "warning", "info"]),
    })
  ),
  disambiguation_needed: z.boolean(),
  suggested_questions: z.array(z.string()),
});
export type Gate0Result = z.infer<typeof Gate0Result>;

const GATE_0_RULES = [
  {
    id: "G0-R1",
    name: "intent_not_empty",
    description: "Raw intent text must be non-empty and contain at least one actionable phrase",
    check: (input: IntentInput) => {
      const words = input.raw_text.trim().split(/\s+/);
      if (words.length < 3) {
        return { pass: false, message: "Intent is too short to extract meaningful requirements (minimum 3 words)" };
      }
      return { pass: true, message: "Intent has sufficient content" };
    },
  },
  {
    id: "G0-R2",
    name: "app_class_detectable",
    description: "At least one app class should be identifiable from the intent",
    check: (input: IntentInput) => {
      if (!input.detected_app_class) {
        return { pass: false, message: "Could not detect an app class from the intent. Clarify the type of application." };
      }
      return { pass: true, message: `Detected app class: ${input.detected_app_class}` };
    },
  },
  {
    id: "G0-R3",
    name: "actor_presence",
    description: "At least one actor or user type should be identifiable",
    check: (input: IntentInput) => {
      if (input.detected_actors.length === 0) {
        return { pass: false, message: "No actors detected. Who uses this system?" };
      }
      return { pass: true, message: `Detected ${input.detected_actors.length} actor(s)` };
    },
  },
  {
    id: "G0-R4",
    name: "feature_signal_present",
    description: "At least one feature or capability should be identifiable",
    check: (input: IntentInput) => {
      if (input.detected_features.length === 0) {
        return { pass: false, message: "No features detected. What should the system do?" };
      }
      return { pass: true, message: `Detected ${input.detected_features.length} feature signal(s)` };
    },
  },
  {
    id: "G0-R5",
    name: "no_contradictions",
    description: "Intent should not contain contradictory requirements",
    check: (input: IntentInput) => {
      const contradictionFlags = input.ambiguity_flags.filter((f) => f.startsWith("contradiction:"));
      if (contradictionFlags.length > 0) {
        return { pass: false, message: `Contradictory requirements detected: ${contradictionFlags.join(", ")}` };
      }
      return { pass: true, message: "No contradictions detected" };
    },
  },
  {
    id: "G0-R6",
    name: "risk_acknowledged",
    description: "High-risk signals should be flagged for user awareness",
    check: (input: IntentInput) => {
      if (input.risk_signals.length > 0) {
        return {
          pass: true,
          message: `Risk signals present: ${input.risk_signals.join(", ")}. These will increase validation requirements.`,
        };
      }
      return { pass: true, message: "No elevated risk signals" };
    },
  },
] as const;

export function evaluateGate0(input: IntentInput): Gate0Result {
  const parsed = IntentInput.parse(input);
  const issues: Gate0Result["issues"] = [];
  let passCount = 0;

  for (const rule of GATE_0_RULES) {
    const result = rule.check(parsed);
    if (!result.pass) {
      issues.push({ rule: rule.id, message: result.message, severity: "error" });
    } else {
      passCount++;
      if (result.message.startsWith("Risk signals present")) {
        issues.push({ rule: rule.id, message: result.message, severity: "warning" });
      }
    }
  }

  const confidence = passCount / GATE_0_RULES.length;
  const hasAmbiguity = parsed.ambiguity_flags.length > 0;
  const hasHighRisk = parsed.risk_signals.length > 0;
  const thresholds = CONFIDENCE_THRESHOLDS.gate_0_auto_confirm;

  const auto_confirmed =
    confidence >= thresholds.min_overall &&
    (!thresholds.requires_zero_ambiguity_flags || !hasAmbiguity) &&
    (!thresholds.requires_low_risk || !hasHighRisk);

  const suggestedQuestions: string[] = [];
  if (!parsed.detected_app_class) suggestedQuestions.push("What type of application is this?");
  if (parsed.detected_actors.length === 0) suggestedQuestions.push("Who are the primary users of this system?");
  if (parsed.detected_features.length === 0) suggestedQuestions.push("What are the core capabilities this system needs?");

  return {
    pass: issues.filter((i) => i.severity === "error").length === 0,
    auto_confirmed,
    confidence,
    issues,
    disambiguation_needed: suggestedQuestions.length > 0,
    suggested_questions: suggestedQuestions,
  };
}

export { GATE_0_RULES };
