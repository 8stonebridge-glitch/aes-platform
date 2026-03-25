import { z } from "zod";

export const VetoCodeSchema = z.enum([
  // Existing from v12
  "VETO_AUTH_NOT_DEFINED",
  "VETO_ROLE_BOUNDARY_NOT_DEFINED",
  "VETO_TENANCY_BOUNDARY_NOT_DEFINED",
  "VETO_DESTRUCTIVE_ACTION_WITHOUT_SCOPE",
  "VETO_PAYMENT_WITHOUT_RECONCILIATION",
  "VETO_ADMIN_WITHOUT_ROLE_BOUNDARY",
  "VETO_EXTERNAL_API_WITHOUT_FALLBACK",
  "VETO_REAL_TIME_WITHOUT_OFFLINE_STATE",
  "VETO_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG",
  "VETO_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE",
  "VETO_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE",
  // Math layer additions
  "VETO_CRITICAL_CONTRADICTION",
  "VETO_STALE_BRIDGE",
  "VETO_MISSING_DEPENDENCY",
  "VETO_SCOPE_VIOLATION",
  "VETO_MISSING_ACCEPTANCE_TESTS",
  "VETO_VALIDATOR_FAILURE",
  "VETO_CONFIDENCE_BELOW_MINIMUM",
  "VETO_ZERO_DIMENSION",
]);

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
  // Existing v12 vetoes
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

export function evaluateVetoes(input: VetoInput): VetoEvaluation {
  const results: VetoResult[] = [];

  function check(code: VetoCode, triggered: boolean, reason: string, fix: string) {
    results.push({ code, triggered, reason: triggered ? reason : "OK", required_fix: triggered ? fix : "N/A" });
  }

  // Math layer vetoes
  check("VETO_CONFIDENCE_BELOW_MINIMUM", input.confidence_composite < 0.30,
    `Confidence ${input.confidence_composite} is below absolute minimum 0.30`,
    "Improve evidence, resolve contradictions, add tests");

  check("VETO_ZERO_DIMENSION", Object.values(input.confidence_dimensions).some(v => v === 0),
    `One or more confidence dimensions is zero: ${Object.entries(input.confidence_dimensions).filter(([, v]) => v === 0).map(([k]) => k).join(", ")}`,
    "No dimension may be zero — address the gap");

  check("VETO_CRITICAL_CONTRADICTION", input.has_critical_contradictions,
    `${input.contradiction_count} critical contradictions found`,
    "Resolve all critical contradictions before proceeding");

  check("VETO_STALE_BRIDGE", input.bridge_age_days > input.max_bridge_age_days,
    `Bridge is ${input.bridge_age_days} days old (max: ${input.max_bridge_age_days})`,
    "Recompile bridge with fresh evidence");

  check("VETO_MISSING_DEPENDENCY", input.unresolved_dependencies > 0,
    `${input.unresolved_dependencies} unresolved dependencies`,
    "Resolve or explicitly defer all dependencies");

  check("VETO_SCOPE_VIOLATION", input.scope_violations.length > 0,
    `${input.scope_violations.length} scope violations: ${input.scope_violations.slice(0, 3).join(", ")}`,
    "Remove unauthorized changes or expand approved scope");

  check("VETO_MISSING_ACCEPTANCE_TESTS",
    input.total_acceptance_tests > 0 && input.missing_acceptance_tests / input.total_acceptance_tests > 0.5,
    `${input.missing_acceptance_tests}/${input.total_acceptance_tests} acceptance tests missing`,
    "Add required acceptance tests");

  check("VETO_VALIDATOR_FAILURE", input.validator_failures.length > 0,
    `${input.validator_failures.length} validator failures: ${input.validator_failures.slice(0, 3).join(", ")}`,
    "Fix all validator failures");

  // Existing v12 vetoes
  check("VETO_AUTH_NOT_DEFINED", !input.auth_defined,
    "Auth model not defined", "Define auth model");
  check("VETO_ROLE_BOUNDARY_NOT_DEFINED", !input.role_boundary_defined,
    "Role boundaries not defined", "Define role boundaries");
  check("VETO_TENANCY_BOUNDARY_NOT_DEFINED", !input.tenancy_boundary_defined,
    "Tenancy boundary not defined", "Define tenancy isolation");
  check("VETO_DESTRUCTIVE_ACTION_WITHOUT_SCOPE", !input.destructive_actions_scoped,
    "Destructive actions not scoped", "Scope all destructive actions");
  check("VETO_PAYMENT_WITHOUT_RECONCILIATION", !input.payment_reconciliation_defined,
    "Payment without reconciliation", "Define reconciliation");
  check("VETO_ADMIN_WITHOUT_ROLE_BOUNDARY", !input.admin_role_bounded,
    "Admin without role boundary", "Define admin boundaries");
  check("VETO_EXTERNAL_API_WITHOUT_FALLBACK", !input.external_api_fallback_defined,
    "External API without fallback", "Define fallback behavior");
  check("VETO_REAL_TIME_WITHOUT_OFFLINE_STATE", !input.realtime_offline_defined,
    "Real-time without offline state", "Define offline behavior");
  check("VETO_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG", !input.auditable_actions_logged,
    "Auditable action without audit log", "Add audit logging");
  check("VETO_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE", !input.data_mutation_ownership_defined,
    "Data mutation without ownership rule", "Define data ownership");
  check("VETO_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE", !input.all_feature_deps_exist,
    "Feature depends on undefined feature", "Define or remove dependency");

  const triggered = results.filter(r => r.triggered);

  return {
    any_triggered: triggered.length > 0,
    triggered_count: triggered.length,
    results,
    blocking_codes: triggered.map(r => r.code),
  };
}
