import { z } from "zod";
export declare const VetoCodeSchema: z.ZodEnum<{
    VETO_AUTH_NOT_DEFINED: "VETO_AUTH_NOT_DEFINED";
    VETO_ROLE_BOUNDARY_NOT_DEFINED: "VETO_ROLE_BOUNDARY_NOT_DEFINED";
    VETO_TENANCY_BOUNDARY_NOT_DEFINED: "VETO_TENANCY_BOUNDARY_NOT_DEFINED";
    VETO_DESTRUCTIVE_ACTION_WITHOUT_SCOPE: "VETO_DESTRUCTIVE_ACTION_WITHOUT_SCOPE";
    VETO_PAYMENT_WITHOUT_RECONCILIATION: "VETO_PAYMENT_WITHOUT_RECONCILIATION";
    VETO_ADMIN_WITHOUT_ROLE_BOUNDARY: "VETO_ADMIN_WITHOUT_ROLE_BOUNDARY";
    VETO_EXTERNAL_API_WITHOUT_FALLBACK: "VETO_EXTERNAL_API_WITHOUT_FALLBACK";
    VETO_REAL_TIME_WITHOUT_OFFLINE_STATE: "VETO_REAL_TIME_WITHOUT_OFFLINE_STATE";
    VETO_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG: "VETO_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG";
    VETO_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE: "VETO_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE";
    VETO_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE: "VETO_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE";
    VETO_CRITICAL_CONTRADICTION: "VETO_CRITICAL_CONTRADICTION";
    VETO_STALE_BRIDGE: "VETO_STALE_BRIDGE";
    VETO_MISSING_DEPENDENCY: "VETO_MISSING_DEPENDENCY";
    VETO_SCOPE_VIOLATION: "VETO_SCOPE_VIOLATION";
    VETO_MISSING_ACCEPTANCE_TESTS: "VETO_MISSING_ACCEPTANCE_TESTS";
    VETO_VALIDATOR_FAILURE: "VETO_VALIDATOR_FAILURE";
    VETO_CONFIDENCE_BELOW_MINIMUM: "VETO_CONFIDENCE_BELOW_MINIMUM";
    VETO_ZERO_DIMENSION: "VETO_ZERO_DIMENSION";
}>;
export type VetoCode = z.infer<typeof VetoCodeSchema>;
export interface VetoInput {
    confidence_composite: number;
    confidence_dimensions: Record<string, number>;
    has_critical_contradictions: boolean;
    contradiction_count: number;
    bridge_age_days: number;
    max_bridge_age_days: number;
    unresolved_dependencies: number;
    scope_violations: string[];
    missing_acceptance_tests: number;
    total_acceptance_tests: number;
    validator_failures: string[];
    auth_defined: boolean;
    role_boundary_defined: boolean;
    tenancy_boundary_defined: boolean;
    destructive_actions_scoped: boolean;
    payment_reconciliation_defined: boolean;
    admin_role_bounded: boolean;
    external_api_fallback_defined: boolean;
    realtime_offline_defined: boolean;
    auditable_actions_logged: boolean;
    data_mutation_ownership_defined: boolean;
    all_feature_deps_exist: boolean;
}
export interface VetoResult {
    code: VetoCode;
    triggered: boolean;
    reason: string;
    required_fix: string;
}
export interface VetoEvaluation {
    any_triggered: boolean;
    triggered_count: number;
    results: VetoResult[];
    blocking_codes: VetoCode[];
}
export declare function evaluateVetoes(input: VetoInput): VetoEvaluation;
