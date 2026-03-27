import { z } from "zod";

export const AdmissionCheckId = z.enum([
  "build_complete",
  "all_tests_pass",
  "all_validators_pass",
  "no_critical_vetoes",
  "no_blocking_vetoes",
  "acceptance_tests_present",
  "coverage_threshold_met",
  "no_unresolved_dependencies",
  "audit_trail_intact",
  "artifact_hash_verified",
]);
export type AdmissionCheckId = z.infer<typeof AdmissionCheckId>;

export const CATALOG_ADMISSION_CHECKLIST = [
  {
    id: "build_complete" as const,
    description: "All feature build steps completed without errors",
    required: true,
    gate: "gate_4",
  },
  {
    id: "all_tests_pass" as const,
    description: "All unit, integration, and acceptance tests pass",
    required: true,
    gate: "gate_4",
  },
  {
    id: "all_validators_pass" as const,
    description: "All tier_a and applicable tier_b validators pass",
    required: true,
    gate: "gate_4",
  },
  {
    id: "no_critical_vetoes" as const,
    description: "Zero unresolved critical-severity vetoes remain",
    required: true,
    gate: "gate_4",
  },
  {
    id: "no_blocking_vetoes" as const,
    description: "Zero unresolved blocking-severity vetoes remain",
    required: true,
    gate: "gate_4",
  },
  {
    id: "acceptance_tests_present" as const,
    description: "Every feature has at least one acceptance test covering its primary journey",
    required: true,
    gate: "gate_4",
  },
  {
    id: "coverage_threshold_met" as const,
    description: "Code coverage meets the minimum threshold for the feature's risk class",
    required: true,
    gate: "gate_4",
  },
  {
    id: "no_unresolved_dependencies" as const,
    description: "All declared dependencies are resolved and available",
    required: true,
    gate: "gate_4",
  },
  {
    id: "audit_trail_intact" as const,
    description: "Full lineage from intent through build to artifact is traceable",
    required: true,
    gate: "gate_4",
  },
  {
    id: "artifact_hash_verified" as const,
    description: "Build artifact hash matches the expected output for the given inputs",
    required: true,
    gate: "gate_4",
  },
] as const;

export interface AdmissionResult {
  admitted: boolean;
  checks: Array<{
    id: AdmissionCheckId;
    passed: boolean;
    reason?: string;
  }>;
  blockers: string[];
}

export function evaluateAdmission(
  checkResults: Record<string, boolean | { passed: boolean; reason?: string }>
): AdmissionResult {
  const checks: AdmissionResult["checks"] = [];
  const blockers: string[] = [];

  for (const check of CATALOG_ADMISSION_CHECKLIST) {
    const result = checkResults[check.id];
    const passed = typeof result === "boolean" ? result : result?.passed ?? false;
    const reason = typeof result === "object" ? result.reason : undefined;

    checks.push({ id: check.id, passed, reason });

    if (check.required && !passed) {
      blockers.push(`${check.id}: ${check.description}${reason ? ` (${reason})` : ""}`);
    }
  }

  return {
    admitted: blockers.length === 0,
    checks,
    blockers,
  };
}
