/**
 * Gate 4: Catalog Admission Rules
 *
 * Determines whether a completed build artifact is eligible for catalog admission.
 * Uses the catalog admission checklist and evaluates all required checks.
 */

import { z } from "zod";
import { evaluateAdmission, CATALOG_ADMISSION_CHECKLIST, type AdmissionResult } from "../policies/catalog-admission-policy.js";

export const BuildArtifact = z.object({
  artifact_id: z.string(),
  spec_id: z.string(),
  feature_ids: z.array(z.string()),
  build_status: z.enum(["complete", "partial", "failed"]),
  test_results: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    skipped: z.number(),
  }),
  validator_results: z.array(
    z.object({
      validator_id: z.string(),
      passed: z.boolean(),
      message: z.string().optional(),
    })
  ),
  veto_results: z.object({
    critical: z.number(),
    blocking: z.number(),
    high: z.number(),
  }),
  acceptance_tests: z.record(z.string(), z.boolean()),
  coverage_percent: z.number().min(0).max(100),
  unresolved_dependencies: z.array(z.string()),
  lineage_hash: z.string(),
  expected_hash: z.string(),
});
export type BuildArtifact = z.infer<typeof BuildArtifact>;

export const Gate4Result = z.object({
  pass: z.boolean(),
  admission: z.custom<AdmissionResult>(),
  artifact_id: z.string(),
});
export type Gate4Result = z.infer<typeof Gate4Result>;

export function evaluateGate4(artifact: BuildArtifact): Gate4Result {
  const parsed = BuildArtifact.parse(artifact);

  const totalTests = parsed.test_results.total;
  const passRate = totalTests > 0 ? parsed.test_results.passed / totalTests : 0;

  const totalValidators = parsed.validator_results.length;
  const passedValidators = parsed.validator_results.filter((v) => v.passed).length;
  const validatorPassRate = totalValidators > 0 ? passedValidators / totalValidators : 0;

  const allFeaturesHaveAcceptance = parsed.feature_ids.every(
    (fid) => parsed.acceptance_tests[fid] !== undefined
  );

  const checkResults: Record<string, { passed: boolean; reason?: string }> = {
    build_complete: {
      passed: parsed.build_status === "complete",
      reason: parsed.build_status !== "complete" ? `Build status is ${parsed.build_status}` : undefined,
    },
    all_tests_pass: {
      passed: parsed.test_results.failed === 0,
      reason: parsed.test_results.failed > 0 ? `${parsed.test_results.failed} test(s) failed` : undefined,
    },
    all_validators_pass: {
      passed: validatorPassRate >= 0.9,
      reason: validatorPassRate < 0.9 ? `Validator pass rate ${(validatorPassRate * 100).toFixed(1)}% < 90%` : undefined,
    },
    no_critical_vetoes: {
      passed: parsed.veto_results.critical === 0,
      reason: parsed.veto_results.critical > 0 ? `${parsed.veto_results.critical} critical veto(es)` : undefined,
    },
    no_blocking_vetoes: {
      passed: parsed.veto_results.blocking === 0,
      reason: parsed.veto_results.blocking > 0 ? `${parsed.veto_results.blocking} blocking veto(es)` : undefined,
    },
    acceptance_tests_present: {
      passed: allFeaturesHaveAcceptance,
      reason: !allFeaturesHaveAcceptance ? "Not all features have acceptance test results" : undefined,
    },
    coverage_threshold_met: {
      passed: parsed.coverage_percent >= 70,
      reason: parsed.coverage_percent < 70 ? `Coverage ${parsed.coverage_percent}% < 70%` : undefined,
    },
    no_unresolved_dependencies: {
      passed: parsed.unresolved_dependencies.length === 0,
      reason: parsed.unresolved_dependencies.length > 0
        ? `Unresolved: ${parsed.unresolved_dependencies.join(", ")}`
        : undefined,
    },
    audit_trail_intact: {
      passed: !!parsed.lineage_hash && !!parsed.spec_id,
      reason: !parsed.lineage_hash ? "Missing lineage hash" : !parsed.spec_id ? "Missing spec ID" : undefined,
    },
    artifact_hash_verified: {
      passed: parsed.lineage_hash === parsed.expected_hash,
      reason: parsed.lineage_hash !== parsed.expected_hash ? "Artifact hash mismatch" : undefined,
    },
  };

  const admission = evaluateAdmission(checkResults);

  return {
    pass: admission.admitted,
    admission,
    artifact_id: parsed.artifact_id,
  };
}

export { CATALOG_ADMISSION_CHECKLIST };
