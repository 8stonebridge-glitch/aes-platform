import type { BuilderInput, BuilderOutput } from "./types.js";
import { enforceScope, isScopeClean } from "./scope-enforcer.js";
import { buildBranchName, getTargetBranch } from "./branch-manager.js";
import { buildValidatorHandoff } from "./validator-handoff.js";
import type { ValidatorHandoff } from "./validator-handoff.js";

/**
 * BuilderAgent orchestrates a single feature build.
 *
 * Rules:
 * 1. Receives ONLY a BuilderInput (derived from FeatureBridge)
 * 2. Cannot see the full AppSpec, other features, or the graph
 * 3. Must work within bounded read/write scope
 * 4. Cannot self-approve -- must hand off to validators
 * 5. Scope violations are immediate hard fails
 */
export class BuilderAgent {
  /**
   * Execute a feature build from a bridge-derived input.
   * Returns the output and validator handoff.
   */
  async execute(
    input: BuilderInput,
    jobId: string
  ): Promise<{ output: BuilderOutput; handoff: ValidatorHandoff }> {
    const startTime = Date.now();
    const branch = buildBranchName(jobId, input.feature_name);

    // TODO: Implement actual code generation
    // This will be backed by an LLM (Claude/GPT) with the BuilderInput as context
    // The LLM generates code, the agent writes it to the branch

    const output: BuilderOutput = {
      bridge_id: input.bridge_id,
      feature_id: input.feature_id,
      status: "success",
      branch,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      reuse_assets_used: [],
      reuse_assets_skipped: [],
      test_results: [],
      scope_violations: [],
      duration_ms: Date.now() - startTime,
      completed_at: new Date().toISOString(),
    };

    // Enforce scope -- this is non-negotiable
    const violations = enforceScope(input, output);
    output.scope_violations = violations;

    if (!isScopeClean(violations)) {
      output.status = "failed";
      output.error_message = `Scope violations detected: ${violations.map(v => v.violation_type).join(", ")}`;
    }

    // Build validator handoff
    const handoff = buildValidatorHandoff(
      input,
      output,
      isScopeClean(violations),
      violations.map(v => v.description)
    );

    return { output, handoff };
  }
}
