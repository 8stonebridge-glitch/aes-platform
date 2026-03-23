import type { AESStateType } from "../state.js";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

// Templates directory — reads from aes-templates repo
const TEMPLATES_DIR = "/tmp/aes-templates/apps";

interface TemplateData {
  id: string;
  name: string;
  app_class: string;
  description: string;
  baseline_features: string[];
  optional_features: string[];
}

function loadTemplate(appClass: string): TemplateData | null {
  if (!existsSync(TEMPLATES_DIR)) return null;

  const dirs = readdirSync(TEMPLATES_DIR);
  for (const dir of dirs) {
    const yamlPath = join(TEMPLATES_DIR, dir, "template.yaml");
    if (!existsSync(yamlPath)) continue;

    const content = readFileSync(yamlPath, "utf-8");
    const data = parseYaml(content) as TemplateData;
    if (data.app_class === appClass) return data;
  }

  return null;
}

// Map a feature description string into a typed feature object
function featureFromDescription(
  desc: string,
  index: number,
  appClass: string
): any {
  const id = `feat-${String(index + 1).padStart(3, "0")}`;
  const name = desc.replace(/^"(.*)"$/, "$1");

  // Infer properties from the feature name
  const lower = name.toLowerCase();
  const isAudit = lower.includes("audit");
  const isAuth = lower.includes("auth") || lower.includes("role") || lower.includes("permission");
  const isWorkflow = lower.includes("workflow") || lower.includes("approval") || lower.includes("state machine");
  const isNotification = lower.includes("notification") || lower.includes("email");
  const isOffline = lower.includes("offline") || lower.includes("pwa");
  const isPayment = lower.includes("payment") || lower.includes("stripe") || lower.includes("paystack");
  const isForm = lower.includes("form") || lower.includes("submission") || lower.includes("wizard");
  const isTable = lower.includes("queue") || lower.includes("list") || lower.includes("table");
  const isDashboard = lower.includes("dashboard") || lower.includes("overview") || lower.includes("analytics");
  const isSettings = lower.includes("settings") || lower.includes("config");
  const hasDestructiveActions = lower.includes("delete") || lower.includes("reject") || lower.includes("bulk");

  // Determine priority based on position and type
  let priority: string;
  if (isAuth || isWorkflow) priority = "critical";
  else if (index < 3) priority = "high";
  else if (isNotification || isSettings) priority = "low";
  else priority = "medium";

  // Infer actors
  const actors: string[] = ["end_user"];
  if (isAuth || isSettings) actors.push("admin");
  if (isWorkflow) actors.push("reviewer");
  if (isAudit) actors.push("auditor");

  // Destructive actions
  const destructiveActions: any[] = [];
  if (hasDestructiveActions) {
    if (lower.includes("reject")) {
      destructiveActions.push({
        action_name: "reject_request",
        reversible: false,
        confirmation_required: true,
        audit_logged: true,
      });
    }
    if (lower.includes("bulk")) {
      destructiveActions.push({
        action_name: "bulk_action",
        reversible: false,
        confirmation_required: true,
        audit_logged: true,
      });
    }
    if (lower.includes("delete")) {
      destructiveActions.push({
        action_name: "delete_record",
        reversible: false,
        confirmation_required: true,
        audit_logged: true,
      });
    }
  }

  // External dependencies
  const externalDeps: string[] = [];
  if (isNotification) externalDeps.push("email_service");
  if (isPayment) externalDeps.push("payment_provider");

  return {
    feature_id: id,
    name,
    summary: name,
    description: `${name} — auto-derived from template for ${appClass}`,
    priority,
    status: "proposed",
    actor_ids: actors,
    entity_ids: [],
    user_problem: `Users need ${name.toLowerCase()}`,
    outcome: `${name} is functional and accessible`,
    destructive_actions: destructiveActions,
    audit_required: isAudit || isPayment || hasDestructiveActions,
    offline_behavior_required: isOffline,
    external_dependencies: externalDeps,
  };
}

// Build dependency edges — auth and workflow framework must come first
function buildDependencyGraph(features: any[]): any[] {
  const edges: any[] = [];
  const authFeature = features.find((f) =>
    f.name.toLowerCase().includes("role") || f.name.toLowerCase().includes("auth")
  );
  const workflowFeature = features.find((f) =>
    f.name.toLowerCase().includes("state machine") || f.name.toLowerCase().includes("xstate")
  );

  for (const f of features) {
    if (f === authFeature || f === workflowFeature) continue;

    // Everything depends on auth if it exists
    if (authFeature && f.actor_ids.length > 1) {
      edges.push({
        from_feature_id: f.feature_id,
        to_feature_id: authFeature.feature_id,
        type: "requires",
        reason: "Feature has multiple actor types requiring role-gated access",
      });
    }

    // Workflow features depend on the state machine feature
    if (workflowFeature && f.name.toLowerCase().includes("approval")) {
      edges.push({
        from_feature_id: f.feature_id,
        to_feature_id: workflowFeature.feature_id,
        type: "requires",
        reason: "Approval flow requires state machine framework",
      });
    }
  }

  return edges;
}

