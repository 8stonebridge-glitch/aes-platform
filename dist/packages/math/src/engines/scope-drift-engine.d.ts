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
    drift_score: number;
    violations: ScopeDriftViolation[];
    within_budget: boolean;
    files_budget_used: number;
    lines_budget_used: number;
}
export declare function analyzeScopeDrift(scope: ScopeDefinition, actual: ActualChanges): ScopeDriftResult;
