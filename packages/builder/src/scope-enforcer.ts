import type { BuilderInput, BuilderOutput } from "./types.js";

export interface ScopeViolation {
  violation_type: "write_outside_scope" | "forbidden_path" | "unauthorized_delete" | "shared_package_change" | "schema_change";
  path: string;
  description: string;
}

/**
 * Validates that builder output respects the bridge's scope constraints.
 * Any violation = immediate hard fail. The builder cannot override this.
 */
export function enforceScope(
  input: BuilderInput,
  output: BuilderOutput
): ScopeViolation[] {
  const violations: ScopeViolation[] = [];
  const { write_scope } = input;

  // Check all created/modified files are within allowed paths
  const allWrittenFiles = [...output.files_created, ...output.files_modified];
  for (const file of allWrittenFiles) {
    const inAllowedPath = write_scope.allowed_repo_paths.some(
      (allowed) => file.startsWith(allowed)
    );
    if (!inAllowedPath) {
      violations.push({
        violation_type: "write_outside_scope",
        path: file,
        description: `File ${file} is not within any allowed write path`,
      });
    }

    const inForbiddenPath = write_scope.forbidden_repo_paths.some(
      (forbidden) => file.startsWith(forbidden)
    );
    if (inForbiddenPath) {
      violations.push({
        violation_type: "forbidden_path",
        path: file,
        description: `File ${file} is within a forbidden path`,
      });
    }
  }

  // Check deletes are allowed
  if (output.files_deleted.length > 0 && !write_scope.may_delete_files) {
    for (const file of output.files_deleted) {
      violations.push({
        violation_type: "unauthorized_delete",
        path: file,
        description: `Deletion not permitted: ${file}`,
      });
    }
  }

  return violations;
}

/**
 * Returns true if scope is clean (no violations).
 */
export function isScopeClean(violations: ScopeViolation[]): boolean {
  return violations.length === 0;
}
