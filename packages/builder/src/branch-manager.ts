/**
 * Branch naming convention for AES-managed repos.
 * Pattern: aes/<job-id>/<feature-name>
 *
 * Examples:
 *   aes/j-abc123/auth-and-org-management
 *   aes/j-abc123/approval-workflow
 *   aes/j-abc123/notification-system
 */
export function buildBranchName(jobId: string, featureName: string): string {
  const sanitized = featureName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);

  return `aes/${jobId}/${sanitized}`;
}

/**
 * Target branch for PRs. AES PRs always target develop.
 */
export function getTargetBranch(): string {
  return "develop";
}

/**
 * Parse job ID and feature name from an AES branch name.
 */
export function parseBranchName(branch: string): { jobId: string; featureName: string } | null {
  const match = branch.match(/^aes\/([^/]+)\/(.+)$/);
  if (!match) return null;
  return { jobId: match[1], featureName: match[2] };
}
