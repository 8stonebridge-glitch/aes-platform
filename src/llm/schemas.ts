import { z } from "zod";

// ─── IntentBrief Schema ─────────────────────────────────────────────────
// Mirrors the IntentBrief type from src/types/artifacts.ts.
// Used with LangChain's withStructuredOutput() for Gate 0 LLM classification.

export const IntentBriefSchema = z.object({
  inferred_app_class: z
    .enum([
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
    ])
    .describe("The type of application being requested"),
  inferred_primary_users: z
    .array(z.string())
    .min(1)
    .describe("Primary user personas who will use this app"),
  inferred_core_outcome: z
    .string()
    .describe("The main outcome or value this app delivers"),
  inferred_platforms: z
    .array(z.enum(["web", "pwa", "admin_console"]))
    .describe("Target platforms. Must always include 'web'"),
  inferred_risk_class: z
    .enum(["regulated", "high", "medium", "low"])
    .describe(
      "Risk classification. Use 'regulated' for anything involving money, banking, or financial compliance"
    ),
  inferred_integrations: z
    .array(
      z.enum(["payments", "email", "sms", "storage", "maps", "analytics"])
    )
    .describe("External integrations needed"),
  explicit_inclusions: z
    .array(z.string())
    .describe("Features or requirements the user explicitly asked for"),
  explicit_exclusions: z
    .array(z.string())
    .describe("Features or requirements the user explicitly excluded"),
  ambiguity_flags: z
    .array(z.string())
    .describe(
      "Areas where the request is unclear. Empty array if the intent is clear"
    ),
  assumptions: z
    .array(z.string())
    .describe("Assumptions made to fill gaps in the request"),
  confirmation_statement: z
    .string()
    .describe(
      "A human-readable summary of the classified intent for user confirmation"
    ),
});

// ─── AppSpec Sub-schemas ──────────────────────────────────────────────────

const DestructiveActionSchema = z.object({
  action_name: z.string(),
  reversible: z.boolean(),
  confirmation_required: z.boolean(),
  audit_logged: z.boolean(),
});

const FeatureSchema = z.object({
  feature_id: z.string().describe("Snake_case with 'f_' prefix, e.g. 'f_dashboard'"),
  name: z.string(),
  summary: z.string(),
  description: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  status: z.literal("proposed"),
  actor_ids: z
    .array(z.string())
    .min(1)
    .describe("Must reference valid actor_ids or role_ids"),
  entity_ids: z.array(z.string()),
  user_problem: z.string(),
  outcome: z.string().min(1),
  destructive_actions: z.array(DestructiveActionSchema),
  audit_required: z.boolean(),
  offline_behavior_required: z.boolean(),
  external_dependencies: z.array(z.string()),
});

const RoleSchema = z.object({
  role_id: z.string().describe("Snake_case, e.g. 'admin', 'submitter'"),
  name: z.string(),
  description: z.string(),
  scope: z.enum(["global", "org", "account", "self"]),
  inherits_from: z.array(z.string()),
});

const PermissionSchema = z.object({
  permission_id: z
    .string()
    .describe("'p_' prefix, e.g. 'p_admin_read_dashboard'"),
  role_id: z.string().describe("Must reference a declared role_id"),
  resource: z.string().describe("Must be a valid feature_id"),
  effect: z.enum(["allow", "deny"]),
  condition: z.string().optional(),
});

const ActorSchema = z.object({
  actor_id: z.string(),
  name: z.string(),
  actor_type: z.enum(["admin", "end_user", "operator", "system"]),
  role_ids: z.array(z.string()),
  description: z.string(),
});

const IntegrationSchema = z.object({
  integration_id: z.string().describe("'int_' prefix, e.g. 'int_email'"),
  name: z.string(),
  type: z.string(),
  provider: z.string(),
  purpose: z.string(),
  fallback_defined: z.literal(true),
  fallback_behavior: z.string().optional(),
  retry_policy_defined: z.boolean(),
  user_visible_failure_state: z.string().optional(),
});

const AcceptanceTestSchema = z.object({
  test_id: z.string().describe("'t_' prefix, e.g. 't_dashboard_happy_path'"),
  name: z.string(),
  type: z.enum(["user_journey", "permission", "audit", "integration"]),
  feature_id: z.string(),
  description: z.string(),
  pass_condition: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
});

const DependencyEdgeSchema = z.object({
  from_feature_id: z.string(),
  to_feature_id: z.string(),
  type: z.enum(["requires", "enhances", "blocks"]),
  reason: z.string(),
});

const ConfidenceSchema = z.object({
  overall: z.number().min(0).max(1),
  intent_clarity: z.number().min(0).max(1),
  scope_completeness: z.number().min(0).max(1),
  dependency_clarity: z.number().min(0).max(1),
  integration_clarity: z.number().min(0).max(1),
  compliance_clarity: z.number().min(0).max(1),
  notes: z.array(z.string()),
});

// ─── AppSpec Schema ──────────────────────────────────────────────────────
// Mirrors the AppSpec type from src/types/artifacts.ts (LLM-generated fields only).
// System-level fields (app_id, request_id, timestamps, etc.) are added after LLM call.

export const AppSpecSchema = z.object({
  title: z.string().describe("Human-readable app title"),
  summary: z.string().describe("One-sentence summary of the app"),
  app_class: z.string().describe("Same as the intent brief's inferred_app_class"),
  risk_class: z.string().describe("Same as the intent brief's inferred_risk_class"),
  target_users: z.array(z.string()).describe("Target user types"),
  platforms: z.array(z.string()).describe("Target platforms"),
  actors: z.array(ActorSchema),
  roles: z.array(RoleSchema),
  permissions: z.array(PermissionSchema),
  features: z.array(FeatureSchema),
  integrations: z.array(IntegrationSchema),
  acceptance_tests: z.array(AcceptanceTestSchema),
  dependency_graph: z.array(DependencyEdgeSchema),
  confidence: ConfidenceSchema,
});
