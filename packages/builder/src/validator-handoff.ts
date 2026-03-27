import type { BuilderOutput } from "./types.js";

/**
 * The format the builder hands off to validators.
 * This is what validators receive to evaluate.
 */
export interface ValidatorHandoff {
  bridge_id: string;
  feature_id: string;

  // What was built
  branch: string;
  commit_sha: string;
  pr_url: string | null;

  files_created: string[];
  files_modified: string[];
  files_deleted: string[];

  // What was expected
  success_definition: {
    user_visible_outcome: string;
    technical_outcome: string;
    validation_requirements: string[];
  };

  required_tests: {
    test_id: string;
    name: string;
    type: string;
    pass_condition: string;
  }[];

  // Builder's own test results (validators may re-run independently)
  builder_test_results: {
    test_id: string;
    passed: boolean;
    output?: string;
  }[];

  // Scope check (already enforced, included for validator awareness)
  scope_clean: boolean;
  scope_violations: string[];
}

/**
 * Convert BuilderOutput to ValidatorHandoff format.
 */
export function buildValidatorHandoff(
  input: { bridge_id: string; feature_id: string; success_definition: { user_visible_outcome: string; technical_outcome: string; validation_requirements: string[] }; required_tests: { test_id: string; name: string; type: string; pass_condition: string }[] },
  output: BuilderOutput,
  scopeClean: boolean,
  scopeViolations: string[]
): ValidatorHandoff {
  return {
    bridge_id: input.bridge_id,
    feature_id: input.feature_id,
    branch: output.branch,
    commit_sha: output.commit_sha ?? "",
    pr_url: output.pr_url ?? null,
    files_created: output.files_created,
    files_modified: output.files_modified,
    files_deleted: output.files_deleted,
    success_definition: input.success_definition,
    required_tests: input.required_tests,
    builder_test_results: output.test_results,
    scope_clean: scopeClean,
    scope_violations: scopeViolations,
  };
}
