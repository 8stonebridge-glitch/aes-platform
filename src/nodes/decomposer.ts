import type { AESStateType } from "../state.js";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { getLLM, isLLMAvailable } from "../llm/provider.js";
import { AppSpecSchema } from "../llm/schemas.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import { applyDesignEvidenceToSpec } from "../services/design-evidence-loader.js";

// ─── Templates directory ────────────────────────────────────────────────
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

// ─── Shared: Topological Sort ──────────────────────────────────────────

export function topologicalSort(features: any[], edges: any[]): string[] {
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

// ─── Intent-derived feature reasoning ──────────────────────────────────
// When there's no template match and no LLM, reason about features from
// the raw request. This is the "figure it out" path.

const DOMAIN_FEATURE_MAP: Record<string, string[]> = {
  // Communication
  messaging: ["Direct messaging", "Group conversations", "Real-time message delivery", "Message search", "Media and file attachments", "Push notifications", "Conversation list and inbox"],
  chat: ["Real-time chat", "Chat rooms and channels", "Message history", "Typing indicators and read receipts", "File sharing", "Push notifications"],
  email: ["Email inbox", "Compose and send email", "Folder management", "Search", "Attachments", "Contact management"],
  // Social
  social: ["User profiles", "News feed", "Posts and content creation", "Comments and reactions", "Follow/friend connections", "Notifications", "Content moderation"],
  forum: ["Discussion threads", "Categories and tags", "User profiles and reputation", "Search", "Moderation tools", "Notifications"],
  community: ["Member profiles", "Discussion boards", "Events and meetups", "Member directory", "Moderation", "Notifications"],
  // Productivity
  task: ["Task creation and editing", "Task assignment", "Due dates and reminders", "Status tracking", "Labels and categories", "Dashboard overview"],
  project: ["Project workspaces", "Task board (Kanban/list)", "Team collaboration", "Timeline and milestones", "Comments and activity", "Reporting"],
  note: ["Create and edit notes", "Folders and organization", "Search", "Tags and labels", "Rich text editing", "Sharing and collaboration"],
  todo: ["Todo list creation", "Due dates and priorities", "Categories and labels", "Completion tracking", "Reminders", "Daily/weekly views"],
  // Content
  blog: ["Post editor", "Categories and tags", "Comments", "Author profiles", "Search", "RSS feed"],
  wiki: ["Page creation and editing", "Revision history", "Search", "Categories and linking", "Permissions", "Table of contents"],
  // Commerce
  store: ["Product catalog", "Shopping cart", "Checkout and payments", "Order management", "Product search", "Customer accounts"],
  inventory: ["Item tracking", "Stock levels", "Categories", "Low stock alerts", "Barcode/SKU management", "Reporting"],
  // Media
  video: ["Video upload and playback", "Video library", "Playlists", "Search", "Comments and likes", "User channels"],
  music: ["Music player", "Playlists", "Library management", "Search and discovery", "Artist profiles", "Queue management"],
  photo: ["Photo upload and gallery", "Albums", "Editing and filters", "Sharing", "Comments and likes", "Search"],
  // Health & Fitness
  fitness: ["Workout tracking", "Exercise library", "Progress charts", "Goals and milestones", "Activity history", "Profile and stats"],
  health: ["Health dashboard", "Appointment scheduling", "Medical records", "Medication tracking", "Provider directory", "Notifications"],
  // Other common types
  recipe: ["Recipe creation and editing", "Ingredient lists", "Categories and tags", "Search and filtering", "Favorites and collections", "Meal planning"],
  survey: ["Survey builder", "Question types", "Response collection", "Results and analytics", "Sharing and distribution", "Export"],
  voting: ["Poll creation", "Voting interface", "Results visualization", "Voter verification", "Categories", "Notifications"],
  weather: ["Current conditions", "Forecast display", "Location management", "Alerts and warnings", "Historical data", "Settings"],
  finance: ["Account overview", "Transaction tracking", "Budgeting", "Reports and charts", "Categories", "Goals"],
  news: ["Article feed", "Categories and topics", "Search", "Bookmarks and reading list", "Notifications", "Share"],
  game: ["Game interface", "User profiles and scores", "Leaderboard", "Multiplayer matchmaking", "Settings", "Achievements"],
  booking: ["Service catalog", "Availability calendar", "Booking flow", "Confirmation and reminders", "Cancellation and rescheduling", "Payment collection"],
};

function deriveFeatureDescriptionsFromIntent(rawRequest: string, appClass: string): string[] {
  const lower = rawRequest.toLowerCase();

  // Try to match domain keywords from the raw request
  for (const [domain, features] of Object.entries(DOMAIN_FEATURE_MAP)) {
    if (lower.includes(domain)) {
      return [
        "User authentication and profiles",
        ...features,
        "Settings and preferences",
        "Admin dashboard",
      ];
    }
  }

  // If nothing matched, extract what the user actually said and build around it
  // "build a X app" → derive core feature from X
  const typeMatch = lower.match(/\b(?:build|create|make|develop)\s+(?:a|an|the)\s+(.+?)(?:\s+app(?:lication)?|\s+platform|\s+system|\s+tool)?\s*$/);
  const appType = typeMatch?.[1]?.trim() || appClass.replace(/_/g, " ");

  return [
    "User authentication and profiles",
    `${capitalize(appType)} dashboard`,
    `Core ${appType} functionality`,
    `${capitalize(appType)} management`,
    "Search and filtering",
    "Notifications",
    "Settings and preferences",
    "Admin panel",
    "Role-based access control",
  ];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Template-based decomposer (fallback) ──────────────────────────────

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
    messaging_platform: [
      { role_id: "user", name: "User", description: "Can send/receive messages, create conversations", scope: "account", inherits_from: [] },
      { role_id: "moderator", name: "Moderator", description: "Can moderate content and manage reports", scope: "org", inherits_from: ["user"] },
      { role_id: "admin", name: "Admin", description: "Full platform access including user management", scope: "global", inherits_from: ["moderator"] },
    ],
    social_platform: [
      { role_id: "user", name: "User", description: "Can post, comment, follow, and interact", scope: "account", inherits_from: [] },
      { role_id: "moderator", name: "Moderator", description: "Can moderate content and manage community", scope: "org", inherits_from: ["user"] },
      { role_id: "admin", name: "Admin", description: "Full platform management", scope: "global", inherits_from: ["moderator"] },
    ],
    scheduling_platform: [
      { role_id: "client", name: "Client", description: "Can book appointments and manage bookings", scope: "self", inherits_from: [] },
      { role_id: "staff", name: "Staff", description: "Can manage availability and view bookings", scope: "account", inherits_from: [] },
      { role_id: "admin", name: "Admin", description: "Full access to settings, staff, and reporting", scope: "org", inherits_from: ["staff"] },
    ],
    education_platform: [
      { role_id: "student", name: "Student", description: "Can enroll in courses, complete lessons, take quizzes", scope: "account", inherits_from: [] },
      { role_id: "instructor", name: "Instructor", description: "Can create and manage courses", scope: "org", inherits_from: [] },
      { role_id: "admin", name: "Admin", description: "Platform management and reporting", scope: "global", inherits_from: ["instructor"] },
    ],
    project_management: [
      { role_id: "member", name: "Team Member", description: "Can view and update tasks assigned to them", scope: "account", inherits_from: [] },
      { role_id: "manager", name: "Project Manager", description: "Can create projects, assign tasks, manage sprints", scope: "org", inherits_from: ["member"] },
      { role_id: "admin", name: "Admin", description: "Full access including workspace settings", scope: "global", inherits_from: ["manager"] },
    ],
    crm_system: [
      { role_id: "rep", name: "Sales Rep", description: "Can manage contacts, leads, and deals", scope: "account", inherits_from: [] },
      { role_id: "manager", name: "Sales Manager", description: "Can view team pipeline and reporting", scope: "org", inherits_from: ["rep"] },
      { role_id: "admin", name: "Admin", description: "Full CRM access and configuration", scope: "global", inherits_from: ["manager"] },
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

/**
 * Template-based decomposition — the original logic, now used as fallback
 * when no LLM API key is configured or the LLM call fails.
 */
export function templateDecompose(state: AESStateType): { appSpec: any; featureBuildOrder: string[] } {
  const brief = state.intentBrief;
  const appClass = brief.inferred_app_class;
  const cb = getCallbacks();

  // Load template
  const template = loadTemplate(appClass);
  if (!template) {
    cb?.onWarn(`No template found for ${appClass} — using minimal defaults`);
  }

  // Derive features from template or class-specific defaults
  const classDefaults: Record<string, string[]> = {
    messaging_platform: [
      "User authentication and profiles",
      "Direct messaging (1-to-1 conversations)",
      "Group conversations",
      "Real-time message delivery and read receipts",
      "Media and file attachments",
      "Push notifications",
      "Message search",
      "Contact list and user discovery",
      "Conversation settings and muting",
      "Admin moderation dashboard",
    ],
    social_platform: [
      "User authentication and profiles",
      "News feed and content posting",
      "Comments and reactions",
      "Follow/unfollow and friend connections",
      "Notifications",
      "Media upload and gallery",
      "Search and discovery",
      "Content moderation dashboard",
      "User settings and privacy controls",
    ],
    scheduling_platform: [
      "User authentication and profiles",
      "Service and event type management",
      "Availability and calendar management",
      "Booking and appointment creation",
      "Appointment reminders and notifications",
      "Client self-service booking page",
      "Staff schedule dashboard",
      "Payment and deposit collection",
      "Cancellation and rescheduling",
      "Admin reporting dashboard",
    ],
    education_platform: [
      "User authentication and profiles",
      "Course creation and management",
      "Lesson and module builder",
      "Student enrollment and progress tracking",
      "Quiz and assessment engine",
      "Discussion forums",
      "Notifications and reminders",
      "Instructor dashboard",
      "Admin reporting and analytics",
    ],
    project_management: [
      "User authentication and profiles",
      "Project and workspace creation",
      "Task creation and assignment",
      "Kanban board view",
      "Sprint planning and backlog management",
      "Comments and activity feed",
      "Notifications",
      "Dashboard and reporting",
      "Team member management",
    ],
    crm_system: [
      "User authentication and profiles",
      "Contact and company management",
      "Lead capture and scoring",
      "Deal pipeline and stages",
      "Activity logging (calls, emails, meetings)",
      "Task and follow-up reminders",
      "Sales dashboard and reporting",
      "Email integration",
      "Admin settings and team management",
    ],
  };

  const featureDescriptions = template?.baseline_features
    || classDefaults[appClass]
    || deriveFeatureDescriptionsFromIntent(state.rawRequest, appClass);

  const features = featureDescriptions.map((desc, i) =>
    featureFromDescription(desc, i, appClass)
  );

  // Derive roles, permissions, tests, dependencies
  const roles = deriveRoles(appClass);
  const permissions = derivePermissions(roles, features);
  const dependencyGraph = buildDependencyGraph(features);
  const acceptanceTests = deriveAcceptanceTests(features);
  const buildOrder = topologicalSort(features, dependencyGraph);

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
    intent_clarity: brief.ambiguity_flags.length === 0 ? 0.95 : 0.7,
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
    domain_entities: [],
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
      fallback_defined: true,
      fallback_behavior: `Queue and retry on ${type} service failure`,
      retry_policy_defined: true,
      retry_policy: "exponential_backoff_3_attempts",
    })),
    non_functional_requirements: [],
    compliance_requirements: [],
    design_constraints: [],
    acceptance_tests: acceptanceTests,
    dependency_graph: dependencyGraph,
    risks: [],
    confidence,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return { appSpec, featureBuildOrder: buildOrder };
}