// Build topological feature order from dependency edges
function topologicalSort(features: any[], edges: any[]): string[] {
  const ids = features.map((f) => f.feature_id);
  const deps = new Map<string, Set<string>>();

  for (const id of ids) deps.set(id, new Set());
  for (const e of edges) {
    deps.get(e.from_feature_id)?.add(e.to_feature_id);
  }

  const sorted: string[] = [];
  const visited = new Set<string>();

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    for (const dep of deps.get(id) || []) {
      visit(dep);
    }
    sorted.push(id);
  }

  for (const id of ids) visit(id);
  return sorted;
}

// Derive roles from app class
function deriveRoles(appClass: string): any[] {
  const rolesByClass: Record<string, any[]> = {
    workflow_approval_system: [
      { role_id: "submitter", name: "Submitter", description: "Can create and submit requests", scope: "org", inherits_from: [] },
      { role_id: "reviewer", name: "Reviewer", description: "Can review and approve/reject requests", scope: "org", inherits_from: ["submitter"] },
      { role_id: "auditor", name: "Auditor", description: "Read-only access to audit trails, request history, and compliance data", scope: "org", inherits_from: [] },
      { role_id: "admin", name: "Admin", description: "Full access including settings and user management", scope: "org", inherits_from: ["reviewer"] },
    ],
    internal_ops_tool: [
      { role_id: "viewer", name: "Viewer", description: "Read-only access to dashboards and data", scope: "org", inherits_from: [] },
      { role_id: "operator", name: "Operator", description: "Can modify operational data", scope: "org", inherits_from: ["viewer"] },
      { role_id: "auditor", name: "Auditor", description: "Read-only access to audit logs, compliance data, and system activity — cannot modify operational data", scope: "org", inherits_from: ["viewer"] },
      { role_id: "admin", name: "Admin", description: "Full access", scope: "org", inherits_from: ["operator"] },
    ],
    customer_portal: [
      { role_id: "customer", name: "Customer", description: "External customer with self-service access", scope: "account", inherits_from: [] },
      { role_id: "support", name: "Support Agent", description: "Can view and manage customer accounts", scope: "org", inherits_from: [] },
      { role_id: "admin", name: "Admin", description: "Full access", scope: "global", inherits_from: ["support"] },
    ],
    fintech_wallet: [
      { role_id: "user", name: "User", description: "Wallet owner", scope: "account", inherits_from: [] },
      { role_id: "support_admin", name: "Support Admin", description: "Can view accounts and manage disputes", scope: "org", inherits_from: [] },
      { role_id: "auditor", name: "Auditor", description: "Read-only access to transaction logs, compliance reports, and financial audit trails", scope: "org", inherits_from: [] },
      { role_id: "super_admin", name: "Super Admin", description: "Full platform access", scope: "global", inherits_from: ["support_admin"] },
    ],
    marketplace: [
      { role_id: "buyer", name: "Buyer", description: "Can browse and purchase", scope: "self", inherits_from: [] },
      { role_id: "seller", name: "Seller", description: "Can list products and manage orders", scope: "account", inherits_from: [] },
      { role_id: "admin", name: "Marketplace Admin", description: "Platform management", scope: "global", inherits_from: [] },
    ],
  };

  return rolesByClass[appClass] || [
    { role_id: "user", name: "User", description: "Standard user", scope: "org", inherits_from: [] },
    { role_id: "auditor", name: "Auditor", description: "Read-only access to audit logs and system activity", scope: "org", inherits_from: [] },
    { role_id: "admin", name: "Admin", description: "Administrator", scope: "org", inherits_from: ["user"] },
  ];
}

// Derive basic permissions from roles and features
function derivePermissions(roles: any[], features: any[]): any[] {
  const permissions: any[] = [];
  let idx = 0;

  for (const role of roles) {
    for (const feature of features) {
      // All roles can read
      permissions.push({
        permission_id: `perm-${String(++idx).padStart(3, "0")}`,
        role_id: role.role_id,
        resource: feature.feature_id,
        effect: "read",
      });

      // Admin can do everything
      if (role.role_id === "admin" || role.role_id === "super_admin") {
        permissions.push({
          permission_id: `perm-${String(++idx).padStart(3, "0")}`,
          role_id: role.role_id,
          resource: feature.feature_id,
          effect: "manage",
        });
      }
    }
  }

  return permissions;
}

