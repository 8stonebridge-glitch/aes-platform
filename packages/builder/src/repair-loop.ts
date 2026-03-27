import type { BuilderInput, BuilderOutput } from "./types.js";

export interface RepairContext {
  original_input: BuilderInput;
  original_output: BuilderOutput;
  validator_failures: {
    validator_name: string;
    verdict: string;
    evidence: string;
    concerns: string[];
  }[];
  repair_attempt: number;
  max_repair_attempts: number;
}

export type RepairDecision =
  | { action: "retry_build"; narrowed_scope: string }
  | { action: "patch_specific_files"; files: string[]; instructions: string }
  | { action: "escalate"; reason: string }
  | { action: "abort"; reason: string };

/**
 * Decide what to do after a builder output fails validation.
 *
 * Rules:
 * - Attempt 1: Retry with narrowed scope focused on failed validators
 * - Attempt 2: Patch specific files based on validator evidence
 * - Attempt 3: Escalate (push failure upstream to bridge repair)
 * - Beyond: Abort
 */
export function decideRepairAction(ctx: RepairContext): RepairDecision {
  if (ctx.repair_attempt >= ctx.max_repair_attempts) {
    return { action: "abort", reason: `Max repair attempts (${ctx.max_repair_attempts}) exceeded` };
  }

  if (ctx.repair_attempt === 1) {
    const failedValidators = ctx.validator_failures
      .filter((v) => v.verdict === "FAIL")
      .map((v) => v.validator_name);
    return {
      action: "retry_build",
      narrowed_scope: `Focus on fixing: ${failedValidators.join(", ")}`,
    };
  }

  if (ctx.repair_attempt === 2) {
    const filesFromEvidence = ctx.validator_failures
      .flatMap((v) => {
        const fileMatches = v.evidence.match(/[\w/.-]+\.\w+/g);
        return fileMatches ?? [];
      });
    const uniqueFiles = [...new Set(filesFromEvidence)];

    if (uniqueFiles.length > 0) {
      return {
        action: "patch_specific_files",
        files: uniqueFiles,
        instructions: ctx.validator_failures
          .map((v) => `${v.validator_name}: ${v.concerns.join("; ")}`)
          .join("\n"),
      };
    }
  }

  return {
    action: "escalate",
    reason: `Repair attempts exhausted. Failures: ${ctx.validator_failures.map((v) => v.validator_name).join(", ")}`,
  };
}

export const MAX_REPAIR_ATTEMPTS = 3;