// ─── LLM-powered decomposer ──────────────────────────────────────────

const DECOMPOSER_SYSTEM_PROMPT = `You are a software architect for a governed software factory. Given a classified intent, decompose it into a complete application specification.

CRITICAL VALIDATION RULES — your output MUST satisfy all of these:
1. Every feature must have actor_ids with at least one entry referencing a declared actor_id
2. Every feature must have a non-empty "outcome" string
3. Every permission role_id must reference a declared role's role_id
4. Every permission "resource" field must be a valid feature_id from the features array
5. All dependency_graph from_feature_id and to_feature_id must exist in features
6. Every feature with priority "critical" or "high" must have at least one acceptance_test targeting it (by feature_id)
7. All integrations must have fallback_defined: true
8. All actor_ids used in features must match a declared actor's actor_id (except "end_user" and "system" which are exempt)

ID CONVENTIONS:
- feature_id: "f_" prefix, snake_case (e.g., "f_dashboard", "f_role_management")
- role_id: snake_case (e.g., "admin", "submitter", "reviewer")
- actor_id: snake_case matching role_ids (e.g., "admin", "submitter")
- permission_id: "p_" prefix (e.g., "p_admin_read_dashboard")
- integration_id: "int_" prefix (e.g., "int_email")
- test_id: "t_" prefix (e.g., "t_dashboard_happy_path")

Generate a complete, production-quality application specification. Include:
- Realistic features that fully address the user's intent
- Proper role hierarchy with appropriate scopes
- Granular permissions (at minimum, every role gets allow on every feature; admins get additional manage-level allow)
- Meaningful acceptance tests for all critical/high features
- A valid dependency graph (auth/RBAC features should be dependencies for features that need them)
- Accurate confidence scores (be honest about uncertainty)

All features must have status "proposed".`;

