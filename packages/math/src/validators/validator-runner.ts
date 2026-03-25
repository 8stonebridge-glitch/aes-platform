import type { ScopeDefinition, ActualChanges } from "../engines/scope-drift-engine.js";
import { validateStructure } from "./structure-validator.js";
import { validateDependencyIntegrity } from "./dependency-integrity-validator.js";
import { validateScopeCompliance } from "./scope-compliance-validator.js";
import { validateInterfaceCoverage } from "./interface-coverage-validator.js";
import { validateRuleCompliance } from "./rule-compliance-validator.js";
import { validateTestMapping } from "./test-mapping-validator.js";

export interface ValidatorInput {
  artifact: any;
  bridge?: any;
  scope?: ScopeDefinition;
  actual_changes?: ActualChanges;
  files?: { path: string; content: string }[];
  required_tests?: string[];
  actual_tests?: string[];
}

export interface ValidatorOutput {
  validator_name: string;
  passed: boolean;
  violations: { code: string; message: string; severity: "info" | "warning" | "error" | "critical" }[];
  score: number; // 0-1
}

export interface AggregatedValidation {
  all_passed: boolean;
  total_validators: number;
  passed_count: number;
  failed_count: number;
  results: ValidatorOutput[];
  aggregate_score: number;
  blocking_failures: string[];
}

type ValidatorFn = (input: ValidatorInput) => ValidatorOutput;

const ALL_VALIDATORS: ValidatorFn[] = [
  validateStructure,
  validateDependencyIntegrity,
  validateScopeCompliance,
  validateInterfaceCoverage,
  validateRuleCompliance,
  validateTestMapping,
];

export function runAllValidators(input: ValidatorInput): AggregatedValidation {
  const results: ValidatorOutput[] = [];

  for (const validator of ALL_VALIDATORS) {
    try {
      results.push(validator(input));
    } catch (err: any) {
      results.push({
        validator_name: validator.name.replace("validate", "").toLowerCase(),
        passed: false,
        violations: [{
          code: "VALIDATOR_ERROR",
          message: `Validator threw an error: ${err?.message || String(err)}`,
          severity: "critical",
        }],
        score: 0,
      });
    }
  }

  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  const blockingFailures = results
    .filter(r => !r.passed)
    .map(r => r.validator_name);

  const aggregateScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.score, 0) / results.length * 1000) / 1000
    : 0;

  return {
    all_passed: failedCount === 0,
    total_validators: results.length,
    passed_count: passedCount,
    failed_count: failedCount,
    results,
    aggregate_score: aggregateScore,
    blocking_failures: blockingFailures,
  };
}

export function runValidator(name: string, input: ValidatorInput): ValidatorOutput {
  const validatorMap: Record<string, ValidatorFn> = {
    structure: validateStructure,
    dependency_integrity: validateDependencyIntegrity,
    scope_compliance: validateScopeCompliance,
    interface_coverage: validateInterfaceCoverage,
    rule_compliance: validateRuleCompliance,
    test_mapping: validateTestMapping,
  };

  const fn = validatorMap[name];
  if (!fn) {
    return {
      validator_name: name,
      passed: false,
      violations: [{ code: "UNKNOWN_VALIDATOR", message: `No validator named '${name}'`, severity: "critical" }],
      score: 0,
    };
  }

  return fn(input);
}
