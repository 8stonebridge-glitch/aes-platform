/**
 * Canonical artifact types for AES v12.
 * These are the frozen shapes that nodes produce and persistence consumes.
 * Every field is concrete — no `any`.
 */
export declare const CURRENT_SCHEMA_VERSION = 1;
export declare enum GateErrorCode {
    G1_FEATURES_WITHOUT_ACTORS = "G1_FEATURES_WITHOUT_ACTORS",
    G1_FEATURES_WITHOUT_OUTCOMES = "G1_FEATURES_WITHOUT_OUTCOMES",
    G1_WORKFLOWS_INVALID_FEATURES = "G1_WORKFLOWS_INVALID_FEATURES",
    G1_PERMISSIONS_INVALID_ROLES = "G1_PERMISSIONS_INVALID_ROLES",
    G1_PERMISSIONS_UNDEFINED_RESOURCES = "G1_PERMISSIONS_UNDEFINED_RESOURCES",
    G1_UNDEFINED_FEATURE_DEPENDENCIES = "G1_UNDEFINED_FEATURE_DEPENDENCIES",
    G1_CRITICAL_FEATURES_NO_TESTS = "G1_CRITICAL_FEATURES_NO_TESTS",
    G1_INTEGRATIONS_NO_FALLBACK = "G1_INTEGRATIONS_NO_FALLBACK",
    G1_AUDIT_FEATURES_NO_REQUIREMENTS = "G1_AUDIT_FEATURES_NO_REQUIREMENTS",
    G1_OFFLINE_FEATURES_NO_REQUIREMENTS = "G1_OFFLINE_FEATURES_NO_REQUIREMENTS",
    G1_ACTORS_WITHOUT_ROLES = "G1_ACTORS_WITHOUT_ROLES",
    G2_NO_SINGLE_FEATURE_TARGET = "G2_NO_SINGLE_FEATURE_TARGET",
    G2_SCOPE_NOT_EXPLICIT = "G2_SCOPE_NOT_EXPLICIT",
    G2_WRITE_SCOPE_UNBOUNDED = "G2_WRITE_SCOPE_UNBOUNDED",
    G2_FORBIDDEN_PATHS_IN_SCOPE = "G2_FORBIDDEN_PATHS_IN_SCOPE",
    G2_UNRESOLVED_DEPENDENCIES = "G2_UNRESOLVED_DEPENDENCIES",
    G2_MISSING_CRITICAL_RULES = "G2_MISSING_CRITICAL_RULES",
    G2_MISSING_REQUIRED_TESTS = "G2_MISSING_REQUIRED_TESTS",
    G2_MISSING_REUSE_ASSETS = "G2_MISSING_REUSE_ASSETS",
    G2_TRIGGERED_HARD_VETOES = "G2_TRIGGERED_HARD_VETOES",
    G2_NO_SUCCESS_DEFINITION = "G2_NO_SUCCESS_DEFINITION",
    G2_CATALOG_ASSETS_NOT_USED = "G2_CATALOG_ASSETS_NOT_USED",
    G2_RAW_PRIMITIVE_VIOLATION = "G2_RAW_PRIMITIVE_VIOLATION",
    G2_PATTERN_CONFORMANCE_FAIL = "G2_PATTERN_CONFORMANCE_FAIL",
    G3_AUTH_NOT_DEFINED = "G3_AUTH_NOT_DEFINED",
    G3_ROLE_BOUNDARY_NOT_DEFINED = "G3_ROLE_BOUNDARY_NOT_DEFINED",
    G3_TENANCY_BOUNDARY_NOT_DEFINED = "G3_TENANCY_BOUNDARY_NOT_DEFINED",
    G3_DESTRUCTIVE_ACTION_WITHOUT_SCOPE = "G3_DESTRUCTIVE_ACTION_WITHOUT_SCOPE",
    G3_PAYMENT_WITHOUT_RECONCILIATION = "G3_PAYMENT_WITHOUT_RECONCILIATION",
    G3_ADMIN_WITHOUT_ROLE_BOUNDARY = "G3_ADMIN_WITHOUT_ROLE_BOUNDARY",
    G3_EXTERNAL_API_WITHOUT_FALLBACK = "G3_EXTERNAL_API_WITHOUT_FALLBACK",
    G3_REAL_TIME_WITHOUT_OFFLINE_STATE = "G3_REAL_TIME_WITHOUT_OFFLINE_STATE",
    G3_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG = "G3_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG",
    G3_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE = "G3_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE",
    G3_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE = "G3_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE"
}
export interface IntentBrief {
    request_id: string;
    raw_request: string;
    inferred_app_class: string;
    inferred_primary_users: string[];
    inferred_core_outcome: string;
    inferred_platforms: string[];
    inferred_risk_class: string;
    inferred_integrations: string[];
    explicit_inclusions: string[];
    explicit_exclusions: string[];
    ambiguity_flags: string[];
    assumptions: string[];
    confirmation_statement: string;
    confirmation_status: "pending" | "confirmed" | "rejected" | "auto_confirmed_low_ambiguity";
    schema_version: number;
    created_at: string;
    updated_at: string;
}
export interface AppActor {
    actor_id: string;
    name: string;
    description: string;
    actor_type: string;
}
export interface DestructiveAction {
    action_name: string;
    reversible: boolean;
    confirmation_required: boolean;
    audit_logged: boolean;
}
export interface Feature {
    feature_id: string;
    name: string;
    summary: string;
    description: string;
    priority: string;
    status: string;
    actor_ids: string[];
    entity_ids: string[];
    user_problem: string;
    outcome: string;
    destructive_actions: DestructiveAction[];
    audit_required: boolean;
    offline_behavior_required: boolean;
    external_dependencies: string[];
}
export interface Role {
    role_id: string;
    name: string;
    description: string;
    scope: string;
    inherits_from: string[];
}
export interface Permission {
    permission_id: string;
    role_id: string;
    resource: string;
    effect: string;
    condition?: string;
}
export interface Integration {
    integration_id: string;
    name: string;
    type: string;
    provider: string;
    purpose: string;
    fallback_defined: boolean;
    fallback_behavior?: string;
    retry_policy_defined: boolean;
    user_visible_failure_state?: string;
}
export interface AcceptanceTest {
    test_id: string;
    name: string;
    type: string;
    feature_id: string;
    description: string;
    pass_condition: string;
    priority: string;
}
export interface DependencyEdge {
    from_feature_id: string;
    to_feature_id: string;
    type: string;
    reason: string;
}
export interface Confidence {
    overall: number;
    intent_clarity: number;
    scope_completeness: number;
    dependency_clarity: number;
    integration_clarity: number;
    compliance_clarity: number;
    notes: string[];
}
export interface AppSpec {
    app_id: string;
    request_id: string;
    intent_brief_id: string;
    title: string;
    summary: string;
    app_class: string;
    risk_class: string;
    target_users: string[];
    platforms: string[];
    actors: AppActor[];
    domain_entities: unknown[];
    roles: Role[];
    permissions: Permission[];
    features: Feature[];
    workflows: unknown[];
    integrations: Integration[];
    non_functional_requirements: unknown[];
    compliance_requirements: unknown[];
    design_constraints: unknown[];
    acceptance_tests: AcceptanceTest[];
    dependency_graph: DependencyEdge[];
    risks: unknown[];
    confidence: Confidence;
    schema_version: number;
    created_at: string;
    updated_at: string;
}
export interface ValidationResult {
    code: GateErrorCode | string;
    passed: boolean;
    reason?: string;
    schema_version?: number;
}
export interface BuildScope {
    objective: string;
    included_capabilities: string[];
    excluded_capabilities: string[];
    acceptance_boundary: string;
}
export interface ReadScope {
    allowed_repo_paths: string[];
    allowed_packages: string[];
    allowed_features: string[];
    allowed_graph_nodes: string[];
    allowed_artifacts: string[];
}
export interface WriteScope {
    target_repo: string;
    allowed_repo_paths: string[];
    forbidden_repo_paths: string[];
    may_create_files: boolean;
    may_modify_existing_files: boolean;
    may_delete_files: boolean;
    may_change_shared_packages: boolean;
    may_change_schema: boolean;
}
export interface ReuseCandidate {
    candidate_id: string;
    asset_type: string;
    source_repo: string;
    source_path: string;
    name: string;
    description: string;
    fit_reason: string;
    constraints: string[];
    selected: boolean;
}
export interface AppliedRule {
    rule_id: string;
    title: string;
    description: string;
    severity: string;
    rationale: string;
}
export interface RequiredTest {
    test_id: string;
    name: string;
    type: string;
    description: string;
    pass_condition: string;
}
export interface BridgeDependency {
    dependency_id: string;
    feature_id: string;
    reason: string;
    status: "required" | "satisfied" | "blocked";
}
export interface ConfidenceBreakdown {
    scope_clarity: number;
    reuse_fit: number;
    dependency_clarity: number;
    rule_coverage: number;
    test_coverage: number;
    overall: number;
    notes: string[];
}
export interface FeatureBridge {
    bridge_id: string;
    app_id: string;
    app_spec_id: string;
    feature_id: string;
    feature_name: string;
    status: "draft" | "validated" | "blocked" | "approved" | "executing" | "failed" | "passed";
    build_scope: BuildScope;
    read_scope: ReadScope;
    write_scope: WriteScope;
    reuse_candidates: ReuseCandidate[];
    selected_reuse_assets: string[];
    applied_rules: AppliedRule[];
    required_tests: RequiredTest[];
    dependencies: BridgeDependency[];
    hard_vetoes: VetoResult[];
    blocked_reason: string | null;
    success_definition: {
        user_visible_outcome: string;
        technical_outcome: string;
        validation_requirements: string[];
    };
    confidence: ConfidenceBreakdown;
    schema_version: number;
    created_at: string;
    updated_at: string;
}
export interface VetoResult {
    code: GateErrorCode | string;
    triggered: boolean;
    reason: string;
    required_fix: string;
    blocking_feature_ids: string[];
    schema_version?: number;
}
export interface ApprovalRecord {
    job_id: string;
    app_spec_id: string;
    approval_type: "intent_confirmation" | "app_plan_approval" | "build_merge_approval";
    approved: boolean;
    user_comment?: string;
    schema_version: number;
    created_at: string;
}
export interface LogEntry {
    timestamp: string;
    gate?: string;
    feature_id?: string;
    message: string;
    level: "info" | "warn" | "error" | "success";
    error_code?: GateErrorCode | string;
    schema_version?: number;
}
export interface FixTrailEntry {
    fix_id: string;
    job_id: string;
    gate: string;
    error_code: string;
    issue_summary: string;
    root_cause: string;
    repair_action: string;
    status: "detected" | "repairing" | "repaired" | "unresolved" | "escalated";
    related_artifact_ids: string[];
    schema_version: number;
    created_at: string;
    resolved_at: string | null;
}
export interface CheckResult {
    check: string;
    passed: boolean;
    output: string;
    duration_ms: number;
    skipped: boolean;
    skip_reason?: string;
}
export type BuilderRunStatus = "ready_for_build" | "building" | "build_failed" | "build_succeeded" | "build_rejected" | "build_approved";
export interface BuilderRunRecord {
    run_id: string;
    job_id: string;
    bridge_id: string;
    feature_id: string;
    feature_name: string;
    status: BuilderRunStatus;
    input_package_hash: string;
    builder_package: any;
    files_created: string[];
    files_modified: string[];
    files_deleted: string[];
    test_results: {
        test_id: string;
        passed: boolean;
        output?: string;
    }[];
    acceptance_coverage: {
        total_required: number;
        covered: number;
        missing: string[];
    };
    check_results: CheckResult[];
    scope_violations: string[];
    constraint_violations: string[];
    verification_passed: boolean;
    failure_reason: string | null;
    builder_model: string;
    duration_ms: number;
    schema_version: number;
    created_at: string;
    completed_at: string | null;
    workspace_id: string | null;
    branch: string | null;
    base_commit: string | null;
    final_commit: string | null;
    diff_summary: string | null;
    pr_summary: string | null;
}
export interface CatalogMatch {
    candidate_id: string;
    asset_type: string;
    source_repo: string;
    source_path: string;
    name: string;
    description: string;
    fit_reason: string;
    constraints: string[];
    selected: boolean;
    score: number;
}