// Generate acceptance tests from features
function deriveAcceptanceTests(features: any[]): any[] {
  const tests: any[] = [];
  let idx = 0;

  for (const f of features) {
    tests.push({
      test_id: `test-${String(++idx).padStart(3, "0")}`,
      name: `${f.name} — happy path`,
      type: "user_journey",
      feature_id: f.feature_id,
      description: `Verify ${f.name.toLowerCase()} works end-to-end for the primary actor`,
      pass_condition: `${f.outcome}`,
      priority: f.priority,
    });

    if (f.actor_ids.length > 1) {
      tests.push({
        test_id: `test-${String(++idx).padStart(3, "0")}`,
        name: `${f.name} — role restriction`,
        type: "permission",
        feature_id: f.feature_id,
        description: `Verify unauthorized roles cannot access ${f.name.toLowerCase()}`,
        pass_condition: "Unauthorized users see access denied, not the feature",
        priority: "high",
      });
    }

    if (f.audit_required) {
      tests.push({
        test_id: `test-${String(++idx).padStart(3, "0")}`,
        name: `${f.name} — audit logging`,
        type: "audit",
        feature_id: f.feature_id,
        description: `Verify all actions in ${f.name.toLowerCase()} are logged`,
        pass_condition: "Audit log contains entry for each mutation",
        priority: "high",
      });
    }
  }

  return tests;
}

export async function decomposer(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.intentBrief || !state.intentConfirmed) {
    cb?.onFail("Cannot decompose — intent not confirmed");
    return {
      currentGate: "failed" as const,
      errorMessage: "Intent not confirmed before decomposition",
    };
  }

  const brief = state.intentBrief;
  const appClass = brief.inferred_app_class;

  cb?.onGate("gate_1", "Decomposing AppSpec...");
  store.addLog(state.jobId, { gate: "gate_1", message: `Decomposing ${appClass}` });

  // Load template
  const template = loadTemplate(appClass);
  if (!template) {
    cb?.onWarn(`No template found for ${appClass} — using minimal defaults`);
    store.addLog(state.jobId, {
      gate: "gate_1",
      message: `No template for ${appClass}, using defaults`,
    });
  }

  // Derive features from template or defaults
  const featureDescriptions = template?.baseline_features || [
    "User dashboard",
    "Settings page",
    "Role-based access control",
  ];

  const features = featureDescriptions.map((desc, i) =>
    featureFromDescription(desc, i, appClass)
  );

  cb?.onStep(`${features.length} features derived`);

  // Derive roles, permissions, tests, dependencies
  const roles = deriveRoles(appClass);
  const permissions = derivePermissions(roles, features);
  const dependencyGraph = buildDependencyGraph(features);
  const acceptanceTests = deriveAcceptanceTests(features);
  const buildOrder = topologicalSort(features, dependencyGraph);

  cb?.onStep(`${roles.length} roles`);
  cb?.onStep(`${permissions.length} permissions`);
  cb?.onStep(`${dependencyGraph.length} dependency edges`);
  cb?.onStep(`${acceptanceTests.length} acceptance tests`);

  // Build actors from roles
  const actors = roles.map((r) => ({
    actor_id: r.role_id,
    name: r.name,
    description: r.description,
    actor_type: r.role_id === "admin" || r.role_id === "super_admin"
      ? "admin"
      : r.scope === "account" || r.scope === "self"
        ? "end_user"
        : "operator",
  }));

  // Confidence scoring
  const confidence = {
    overall: template ? 0.85 : 0.6,
    intent_clarity: state.intentBrief.ambiguity_flags.length === 0 ? 0.95 : 0.7,
    scope_completeness: template ? 0.85 : 0.5,
    dependency_clarity: 0.9,
    integration_clarity: brief.inferred_integrations.length > 0 ? 0.8 : 0.95,
    compliance_clarity: brief.inferred_risk_class === "regulated" ? 0.6 : 0.9,
    notes: template
      ? [`Derived from template: ${template.id}`]
      : ["No template match — using minimal defaults"],
  };

  const appSpec = {
    app_id: randomUUID(),
    request_id: brief.request_id,
    intent_brief_id: brief.request_id,
    title: `${brief.inferred_app_class.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
    summary: brief.inferred_core_outcome,
    app_class: appClass,
    risk_class: brief.inferred_risk_class,
    target_users: brief.inferred_primary_users,
    platforms: brief.inferred_platforms,
    actors,
    domain_entities: [], // Will be populated by a more detailed decomposer later
    roles,
    permissions,
    features,
    workflows: [],
    integrations: brief.inferred_integrations.map((type: string, i: number) => ({
      integration_id: `int-${String(i + 1).padStart(3, "0")}`,
      name: type,
      type,
      provider: type === "payments" ? "stripe" : type,
      purpose: `${type} integration`,
      fallback_defined: false,
      retry_policy_defined: false,
    })),
    non_functional_requirements: [],
    compliance_requirements: [],
    design_constraints: [],
    acceptance_tests: acceptanceTests,
    dependency_graph: dependencyGraph,
    risks: [],
    confidence,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.addLog(state.jobId, {
    gate: "gate_1",
    message: `AppSpec generated: ${features.length} features, ${roles.length} roles, confidence ${(confidence.overall * 100).toFixed(0)}%`,
  });

  // Report features
  for (const f of features) {
    cb?.onFeatureStatus(f.feature_id, f.name, f.status);
  }

  cb?.onSuccess(
    `AppSpec: ${features.length} features, ${roles.length} roles, ${acceptanceTests.length} tests, ${(confidence.overall * 100).toFixed(0)}% confidence`
  );

  return {
    appSpec,
    currentGate: "gate_1" as const,
    featureBuildOrder: buildOrder,
  };
}
