import { z } from "zod";

// ─── App Classification ───────────────────────────────────────────────

export const AppClass = z.enum([
  "internal_ops_tool",
  "customer_portal",
  "fintech_wallet",
  "digital_banking_portal",
  "banking_operations_system",
  "marketplace",
  "workflow_approval_system",
  "property_management_system",
  "logistics_operations_system",
  "compliance_case_management",
  "other",
]);
export type AppClass = z.infer<typeof AppClass>;

export const RiskClass = z.enum(["low", "medium", "high", "regulated"]);
export type RiskClass = z.infer<typeof RiskClass>;

export const Platform = z.enum(["web", "pwa", "mobile_web", "admin_console"]);
export type Platform = z.infer<typeof Platform>;

export const Priority = z.enum(["critical", "high", "medium", "low"]);
export type Priority = z.infer<typeof Priority>;

// ─── Intent ───────────────────────────────────────────────────────────

export const ConfirmationStatus = z.enum([
  "pending",
  "confirmed",
  "rejected",
  "auto_confirmed_low_ambiguity",
]);
export type ConfirmationStatus = z.infer<typeof ConfirmationStatus>;

export const AmbiguityFlag = z.enum([
  "ambiguous_app_class",
  "ambiguous_primary_user",
  "ambiguous_platform",
  "ambiguous_core_workflow",
  "ambiguous_integration",
  "regulated_scope_unclear",
  "delivery_boundary_unclear",
]);
export type AmbiguityFlag = z.infer<typeof AmbiguityFlag>;

// ─── Domain Modeling ──────────────────────────────────────────────────

export const ActorType = z.enum([
  "end_user",
  "admin",
  "operator",
  "system",
  "external_partner",
]);
export type ActorType = z.infer<typeof ActorType>;

export const EntityFieldType = z.enum([
  "string",
  "number",
  "boolean",
  "date",
  "datetime",
  "enum",
  "json",
  "currency",
  "email",
  "phone",
  "id",
]);
export type EntityFieldType = z.infer<typeof EntityFieldType>;

export const RoleScope = z.enum([
  "global",
  "org",
  "team",
  "account",
  "record",
  "self",
]);
export type RoleScope = z.infer<typeof RoleScope>;

export const PermissionEffect = z.enum([
  "read",
  "create",
  "update",
  "delete",
  "approve",
  "export",
  "manage",
]);
export type PermissionEffect = z.infer<typeof PermissionEffect>;

// ─── Features ─────────────────────────────────────────────────────────

export const FeatureStatus = z.enum([
  "proposed",
  "approved",
  "blocked",
  "deferred",
]);
export type FeatureStatus = z.infer<typeof FeatureStatus>;

// ─── Workflows ────────────────────────────────────────────────────────

export const WorkflowStepType = z.enum([
  "create",
  "review",
  "approve",
  "reject",
  "submit",
  "assign",
  "notify",
  "reconcile",
  "archive",
  "system",
]);
export type WorkflowStepType = z.infer<typeof WorkflowStepType>;

// ─── Integrations ─────────────────────────────────────────────────────

export const IntegrationType = z.enum([
  "payments",
  "email",
  "sms",
  "storage",
  "maps",
  "identity",
  "analytics",
  "webhook",
  "other",
]);
export type IntegrationType = z.infer<typeof IntegrationType>;

// ─── Requirements ─────────────────────────────────────────────────────

export const RequirementCategory = z.enum([
  "security",
  "performance",
  "availability",
  "auditability",
  "compliance",
  "usability",
  "offline_behavior",
  "responsiveness",
]);
export type RequirementCategory = z.infer<typeof RequirementCategory>;

// ─── Testing ──────────────────────────────────────────────────────────

export const AcceptanceTestType = z.enum([
  "user_journey",
  "permission",
  "integration",
  "validation",
  "responsive_ui",
  "offline_behavior",
  "audit",
]);
export type AcceptanceTestType = z.infer<typeof AcceptanceTestType>;

export const TestType = z.enum([
  "unit",
  "integration",
  "workflow",
  "permission",
  "responsive_ui",
  "offline_behavior",
  "audit",
  "e2e",
]);
export type TestType = z.infer<typeof TestType>;

// ─── Dependencies ─────────────────────────────────────────────────────

export const DependencyType = z.enum(["requires", "blocks", "extends"]);
export type DependencyType = z.infer<typeof DependencyType>;

export const DependencyStatus = z.enum([
  "required",
  "satisfied",
  "blocked",
]);
export type DependencyStatus = z.infer<typeof DependencyStatus>;

// ─── Bridge ───────────────────────────────────────────────────────────

export const BridgeStatus = z.enum([
  "draft",
  "validated",
  "blocked",
  "approved",
  "executing",
  "failed",
  "passed",
]);
export type BridgeStatus = z.infer<typeof BridgeStatus>;

