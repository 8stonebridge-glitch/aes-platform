/**
 * Gate 5: FixTrail Recording Rules
 *
 * Rules governing how fixes are recorded, validated for regression safety,
 * and scoped to ensure they don't exceed their declared intent.
 */

import { z } from "zod";
import { CONFIDENCE_THRESHOLDS } from "../policies/confidence-thresholds.js";

export const FixEntry = z.object({
  fix_id: z.string(),
  source_artifact_id: z.string(),
  target_feature_id: z.string(),
  description: z.string().min(1),
  files_changed: z.array(z.string()).min(1),
  declared_scope: z.array(z.string()),
  actual_scope: z.array(z.string()),
  regression_tests_run: z.array(z.string()),
  regression_tests_passed: z.array(z.string()),
  regression_tests_failed: z.array(z.string()),
  fix_type: z.enum(["bugfix", "hotfix", "refactor", "config_change", "dependency_update"]),
  linked_veto_code: z.string().optional(),
  timestamp: z.string(),
  author: z.string(),
});
export type FixEntry = z.infer<typeof FixEntry>;

export const Gate5Result = z.object({
  pass: z.boolean(),
  confidence: z.number().min(0).max(1),
  rule_results: z.array(
    z.object({
      rule_id: z.string(),
      rule_name: z.string(),
      pass: z.boolean(),
      message: z.string(),
      severity: z.enum(["error", "warning", "info"]),
    })
  ),
  recordable: z.boolean(),
});
export type Gate5Result = z.infer<typeof Gate5Result>;

const GATE_5_RULES = [
  {
    id: "G5-R1",
    name: "fix_has_description",
    description: "Every fix must have a non-empty description explaining what was changed and why",
    check: (fix: FixEntry) => {
      if (fix.description.trim().length < 10) {
        return { pass: false, message: "Fix description is too short (minimum 10 characters)" };
      }
      return { pass: true, message: "Fix has adequate description" };
    },
  },
  {
    id: "G5-R2",
    name: "fix_has_files_changed",
    description: "Fix must list at least one changed file",
    check: (fix: FixEntry) => {
      if (fix.files_changed.length === 0) {
        return { pass: false, message: "No files listed as changed" };
      }
      return { pass: true, message: `${fix.files_changed.length} file(s) changed` };
    },
  },
  {
    id: "G5-R3",
    name: "scope_not_exceeded",
    description: "Actual scope must not exceed declared scope",
    check: (fix: FixEntry) => {
      const declaredSet = new Set(fix.declared_scope);
      const exceeded = fix.actual_scope.filter((s) => !declaredSet.has(s));
      if (exceeded.length > 0) {
        return { pass: false, message: `Fix exceeded declared scope: ${exceeded.join(", ")}` };
      }
      return { pass: true, message: "Fix is within declared scope" };
    },
  },
  {
    id: "G5-R4",
    name: "regression_tests_run",
    description: "At least one regression test must have been executed",
    check: (fix: FixEntry) => {
      if (fix.regression_tests_run.length === 0) {
        return { pass: false, message: "No regression tests were run" };
      }
      return { pass: true, message: `${fix.regression_tests_run.length} regression test(s) run` };
    },
  },
  {
    id: "G5-R5",
    name: "regression_tests_pass",
    description: "All regression tests must pass; any failure blocks the fix recording",
    check: (fix: FixEntry) => {
      if (fix.regression_tests_failed.length > 0) {
        return { pass: false, message: `Regression failures: ${fix.regression_tests_failed.join(", ")}` };
      }
      return { pass: true, message: "All regression tests passed" };
    },
  },
  {
    id: "G5-R6",
    name: "lineage_traceable",
    description: "Fix must reference a valid source artifact and target feature",
    check: (fix: FixEntry) => {
      if (!fix.source_artifact_id.trim()) {
        return { pass: false, message: "Missing source artifact ID" };
      }
      if (!fix.target_feature_id.trim()) {
        return { pass: false, message: "Missing target feature ID" };
      }
      return { pass: true, message: "Lineage references are present" };
    },
  },
  {
    id: "G5-R7",
    name: "fix_type_valid",
    description: "Fix type must be a recognized category",
    check: (fix: FixEntry) => {
      const validTypes = ["bugfix", "hotfix", "refactor", "config_change", "dependency_update"];
      if (!validTypes.includes(fix.fix_type)) {
        return { pass: false, message: `Unknown fix type: ${fix.fix_type}` };
      }
      return { pass: true, message: `Fix type: ${fix.fix_type}` };
    },
  },
  {
    id: "G5-R8",
    name: "hotfix_has_linked_veto",
    description: "Hotfixes should be linked to a veto code that motivated the fix",
    check: (fix: FixEntry) => {
      if (fix.fix_type === "hotfix" && !fix.linked_veto_code) {
        return { pass: false, message: "Hotfix has no linked veto code" };
      }
      return { pass: true, message: "Veto linkage is correct for fix type" };
    },
  },
  {
    id: "G5-R9",
    name: "timestamp_present",
    description: "Fix must have a timestamp for audit trail purposes",
    check: (fix: FixEntry) => {
      if (!fix.timestamp.trim()) {
        return { pass: false, message: "Missing timestamp" };
      }
      return { pass: true, message: "Timestamp present" };
    },
  },
  {
    id: "G5-R10",
    name: "author_present",
    description: "Fix must have an author for accountability",
    check: (fix: FixEntry) => {
      if (!fix.author.trim()) {
        return { pass: false, message: "Missing author" };
      }
      return { pass: true, message: `Author: ${fix.author}` };
    },
  },
] as const;

export function evaluateGate5(fix: FixEntry): Gate5Result {
  const parsed = FixEntry.parse(fix);
  const results: Gate5Result["rule_results"] = [];

  for (const rule of GATE_5_RULES) {
    const result = rule.check(parsed);
    results.push({
      rule_id: rule.id,
      rule_name: rule.name,
      pass: result.pass,
      message: result.message,
      severity: result.pass ? "info" : "error",
    });
  }

  const passCount = results.filter((r) => r.pass).length;
  const confidence = passCount / GATE_5_RULES.length;
  const allPass = results.every((r) => r.pass);

  return {
    pass: allPass && confidence >= CONFIDENCE_THRESHOLDS.gate_5_fix_trail.min_overall,
    confidence,
    rule_results: results,
    recordable: allPass,
  };
}

export { GATE_5_RULES };
