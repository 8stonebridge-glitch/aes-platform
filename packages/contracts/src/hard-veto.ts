import { z } from "zod";
import { HardVetoCode } from "./enums.js";

// ─── Hard Veto Schema ─────────────────────────────────────────────────

export const HardVetoSchema = z.object({
  code: HardVetoCode,
  triggered: z.boolean(),
  reason: z.string(),
  blocking_feature_ids: z.array(z.string()).default([]),
  required_fix: z.string(),
});
export type HardVeto = z.infer<typeof HardVetoSchema>;

// ─── Veto Evaluation Result ───────────────────────────────────────────

export const VetoEvaluationResultSchema = z.object({
  evaluated_at: z.string().datetime(),
  bridge_id: z.string().uuid(),
  vetoes: z.array(HardVetoSchema),
  any_triggered: z.boolean(),
  triggered_codes: z.array(HardVetoCode),
});
export type VetoEvaluationResult = z.infer<typeof VetoEvaluationResultSchema>;

// ─── Veto Evaluation Function ─────────────────────────────────────────

/**
 * Returns true if ANY hard veto is triggered.
 * When this returns true, the bridge MUST stay blocked.
 * No override. No score-based bypass. Binary.
 */
export function hasTriggeredVetoes(vetoes: HardVeto[]): boolean {
  return vetoes.some((v) => v.triggered);
}

/**
 * Returns only the triggered vetoes from a list.
 */
export function getTriggeredVetoes(vetoes: HardVeto[]): HardVeto[] {
  return vetoes.filter((v) => v.triggered);
}

/**
 * Returns the veto codes that are triggered.
 */
export function getTriggeredVetoCodes(vetoes: HardVeto[]): HardVetoCode[] {
  return vetoes.filter((v) => v.triggered).map((v) => v.code);
}
