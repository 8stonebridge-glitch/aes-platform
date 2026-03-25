export interface ScopeDefinition {
  allowed_paths: string[];
  forbidden_paths: string[];
  allowed_file_types: string[];
  max_files_changed: number;
  max_lines_changed: number;
  may_create_files: boolean;
  may_delete_files: boolean;
  may_change_schema: boolean;
  may_change_shared_packages: boolean;
  may_change_config: boolean;
}

export interface ActualChanges {
  files_created: string[];
  files_modified: string[];
  files_deleted: string[];
  total_lines_added: number;
  total_lines_removed: number;
  schema_changed: boolean;
  shared_packages_changed: boolean;
  config_changed: boolean;
}

export interface ScopeDriftViolation {
  type: "path_violation" | "forbidden_path" | "file_type_violation" | "create_violation" | "delete_violation" | "schema_violation" | "shared_package_violation" | "config_violation" | "file_count_exceeded" | "line_count_exceeded";
  detail: string;
  severity: "warning" | "error" | "critical";
  file?: string;
}

export interface ScopeDriftResult {
  clean: boolean;
  drift_score: number; // 0 = no drift, 1 = maximum drift
  violations: ScopeDriftViolation[];
  within_budget: boolean;
  files_budget_used: number; // 0-1
  lines_budget_used: number; // 0-1
}

export function analyzeScopeDrift(scope: ScopeDefinition, actual: ActualChanges): ScopeDriftResult {
  const violations: ScopeDriftViolation[] = [];

  const allChangedFiles = [...actual.files_created, ...actual.files_modified, ...actual.files_deleted];

  // Check each file against allowed paths
  for (const file of allChangedFiles) {
    const inAllowed = scope.allowed_paths.some(p => file.startsWith(p));
    if (!inAllowed) {
      violations.push({
        type: "path_violation",
        detail: `File ${file} is outside allowed scope`,
        severity: "critical",
        file,
      });
    }

    const inForbidden = scope.forbidden_paths.some(p => file.startsWith(p));
    if (inForbidden) {
      violations.push({
        type: "forbidden_path",
        detail: `File ${file} is in a forbidden path`,
        severity: "critical",
        file,
      });
    }
  }

  // Check file types
  if (scope.allowed_file_types.length > 0) {
    for (const file of allChangedFiles) {
      const ext = "." + file.split(".").pop();
      if (!scope.allowed_file_types.includes(ext)) {
        violations.push({
          type: "file_type_violation",
          detail: `File type ${ext} not in allowed types for ${file}`,
          severity: "error",
          file,
        });
      }
    }
  }

  // Check creation permission
  if (!scope.may_create_files && actual.files_created.length > 0) {
    violations.push({
      type: "create_violation",
      detail: `${actual.files_created.length} files created without permission`,
      severity: "critical",
    });
  }

  // Check deletion permission
  if (!scope.may_delete_files && actual.files_deleted.length > 0) {
    violations.push({
      type: "delete_violation",
      detail: `${actual.files_deleted.length} files deleted without permission`,
      severity: "critical",
    });
  }

  // Check schema changes
  if (!scope.may_change_schema && actual.schema_changed) {
    violations.push({
      type: "schema_violation",
      detail: "Schema changed without permission",
      severity: "critical",
    });
  }

  // Check shared package changes
  if (!scope.may_change_shared_packages && actual.shared_packages_changed) {
    violations.push({
      type: "shared_package_violation",
      detail: "Shared packages changed without permission",
      severity: "critical",
    });
  }

  // Check config changes
  if (!scope.may_change_config && actual.config_changed) {
    violations.push({
      type: "config_violation",
      detail: "Config changed without permission",
      severity: "error",
    });
  }

  // Check budgets
  const filesUsed = allChangedFiles.length / Math.max(scope.max_files_changed, 1);
  const linesUsed = (actual.total_lines_added + actual.total_lines_removed) / Math.max(scope.max_lines_changed, 1);

  if (allChangedFiles.length > scope.max_files_changed) {
    violations.push({
      type: "file_count_exceeded",
      detail: `${allChangedFiles.length} files changed, max allowed: ${scope.max_files_changed}`,
      severity: "error",
    });
  }

  if (actual.total_lines_added + actual.total_lines_removed > scope.max_lines_changed) {
    violations.push({
      type: "line_count_exceeded",
      detail: `${actual.total_lines_added + actual.total_lines_removed} lines changed, max allowed: ${scope.max_lines_changed}`,
      severity: "warning",
    });
  }

  // Compute drift score
  const criticalCount = violations.filter(v => v.severity === "critical").length;
  const errorCount = violations.filter(v => v.severity === "error").length;
  const warningCount = violations.filter(v => v.severity === "warning").length;

  const driftScore = Math.min(1, criticalCount * 0.4 + errorCount * 0.2 + warningCount * 0.05);

  return {
    clean: violations.length === 0,
    drift_score: Math.round(driftScore * 1000) / 1000,
    violations,
    within_budget: filesUsed <= 1 && linesUsed <= 1,
    files_budget_used: Math.round(Math.min(filesUsed, 2) * 1000) / 1000,
    lines_budget_used: Math.round(Math.min(linesUsed, 2) * 1000) / 1000,
  };
}
