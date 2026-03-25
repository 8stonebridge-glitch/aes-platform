import { analyzeScopeDrift, type ScopeDefinition, type ActualChanges } from "../engines/scope-drift-engine.js";
import type { ValidatorInput, ValidatorOutput } from "./validator-runner.js";

export function validateScopeCompliance(input: ValidatorInput): ValidatorOutput {
  const violations: ValidatorOutput["violations"] = [];

  if (!input.scope) {
    violations.push({
      code: "SCOPE_001",
      message: "No scope definition provided — cannot validate compliance",
      severity: "warning",
    });
    return { validator_name: "scope_compliance", passed: true, violations, score: 0.5 };
  }

  if (!input.actual_changes) {
    violations.push({
      code: "SCOPE_002",
      message: "No actual changes provided — cannot validate compliance",
      severity: "warning",
    });
    return { validator_name: "scope_compliance", passed: true, violations, score: 0.5 };
  }

  const driftResult = analyzeScopeDrift(input.scope, input.actual_changes);

  // Convert drift violations to validator violations
  for (const v of driftResult.violations) {
    violations.push({
      code: `SCOPE_DRIFT_${v.type.toUpperCase()}`,
      message: v.detail,
      severity: v.severity === "critical" ? "critical" : v.severity === "error" ? "error" : "warning",
    });
  }

  // Budget checks
  if (!driftResult.within_budget) {
    violations.push({
      code: "SCOPE_BUDGET_EXCEEDED",
      message: `Change budget exceeded — files: ${Math.round(driftResult.files_budget_used * 100)}%, lines: ${Math.round(driftResult.lines_budget_used * 100)}%`,
      severity: "error",
    });
  }

  // Overall drift threshold
  if (driftResult.drift_score > 0.1) {
    violations.push({
      code: "SCOPE_HIGH_DRIFT",
      message: `Drift score ${driftResult.drift_score} exceeds threshold 0.1`,
      severity: "error",
    });
  }

  const criticalOrError = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
  const score = driftResult.clean ? 1.0 : Math.max(0, Math.round((1 - driftResult.drift_score) * 1000) / 1000);

  return {
    validator_name: "scope_compliance",
    passed: criticalOrError === 0,
    violations,
    score,
  };
}