export const ReuseAssetType = z.enum([
  "ui_component",
  "domain_module",
  "workflow_pattern",
  "integration_adapter",
  "template_fragment",
  "test_pattern",
]);
export type ReuseAssetType = z.infer<typeof ReuseAssetType>;

export const RuleSeverity = z.enum(["info", "warn", "error", "critical"]);
export type RuleSeverity = z.infer<typeof RuleSeverity>;

// ─── Hard Vetoes ──────────────────────────────────────────────────────

export const HardVetoCode = z.enum([
  "AUTH_NOT_DEFINED",
  "ROLE_BOUNDARY_NOT_DEFINED",
  "TENANCY_BOUNDARY_NOT_DEFINED",
  "DESTRUCTIVE_ACTION_WITHOUT_SCOPE",
  "PAYMENT_WITHOUT_RECONCILIATION",
  "ADMIN_WITHOUT_ROLE_BOUNDARY",
  "EXTERNAL_API_WITHOUT_FALLBACK",
  "REAL_TIME_WITHOUT_OFFLINE_STATE",
  "AUDITABLE_ACTION_WITHOUT_AUDIT_LOG",
  "DATA_MUTATION_WITHOUT_OWNERSHIP_RULE",
  "FEATURE_DEPENDS_ON_UNDEFINED_FEATURE",
]);
export type HardVetoCode = z.infer<typeof HardVetoCode>;

// ─── Catalog ──────────────────────────────────────────────────────────

export const CatalogAdmissionDecision = z.enum([
  "ADMIT_SHARED",
  "REJECT_INCOMPLETE",
  "REJECT_APP_LOCAL_ONLY",
  "REQUIRES_HARDENING",
]);
export type CatalogAdmissionDecision = z.infer<typeof CatalogAdmissionDecision>;

export const PromotionTier = z.enum([
  "DERIVED",
  "VERIFIED",
  "CANONICAL",
]);
export type PromotionTier = z.infer<typeof PromotionTier>;

// ─── FixTrail ─────────────────────────────────────────────────────────

export const FailureType = z.enum([
  "type_error",
  "test_failure",
  "permission_failure",
  "workflow_gap",
  "missing_dependency",
  "api_integration_failure",
  "ui_state_failure",
  "deployment_failure",
  "offline_state_gap",
  "fallback_gap",
]);
export type FailureType = z.infer<typeof FailureType>;

export const RootCauseCategory = z.enum([
  "spec_gap",
  "bridge_gap",
  "catalog_mismatch",
  "builder_regression",
  "integration_assumption",
  "environment_issue",
  "validator_miss",
  "rule_missing",
]);
export type RootCauseCategory = z.infer<typeof RootCauseCategory>;

export const ResolutionAction = z.enum([
  "update_spec",
  "patch_bridge",
  "replace_reuse_candidate",
  "add_fallback",
  "add_offline_state",
  "add_test",
  "narrow_scope",
  "add_rule",
  "fix_template",
  "rollback_change",
]);
export type ResolutionAction = z.infer<typeof ResolutionAction>;

export const BuildStage = z.enum([
  "decomposition",
  "bridge_compile",
  "build_execution",
  "validation",
  "pr_check",
  "deploy",
  "post_deploy",
]);
export type BuildStage = z.infer<typeof BuildStage>;

export const Severity = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const FirstDetector = z.enum([
  "builder",
  "validator",
  "test_runner",
  "deploy_check",
  "runtime_monitor",
  "human_review",
]);
export type FirstDetector = z.infer<typeof FirstDetector>;

export const ValidationAfterFix = z.enum(["passed", "failed", "partial"]);
export type ValidationAfterFix = z.infer<typeof ValidationAfterFix>;

// ─── State Machines ───────────────────────────────────────────────────

export const AppPlanState = z.enum([
  "intent_received",
  "intent_confirmed",
  "spec_generating",
  "spec_blocked",
  "spec_validated",
  "awaiting_user_approval",
  "approved_for_build",
  "building",
  "partially_blocked",
  "deployed",
  "failed",
  "archived",
]);
export type AppPlanState = z.infer<typeof AppPlanState>;

export const AppPlanTransitionAuthority = z.enum([
  "intent_classifier",
  "intent_confirmation_service",
  "spec_orchestrator",
  "spec_validator",
  "user",
  "orchestrator",
  "build_monitor",
  "deployment_validator",
]);
export type AppPlanTransitionAuthority = z.infer<typeof AppPlanTransitionAuthority>;

export const BridgeTransitionAuthority = z.enum([
  "bridge_compiler",
  "bridge_validator",
  "policy_engine",
  "dependency_resolver",
  "orchestrator_dispatcher",
  "validator_aggregate",
  "repair_compiler",
]);
export type BridgeTransitionAuthority = z.infer<typeof BridgeTransitionAuthority>;
