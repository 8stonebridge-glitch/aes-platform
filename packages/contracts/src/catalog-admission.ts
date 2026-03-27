import { z } from "zod";
import { CatalogAdmissionDecision, ReuseAssetType } from "./enums.js";

// ─── Catalog Candidate Schema ─────────────────────────────────────────

export const CatalogCandidateSchema = z.object({
  candidate_id: z.string(),
  source_app_id: z.string(),
  source_feature_id: z.string(),

  asset_type: ReuseAssetType,

  name: z.string(),
  description: z.string(),

  // All must be true for ADMIT_SHARED
  typed_interface_present: z.boolean(),
  tests_present: z.boolean(),
  documentation_present: z.boolean(),
  ownership_declared: z.boolean(),
  version_declared: z.boolean(),
  dependency_surface_declared: z.boolean(),
  constraints_documented: z.boolean(),
  reuse_evidence_present: z.boolean(),
  breaking_change_policy_defined: z.boolean(),

  app_local_assumptions: z.array(z.string()).default([]),
});
export type CatalogCandidate = z.infer<typeof CatalogCandidateSchema>;

// ─── Catalog Admission Result ─────────────────────────────────────────

export const CatalogAdmissionResultSchema = z.object({
  candidate_id: z.string(),
  decision: CatalogAdmissionDecision,
  reasons: z.array(z.string()),
  missing_requirements: z.array(z.string()).default([]),
  next_actions: z.array(z.string()).default([]),
  reviewed_at: z.string().datetime(),
});
export type CatalogAdmissionResult = z.infer<typeof CatalogAdmissionResultSchema>;

// ─── Admission Evaluation Function ────────────────────────────────────

const REQUIRED_CHECKS = [
  "typed_interface_present",
  "tests_present",
  "documentation_present",
  "ownership_declared",
  "version_declared",
  "dependency_surface_declared",
  "constraints_documented",
  "reuse_evidence_present",
  "breaking_change_policy_defined",
] as const;

/**
 * Evaluate a catalog candidate for admission.
 * ADMIT_SHARED only if ALL boolean checks are true. No exceptions.
 * No rushed manual bypass.
 */
export function evaluateCatalogAdmission(
  candidate: CatalogCandidate
): CatalogAdmissionResult {
  const missing: string[] = [];

  for (const check of REQUIRED_CHECKS) {
    if (!candidate[check]) {
      missing.push(check);
    }
  }

  const hasLocalAssumptions = candidate.app_local_assumptions.length > 0;

  let decision: CatalogAdmissionDecision;
  const reasons: string[] = [];
  const nextActions: string[] = [];

  if (missing.length === 0 && !hasLocalAssumptions) {
    decision = "ADMIT_SHARED";
    reasons.push("All admission criteria met. No app-local assumptions.");
  } else if (hasLocalAssumptions && missing.length === 0) {
    decision = "REJECT_APP_LOCAL_ONLY";
    reasons.push(
      "All quality checks pass but asset has app-local assumptions that prevent shared use."
    );
    nextActions.push(
      "Remove app-local assumptions or document how they generalize."
    );
  } else if (missing.length <= 2) {
    decision = "REQUIRES_HARDENING";
    reasons.push(
      `${missing.length} requirement(s) not met. Asset is close to shared quality.`
    );
    nextActions.push(
      ...missing.map((m) => `Address: ${m.replace(/_/g, " ")}`)
    );
  } else {
    decision = "REJECT_INCOMPLETE";
    reasons.push(
      `${missing.length} requirements not met. Asset is not ready for shared catalog.`
    );
    nextActions.push(
      ...missing.map((m) => `Address: ${m.replace(/_/g, " ")}`)
    );
  }

  return {
    candidate_id: candidate.candidate_id,
    decision,
    reasons,
    missing_requirements: missing,
    next_actions: nextActions,
    reviewed_at: new Date().toISOString(),
  };
}
