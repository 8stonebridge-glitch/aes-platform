/**
 * AES commit message convention.
 *
 * Format:
 *   [AES] <type>(<feature>): <description>
 *
 *   Bridge: <bridge-id>
 *   Feature: <feature-id>
 *   Job: <job-id>
 *
 * Types:
 *   feat     - New feature implementation
 *   fix      - Bug fix during build
 *   refactor - Code restructuring
 *   test     - Adding tests
 *   chore    - Build/config changes
 *   repair   - Fix after validator failure
 */

export type CommitType = "feat" | "fix" | "refactor" | "test" | "chore" | "repair";

export interface CommitContext {
  type: CommitType;
  featureName: string;
  description: string;
  bridgeId: string;
  featureId: string;
  jobId: string;
}

export function buildCommitMessage(ctx: CommitContext): string {
  return [
    `[AES] ${ctx.type}(${ctx.featureName}): ${ctx.description}`,
    "",
    `Bridge: ${ctx.bridgeId}`,
    `Feature: ${ctx.featureId}`,
    `Job: ${ctx.jobId}`,
  ].join("\n");
}