async function llmDecompose(
  intentBrief: any,
  retryCount: number,
  previousFailures: any[]
): Promise<{ appSpec: any; featureBuildOrder: string[] }> {
  const llm = getLLM()!;
  const structured = llm.withStructuredOutput(AppSpecSchema);

  let retryContext = "";
  if (retryCount > 0 && previousFailures.length > 0) {
    const failures = previousFailures.filter((r: any) => !r.passed);
    retryContext = `\n\nIMPORTANT — RETRY ATTEMPT ${retryCount}/3:
The previous spec failed validation with these errors:
${failures.map((r: any) => `- ${r.code}: ${r.reason}`).join("\n")}

You MUST fix all of these issues.`;
  }

  const result = await structured.invoke([
    {
      role: "system",
      content: DECOMPOSER_SYSTEM_PROMPT + retryContext,
    },
    {
      role: "user",
      content: `Classified intent:
App Class: ${intentBrief.inferred_app_class}
Core Outcome: ${intentBrief.inferred_core_outcome}
Primary Users: ${intentBrief.inferred_primary_users.join(", ")}
Platforms: ${intentBrief.inferred_platforms.join(", ")}
Risk Class: ${intentBrief.inferred_risk_class}
Integrations: ${intentBrief.inferred_integrations.join(", ") || "none"}
Explicit Inclusions: ${intentBrief.explicit_inclusions?.join(", ") || "none"}
Explicit Exclusions: ${intentBrief.explicit_exclusions?.join(", ") || "none"}
Assumptions: ${intentBrief.assumptions?.join(", ") || "none"}
Original Request: ${intentBrief.raw_request}`,
    },
  ]);

  // Add system-level fields the LLM doesn't generate
  const now = new Date().toISOString();
  const appSpec = {
    app_id: randomUUID(),
    request_id: intentBrief.request_id,
    intent_brief_id: intentBrief.request_id,
    ...result,
    domain_entities: [],
    workflows: [],
    non_functional_requirements: [],
    compliance_requirements: [],
    design_constraints: [],
    risks: [],
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
  };

  // Build feature order via topological sort of dependency_graph
  const featureBuildOrder = topologicalSort(result.features, result.dependency_graph);

  return { appSpec, featureBuildOrder };
}

