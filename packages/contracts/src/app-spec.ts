import { z } from "zod";
import {
  AppClass,
  RiskClass,
  Platform,
  Priority,
  ActorType,
  EntityFieldType,
  RoleScope,
  PermissionEffect,
  FeatureStatus,
  WorkflowStepType,
  IntegrationType,
  RequirementCategory,
  AcceptanceTestType,
  DependencyType,
} from "./enums.js";

// ─── Sub-Schemas ──────────────────────────────────────────────────────

export const AppActorSchema = z.object({
  actor_id: z.string(),
  name: z.string(),
  description: z.string(),
  actor_type: ActorType,
});
export type AppActor = z.infer<typeof AppActorSchema>;

export const EntityFieldSchema = z.object({
  field_id: z.string(),
  name: z.string(),
  type: EntityFieldType,
  required: z.boolean(),
  description: z.string(),
  enum_values: z.array(z.string()).optional(),
  sensitive: z.boolean().default(false),
});
export type EntityField = z.infer<typeof EntityFieldSchema>;

export const DomainEntitySchema = z.object({
  entity_id: z.string(),
  name: z.string(),
  description: z.string(),
  owner_role_ids: z.array(z.string()).default([]),
  fields: z.array(EntityFieldSchema).min(1),
  audit_required: z.boolean().default(false),
  tenancy_scoped: z.boolean().default(false),
});
export type DomainEntity = z.infer<typeof DomainEntitySchema>;

export const RoleSchema = z.object({
  role_id: z.string(),
  name: z.string(),
  description: z.string(),
  scope: RoleScope,
  inherits_from: z.array(z.string()).default([]),
});
export type Role = z.infer<typeof RoleSchema>;

export const PermissionSchema = z.object({
  permission_id: z.string(),
  role_id: z.string(),
  resource: z.string(),
  effect: PermissionEffect,
  condition: z.string().optional(),
});
export type Permission = z.infer<typeof PermissionSchema>;

export const DestructiveActionSchema = z.object({
  action_name: z.string(),
  reversible: z.boolean(),
  confirmation_required: z.boolean(),
  audit_logged: z.boolean(),
});
export type DestructiveAction = z.infer<typeof DestructiveActionSchema>;

export const FeatureSchema = z.object({
  feature_id: z.string(),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  priority: Priority,
  status: FeatureStatus,

  actor_ids: z.array(z.string()).min(1),
  entity_ids: z.array(z.string()).default([]),

  user_problem: z.string(),
  outcome: z.string(),

  destructive_actions: z.array(DestructiveActionSchema).default([]),
  audit_required: z.boolean().default(false),
  offline_behavior_required: z.boolean().default(false),
  external_dependencies: z.array(z.string()).default([]),
});
export type Feature = z.infer<typeof FeatureSchema>;

export const WorkflowStepSchema = z.object({
  step_id: z.string(),
  name: z.string(),
  type: WorkflowStepType,
  actor_id: z.string(),
  description: z.string(),
  feature_id: z.string(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

export const WorkflowSchema = z.object({
  workflow_id: z.string(),
  name: z.string(),
  description: z.string(),
  trigger: z.string(),
  steps: z.array(WorkflowStepSchema).min(1),
  success_outcome: z.string(),
  failure_outcome: z.string(),
});
export type Workflow = z.infer<typeof WorkflowSchema>;

export const IntegrationSchema = z.object({
  integration_id: z.string(),
  name: z.string(),
  type: IntegrationType,
  provider: z.string(),
  purpose: z.string(),

  fallback_defined: z.boolean(),
  fallback_behavior: z.string().optional(),

  retry_policy_defined: z.boolean().default(false),
  user_visible_failure_state: z.string().optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;

export const NonFunctionalRequirementSchema = z.object({
  requirement_id: z.string(),
  category: RequirementCategory,
  title: z.string(),
  description: z.string(),
  measurable_target: z.string(),
  priority: Priority,
});
export type NonFunctionalRequirement = z.infer<typeof NonFunctionalRequirementSchema>;

export const ComplianceRequirementSchema = z.object({
  compliance_id: z.string(),
  title: z.string(),
  description: z.string(),
  applies_to_feature_ids: z.array(z.string()).default([]),
  evidence_required: z.array(z.string()).default([]),
});
export type ComplianceRequirement = z.infer<typeof ComplianceRequirementSchema>;

export const DesignConstraintSchema = z.object({
  constraint_id: z.string(),
  title: z.string(),
  description: z.string(),
  applies_to_feature_ids: z.array(z.string()).default([]),
});
export type DesignConstraint = z.infer<typeof DesignConstraintSchema>;

export const AcceptanceTestSchema = z.object({
  test_id: z.string(),
  name: z.string(),
  type: AcceptanceTestType,
  feature_id: z.string(),
  description: z.string(),
  pass_condition: z.string(),
  priority: Priority,
});
export type AcceptanceTest = z.infer<typeof AcceptanceTestSchema>;

export const DependencyEdgeSchema = z.object({
  from_feature_id: z.string(),
  to_feature_id: z.string(),
  type: DependencyType,
  reason: z.string(),
});
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const RiskSchema = z.object({
  risk_id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  mitigation: z.string(),
  related_feature_ids: z.array(z.string()).default([]),
});
export type Risk = z.infer<typeof RiskSchema>;

export const ConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  intent_clarity: z.number().min(0).max(1),
  scope_completeness: z.number().min(0).max(1),
  dependency_clarity: z.number().min(0).max(1),
  integration_clarity: z.number().min(0).max(1),
  compliance_clarity: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});
export type Confidence = z.infer<typeof ConfidenceSchema>;

// ─── AppSpec — Gate 1 Output ──────────────────────────────────────────

export const AppSpecSchema = z.object({
  app_id: z.string().uuid(),
  request_id: z.string().uuid(),
  intent_brief_id: z.string().uuid(),

  title: z.string().min(1),
  summary: z.string().min(1),
  app_class: AppClass,
  risk_class: RiskClass,

  target_users: z.array(z.string()).min(1),
  platforms: z.array(Platform).min(1),

  actors: z.array(AppActorSchema).min(1),
  domain_entities: z.array(DomainEntitySchema).min(1),
  roles: z.array(RoleSchema).min(1),
  permissions: z.array(PermissionSchema).min(1),

  features: z.array(FeatureSchema).min(1),
  workflows: z.array(WorkflowSchema).default([]),
  integrations: z.array(IntegrationSchema).default([]),

  non_functional_requirements: z.array(NonFunctionalRequirementSchema).default([]),
  compliance_requirements: z.array(ComplianceRequirementSchema).default([]),
  design_constraints: z.array(DesignConstraintSchema).default([]),

  acceptance_tests: z.array(AcceptanceTestSchema).min(1),
  dependency_graph: z.array(DependencyEdgeSchema).default([]),
  risks: z.array(RiskSchema).default([]),

  confidence: ConfidenceSchema,

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type AppSpec = z.infer<typeof AppSpecSchema>;