// ─── Main decomposer (LLM with template fallback) ──────────────────────

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

  cb?.onGate("gate_1", "Decomposing AppSpec...");

  // Check graph context for prior features and failure patterns
  const graphCtx = state.graphContext;
  const priorFeatures = graphCtx?.similarFeatures || [];
  const failureHistory = graphCtx?.failureHistory || [];

  if (priorFeatures.length > 0) {
    cb?.onStep(`Graph context: ${priorFeatures.length} prior features available to guide decomposition`);
  }
  if (failureHistory.length > 0) {
    cb?.onWarn(`Graph context: ${failureHistory.length} prior failure patterns — will avoid known issues`);
  }

  let appSpec: any;
  let featureBuildOrder: string[];
  let usedLLM = false;

  if (isLLMAvailable()) {
    try {
      cb?.onStep(
        state.specRetryCount > 0
          ? `LLM retry ${state.specRetryCount}/3 — fixing validation failures...`
          : "Using LLM for application decomposition..."
      );
      const result = await llmDecompose(
        state.intentBrief,
        state.specRetryCount,
        state.specValidationResults
      );
      appSpec = result.appSpec;
      featureBuildOrder = result.featureBuildOrder;
      usedLLM = true;
      cb?.onSuccess(`LLM decomposition complete — ${appSpec.features.length} features`);
    } catch (err: any) {
      cb?.onWarn(`LLM decomposition failed (${err.message}), falling back to template decomposer`);
      const result = templateDecompose(state);
      appSpec = result.appSpec;
      featureBuildOrder = result.featureBuildOrder;
    }
  } else {
    cb?.onStep("No LLM configured, using template decomposer");
    const result = templateDecompose(state);
    appSpec = result.appSpec;
    featureBuildOrder = result.featureBuildOrder;
  }

  // Enrich with graph-derived features not already in the spec
  if (priorFeatures.length > 0) {
    const existingNames = new Set(
      appSpec.features.map((f: any) => f.name.toLowerCase())
    );
    let added = 0;

    for (const prior of priorFeatures) {
      const priorName = (prior.name || "").toLowerCase();
      // Skip if already exists or is an intent/app/bridge entity
      if (
        !priorName ||
        existingNames.has(priorName) ||
        priorName.startsWith("intent ") ||
        priorName.startsWith("app ") ||
        priorName.startsWith("bridge:")
      ) continue;

      // Check if this prior feature is relevant (shares words with existing features)
      const priorWords = priorName.split(/[\s-_]+/).filter((w: string) => w.length > 2);
      const isRelevant = appSpec.features.some((f: any) => {
        const fWords = f.name.toLowerCase().split(/[\s-_]+/);
        return priorWords.some((pw: string) => fWords.some((fw: string) => fw.includes(pw) || pw.includes(fw)));
      });

      if (isRelevant && !existingNames.has(priorName)) {
        const idx = appSpec.features.length;
        const newFeature = featureFromDescription(
          prior.name,
          idx,
          appSpec.app_class
        );
        newFeature.description += ` [graph-derived from prior build v${prior.version || 1}]`;
        appSpec.features.push(newFeature);
        existingNames.add(priorName);
        added++;
        cb?.onStep(`Graph-derived feature: ${prior.name}`);
      }
    }

    if (added > 0) {
      // Rebuild dependency graph and build order with new features
      const depGraph = buildDependencyGraph(appSpec.features);
      appSpec.dependency_graph = [...(appSpec.dependency_graph || []), ...depGraph.filter(
        (e: any) => !(appSpec.dependency_graph || []).some(
          (existing: any) => existing.from_feature_id === e.from_feature_id && existing.to_feature_id === e.to_feature_id
        )
      )];
      featureBuildOrder = topologicalSort(appSpec.features, appSpec.dependency_graph);

      // Generate tests for new features
      const newFeatures = appSpec.features.slice(appSpec.features.length - added);
      const newTests = deriveAcceptanceTests(newFeatures);
      appSpec.acceptance_tests = [...(appSpec.acceptance_tests || []), ...newTests];

      cb?.onSuccess(`Added ${added} graph-derived features (total: ${appSpec.features.length})`);
    }
  }

  // If failure history exists, add warnings as assumptions
  if (failureHistory.length > 0) {
    appSpec.risks = [
      ...(appSpec.risks || []),
      ...failureHistory.map((f: any) => ({
        risk_id: `risk-graph-${f.name?.replace(/\s+/g, "-").toLowerCase() || "unknown"}`,
        name: f.name || "Prior failure pattern",
        description: f.description || "Failure pattern detected in prior builds",
        severity: f.severity || "medium",
        mitigation: "Addressed via graph-derived failure awareness",
        source: "neo4j-failure-history",
      })),
    ];
    cb?.onStep(`Added ${failureHistory.length} risk entries from prior failure patterns`);
  }

  // Report features
  for (const f of appSpec.features) {
    cb?.onFeatureStatus(f.feature_id, f.name, f.status);
  }

  store.addLog(state.jobId, {
    gate: "gate_1",
    message: `AppSpec generated: ${appSpec.features.length} features, ${appSpec.roles.length} roles, method: ${usedLLM ? "llm" : "template"}, confidence ${((appSpec.confidence?.overall ?? 0) * 100).toFixed(0)}%`,
  });

  // Apply design evidence constraints to features (if design evidence loaded)
  if (state.designEvidence) {
    try {
      const { constraintsApplied, featuresMatched } = applyDesignEvidenceToSpec(
        appSpec,
        state.designEvidence
      );
      if (constraintsApplied > 0) {
        cb?.onSuccess(`Design constraints applied to ${constraintsApplied} features: ${featuresMatched.join(", ")}`);
        store.addLog(state.jobId, {
          gate: "gate_1",
          message: `Design evidence → ${constraintsApplied} features got design constraints: ${featuresMatched.join(", ")}`,
        });
      } else {
        cb?.onStep("Design evidence loaded but no features matched screen names — constraints skipped");
      }
    } catch (err: any) {
      cb?.onWarn(`Design constraint application failed: ${err.message} — continuing without`);
    }
  }

  cb?.onSuccess(
    `AppSpec: ${appSpec.features.length} features, ${appSpec.roles.length} roles, ${appSpec.acceptance_tests.length} tests, ${((appSpec.confidence?.overall ?? 0) * 100).toFixed(0)}% confidence (${usedLLM ? "LLM" : "template"})`
  );

  return {
    appSpec,
    currentGate: "gate_1" as const,
    featureBuildOrder,
  };
}
