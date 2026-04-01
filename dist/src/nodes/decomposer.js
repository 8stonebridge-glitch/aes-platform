import { randomUUID } from "node:crypto";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { getLLM, isLLMAvailable, safeLLMCall } from "../llm/provider.js";
import { AppSpecSchema } from "../llm/schemas.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import { applyDesignEvidenceToSpec } from "../services/design-evidence-loader.js";
// ─── Templates directory ────────────────────────────────────────────────
const TEMPLATES_DIR = "/tmp/aes-templates/apps";
function loadTemplate(appClass) {
    if (!existsSync(TEMPLATES_DIR))
        return null;
    const dirs = readdirSync(TEMPLATES_DIR);
    for (const dir of dirs) {
        const yamlPath = join(TEMPLATES_DIR, dir, "template.yaml");
        if (!existsSync(yamlPath))
            continue;
        const content = readFileSync(yamlPath, "utf-8");
        const data = parseYaml(content);
        if (data.app_class === appClass)
            return data;
    }
    return null;
}
// ─── Shared: Topological Sort ──────────────────────────────────────────
export function topologicalSort(features, edges) {
    const ids = features.map((f) => f.feature_id);
    const deps = new Map();
    for (const id of ids)
        deps.set(id, new Set());
    for (const e of edges) {
        deps.get(e.from_feature_id)?.add(e.to_feature_id);
    }
    const sorted = [];
    const visited = new Set();
    function visit(id) {
        if (visited.has(id))
            return;
        visited.add(id);
        for (const dep of deps.get(id) || []) {
            visit(dep);
        }
        sorted.push(id);
    }
    for (const id of ids)
        visit(id);
    return sorted;
}
// ─── Template-based decomposer (fallback) ──────────────────────────────
// Map a feature description string into a typed feature object
function featureFromDescription(desc, index, appClass) {
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
    let priority;
    if (isAuth || isWorkflow)
        priority = "critical";
    else if (index < 3)
        priority = "high";
    else if (isNotification || isSettings)
        priority = "low";
    else
        priority = "medium";
    // Infer actors
    const actors = ["end_user"];
    if (isAuth || isSettings)
        actors.push("admin");
    if (isWorkflow)
        actors.push("reviewer");
    if (isAudit)
        actors.push("auditor");
    // Destructive actions
    const destructiveActions = [];
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
    const externalDeps = [];
    if (isNotification)
        externalDeps.push("email_service");
    if (isPayment)
        externalDeps.push("payment_provider");
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
function buildDependencyGraph(features) {
    const edges = [];
    const authFeature = features.find((f) => f.name.toLowerCase().includes("role") || f.name.toLowerCase().includes("auth"));
    const workflowFeature = features.find((f) => f.name.toLowerCase().includes("state machine") || f.name.toLowerCase().includes("xstate"));
    for (const f of features) {
        if (f === authFeature || f === workflowFeature)
            continue;
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
function deriveRoles(appClass) {
    const rolesByClass = {
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
function derivePermissions(roles, features) {
    const permissions = [];
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
function deriveAcceptanceTests(features) {
    const tests = [];
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
export function templateDecompose(state) {
    const brief = state.intentBrief;
    const appClass = brief.inferred_app_class;
    const cb = getCallbacks();
    // Load template
    const template = loadTemplate(appClass);
    if (!template) {
        cb?.onWarn(`No template found for ${appClass} — using minimal defaults`);
    }
    // Derive features from template or defaults
    const featureDescriptions = template?.baseline_features || [
        "User dashboard",
        "Settings page",
        "Role-based access control",
    ];
    const features = featureDescriptions.map((desc, i) => featureFromDescription(desc, i, appClass));
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
        title: `${brief.inferred_app_class.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
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
        integrations: brief.inferred_integrations.map((type, i) => ({
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
8. All actor_ids used in features must match a declared role's role_id (except "end_user", "system", "general_user", "user", and "anonymous" which are exempt)
9. Every actor's actor_id MUST match a declared role_id. Do NOT invent actor_ids that have no matching role.

ID CONVENTIONS:
- feature_id: "f_" prefix, snake_case (e.g., "f_dashboard", "f_role_management")
- role_id: snake_case (e.g., "admin", "user", "moderator")
- actor_id: MUST use the SAME string as the corresponding role_id (e.g., if role_id is "user", actor_id must be "user" — NOT "general_user")
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
/**
 * Build a structured text block from graph context so the LLM can use
 * prior features, failure patterns, blueprints, domain sources, concept
 * confidence, and universal patterns when planning the application.
 */
function buildGraphGuidance(graphCtx) {
    if (!graphCtx)
        return "";
    const sections = [];
    // Prior similar features
    const similar = graphCtx.similarFeatures || [];
    if (similar.length > 0) {
        const lines = similar.slice(0, 20).map((f) => `- ${f.name || "unnamed"}${f.description ? `: ${f.description}` : ""}${f.priority ? ` [${f.priority}]` : ""}${f.version ? ` (v${f.version})` : ""}`);
        sections.push(`## Prior Similar Features (${similar.length} total)\nThese features were built in previous apps of the same type. Use them as reference for naming, scope, and structure:\n${lines.join("\n")}`);
    }
    // Failure patterns to avoid
    const failures = graphCtx.failureHistory || [];
    if (failures.length > 0) {
        const lines = failures.slice(0, 15).map((f) => `- ${f.name || f.pattern || "unknown"}: ${f.description || f.reason || "no details"}${f.severity ? ` [severity: ${f.severity}]` : ""}`);
        sections.push(`## Failure Patterns to AVOID\nThese patterns caused issues in prior builds. Design around them:\n${lines.join("\n")}`);
    }
    // Prevention rules
    const prevention = graphCtx.preventionRules || [];
    if (prevention.length > 0) {
        const lines = prevention.slice(0, 15).map((r) => `- ${r.rule || r.name || r.description || JSON.stringify(r)}`);
        sections.push(`## Prevention Rules\nMandatory rules from prior build failures:\n${lines.join("\n")}`);
    }
    // Unified blueprint
    const blueprint = graphCtx.unifiedBlueprint || [];
    if (blueprint.length > 0) {
        sections.push(`## Unified Architecture Blueprint\nComposite architecture plan derived from prior successful apps:\n${blueprint.join("\n")}`);
    }
    // Domain sources
    const domainSources = graphCtx.unifiedDomainSources || [];
    if (domainSources.length > 0) {
        const lines = domainSources.slice(0, 15).map((s) => typeof s === "string" ? `- ${s}` : `- ${s.domain || s.name || "unknown"}: ${s.sources?.join(", ") || s.apps?.join(", ") || JSON.stringify(s)}`);
        sections.push(`## Domain Source Apps\nPrior apps to learn from per domain:\n${lines.join("\n")}`);
    }
    // Concept confidence scores
    const conceptScores = graphCtx.unifiedConceptScores || [];
    if (conceptScores.length > 0) {
        const lines = conceptScores.slice(0, 20).map((c) => typeof c === "string" ? `- ${c}` : `- ${c.concept || c.name || "unknown"}: confidence ${typeof c.score === "number" ? (c.score * 100).toFixed(0) + "%" : c.score || c.confidence || "unknown"}`);
        sections.push(`## Concept Confidence (what the graph knows vs gaps)\nHigh-confidence concepts can be reused directly; low-confidence areas need more care:\n${lines.join("\n")}`);
    }
    // Gaps — areas with no prior data
    const gaps = graphCtx.unifiedGaps || [];
    if (gaps.length > 0) {
        sections.push(`## Knowledge Gaps\nAreas where no prior data exists — be especially careful with design here:\n${gaps.map((g) => `- ${g}`).join("\n")}`);
    }
    // Universal patterns
    const universalPatterns = graphCtx.unifiedUniversalPatterns || [];
    if (universalPatterns.length > 0) {
        const lines = universalPatterns.slice(0, 15).map((p) => typeof p === "string" ? `- ${p}` : `- ${p.name || p.pattern || "unknown"}: ${p.description || JSON.stringify(p)}`);
        sections.push(`## Universal Patterns\nPatterns that apply across all apps of this type:\n${lines.join("\n")}`);
    }
    // Learned features from prior builds
    const learnedFeatures = graphCtx.learnedFeatures || [];
    if (learnedFeatures.length > 0) {
        const lines = learnedFeatures.slice(0, 15).map((f) => `- ${f.name || "unnamed"}${f.description ? `: ${f.description}` : ""}${f.type ? ` [${f.type}]` : ""}`);
        sections.push(`## Learned Feature Structures\nFeature structures extracted from prior successful builds:\n${lines.join("\n")}`);
    }
    // Learned data models
    const learnedModels = graphCtx.learnedModels || [];
    if (learnedModels.length > 0) {
        const lines = learnedModels.slice(0, 15).map((m) => `- ${m.name || m.model || "unnamed"}${m.fields ? ` (fields: ${Array.isArray(m.fields) ? m.fields.join(", ") : m.fields})` : ""}${m.description ? `: ${m.description}` : ""}`);
        sections.push(`## Learned Data Models\nData models from prior builds — use as reference for domain entities:\n${lines.join("\n")}`);
    }
    // Build-extracted patterns
    const buildPatterns = graphCtx.buildExtractedPatterns || [];
    if (buildPatterns.length > 0) {
        const lines = buildPatterns.slice(0, 15).map((p) => typeof p === "string" ? `- ${p}` : `- ${p.name || p.pattern || "unnamed"}: ${p.description || p.usage || JSON.stringify(p)}`);
        sections.push(`## Build-Extracted Patterns\nPatterns discovered during prior builds:\n${lines.join("\n")}`);
    }
    // Known patterns from graph
    const knownPatterns = graphCtx.knownPatterns || [];
    if (knownPatterns.length > 0) {
        const lines = knownPatterns.slice(0, 10).map((p) => typeof p === "string" ? `- ${p}` : `- ${p.name || p.type || "unnamed"}: ${p.description || JSON.stringify(p)}`);
        sections.push(`## Known Patterns\n${lines.join("\n")}`);
    }
    // Unified coverage score
    if (typeof graphCtx.unifiedCoverage === "number" && graphCtx.unifiedCoverage > 0) {
        sections.push(`## Graph Coverage\nOverall knowledge coverage for this domain: ${(graphCtx.unifiedCoverage * 100).toFixed(0)}%`);
    }
    if (sections.length === 0)
        return "";
    return `\n\n--- GRAPH-DERIVED GUIDANCE ---
The following knowledge was extracted from the project graph (prior builds, failure analysis, domain research). Use it to inform your decomposition — reuse proven structures, avoid known failure patterns, and pay extra attention to identified gaps.

${sections.join("\n\n")}

--- END GRAPH GUIDANCE ---`;
}
async function llmDecompose(intentBrief, retryCount, previousFailures, graphHints) {
    const llm = getLLM();
    const structured = llm.withStructuredOutput(AppSpecSchema);
    let retryContext = "";
    if (retryCount > 0 && previousFailures.length > 0) {
        const failures = previousFailures.filter((r) => !r.passed);
        retryContext = `\n\nIMPORTANT — RETRY ATTEMPT ${retryCount}/3:
The previous spec failed validation with these errors:
${failures.map((r) => `- ${r.code}: ${r.reason}`).join("\n")}

You MUST fix all of these issues.`;
    }
    const graphGuidanceBlock = graphHints || "";
    const result = await safeLLMCall("decomposer", () => structured.invoke([
        {
            role: "system",
            content: DECOMPOSER_SYSTEM_PROMPT + graphGuidanceBlock + retryContext,
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
    ]));
    if (!result) {
        throw new Error("LLM decomposition timed out or failed");
    }
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
    // Sanitize dependency graph — remove edges referencing non-existent features
    const validFeatureIds = new Set(result.features.map((f) => f.feature_id));
    appSpec.dependency_graph = (result.dependency_graph || []).filter((e) => validFeatureIds.has(e.from_feature_id) && validFeatureIds.has(e.to_feature_id));
    // Build feature order via topological sort of dependency_graph
    const featureBuildOrder = topologicalSort(result.features, appSpec.dependency_graph);
    return { appSpec, featureBuildOrder };
}
// ─── Main decomposer (LLM with template fallback) ──────────────────────
export async function decomposer(state) {
    const cb = getCallbacks();
    const store = getJobStore();
    if (!state.intentBrief || !state.intentConfirmed) {
        cb?.onFail("Cannot decompose — intent not confirmed");
        return {
            currentGate: "failed",
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
    let appSpec;
    let featureBuildOrder;
    let usedLLM = false;
    // Build graph guidance for the LLM from all available graph context fields
    const graphGuidance = buildGraphGuidance(graphCtx);
    if (graphGuidance) {
        cb?.onStep("Graph guidance block built — passing prior knowledge to LLM decomposer");
    }
    if (isLLMAvailable()) {
        try {
            cb?.onStep(state.specRetryCount > 0
                ? `LLM retry ${state.specRetryCount}/3 — fixing validation failures...`
                : "Using LLM for application decomposition...");
            const result = await llmDecompose(state.intentBrief, state.specRetryCount, state.specValidationResults, graphGuidance || undefined);
            appSpec = result.appSpec;
            featureBuildOrder = result.featureBuildOrder;
            usedLLM = true;
            cb?.onSuccess(`LLM decomposition complete — ${appSpec.features.length} features`);
        }
        catch (err) {
            cb?.onWarn(`LLM decomposition failed (${err.message}), falling back to template decomposer`);
            const result = templateDecompose(state);
            appSpec = result.appSpec;
            featureBuildOrder = result.featureBuildOrder;
        }
    }
    else {
        cb?.onStep("No LLM configured, using template decomposer");
        const result = templateDecompose(state);
        appSpec = result.appSpec;
        featureBuildOrder = result.featureBuildOrder;
    }
    // Enrich with graph-derived features not already in the spec.
    // Keep this intentionally conservative so prior graph context guides
    // decomposition without silently expanding small apps into bloated specs.
    if (priorFeatures.length > 0) {
        const baseFeatureCount = appSpec.features.length;
        const existingNames = new Set(appSpec.features.map((f) => f.name.toLowerCase()));
        const maxGraphDerivedAdds = baseFeatureCount <= 4 ? 0 : baseFeatureCount <= 8 ? 1 : Math.min(3, Math.max(1, Math.floor(baseFeatureCount / 4)));
        const candidateFeatures = [];
        let added = 0;
        for (const prior of priorFeatures) {
            const priorName = (prior.name || "").toLowerCase();
            // Skip if already exists or is an intent/app/bridge entity
            if (!priorName ||
                existingNames.has(priorName) ||
                priorName.startsWith("intent ") ||
                priorName.startsWith("app ") ||
                priorName.startsWith("bridge:"))
                continue;
            // Check if this prior feature is relevant (shares words with existing features)
            const priorWords = priorName.split(/[\s-_]+/).filter((w) => w.length > 2);
            let bestOverlap = 0;
            const isRelevant = appSpec.features.some((f) => {
                const fWords = f.name.toLowerCase().split(/[\s-_]+/);
                const overlap = priorWords.filter((pw) => fWords.some((fw) => fw === pw || fw.includes(pw) || pw.includes(fw))).length;
                bestOverlap = Math.max(bestOverlap, overlap);
                return overlap >= 2;
            });
            if (isRelevant && !existingNames.has(priorName)) {
                candidateFeatures.push({ prior, score: bestOverlap });
            }
        }
        const selectedGraphDerived = candidateFeatures
            .sort((a, b) => b.score - a.score || (a.prior.name || "").localeCompare(b.prior.name || ""))
            .slice(0, maxGraphDerivedAdds);
        for (const { prior } of selectedGraphDerived) {
            const idx = appSpec.features.length;
            const newFeature = featureFromDescription(prior.name, idx, appSpec.app_class);
            newFeature.description += ` [graph-derived from prior build v${prior.version || 1}]`;
            appSpec.features.push(newFeature);
            existingNames.add((prior.name || "").toLowerCase());
            added++;
            cb?.onStep(`Graph-derived feature: ${prior.name}`);
        }
        if (candidateFeatures.length > selectedGraphDerived.length) {
            cb?.onStep(`Skipped ${candidateFeatures.length - selectedGraphDerived.length} low-priority graph-derived features to keep scope focused`);
        }
        if (added > 0) {
            // Rebuild dependency graph and build order with new features
            const depGraph = buildDependencyGraph(appSpec.features);
            appSpec.dependency_graph = [...(appSpec.dependency_graph || []), ...depGraph.filter((e) => !(appSpec.dependency_graph || []).some((existing) => existing.from_feature_id === e.from_feature_id && existing.to_feature_id === e.to_feature_id))];
            featureBuildOrder = topologicalSort(appSpec.features, appSpec.dependency_graph);
            // Generate permissions and tests for new features
            const newFeatures = appSpec.features.slice(appSpec.features.length - added);
            const newPermissions = derivePermissions(appSpec.roles, newFeatures);
            appSpec.permissions = [...(appSpec.permissions || []), ...newPermissions];
            const newTests = deriveAcceptanceTests(newFeatures);
            appSpec.acceptance_tests = [...(appSpec.acceptance_tests || []), ...newTests];
            cb?.onSuccess(`Added ${added} graph-derived features (total: ${appSpec.features.length})`);
        }
    }
    // Gap-fill: ensure EVERY feature has at least one permission entry.
    // The LLM sometimes omits permissions for features (e.g. notifications).
    // Without this, Gate 3 G3_AUTH_NOT_DEFINED vetoes the feature.
    const coveredFeatures = new Set((appSpec.permissions || []).map((p) => p.resource));
    const uncoveredFeatures = appSpec.features.filter((f) => !coveredFeatures.has(f.feature_id));
    if (uncoveredFeatures.length > 0) {
        const gapPermissions = derivePermissions(appSpec.roles, uncoveredFeatures);
        appSpec.permissions = [...(appSpec.permissions || []), ...gapPermissions];
        cb?.onStep(`Gap-filled permissions for ${uncoveredFeatures.length} features: ${uncoveredFeatures.map((f) => f.name).join(", ")}`);
    }
    // Gap-fill: ensure every feature actor_id resolves to a declared role.
    // The LLM sometimes uses actor names like "admin" while declaring role_id "administrator",
    // or invents actors that aren't in the roles list. This causes G1_ACTORS_WITHOUT_ROLES failures.
    const EXEMPT_ACTORS = new Set(["end_user", "system", "general_user", "user", "anonymous"]);
    const declaredRoleIds = new Set(appSpec.roles
        .map((r) => r.role_id)
        .filter((roleId) => typeof roleId === "string" && roleId.length > 0));
    const declaredRoleNames = new Map(appSpec.roles.map((r) => [r.name?.toLowerCase(), r.role_id]));
    let actorFixCount = 0;
    for (const f of appSpec.features) {
        if (!f.actor_ids || f.actor_ids.length === 0)
            continue;
        f.actor_ids = f.actor_ids.map((actorId) => {
            if (EXEMPT_ACTORS.has(actorId) || declaredRoleIds.has(actorId))
                return actorId;
            // Try case-insensitive match on role_id
            const lowerActor = actorId.toLowerCase();
            for (const roleId of declaredRoleIds) {
                if (roleId.toLowerCase() === lowerActor) {
                    actorFixCount++;
                    return roleId;
                }
            }
            // Try match on role name
            const nameMatch = declaredRoleNames.get(lowerActor);
            if (nameMatch) {
                actorFixCount++;
                return nameMatch;
            }
            // Last resort: assign first declared role
            if (declaredRoleIds.size > 0) {
                actorFixCount++;
                return [...declaredRoleIds][0];
            }
            return actorId;
        });
    }
    if (actorFixCount > 0) {
        cb?.onStep(`Actor-role alignment: fixed ${actorFixCount} actor references to match declared roles`);
    }
    // If failure history exists, add warnings as assumptions
    if (failureHistory.length > 0) {
        appSpec.risks = [
            ...(appSpec.risks || []),
            ...failureHistory.map((f) => ({
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
    store.update(state.jobId, {
        appSpec,
        featureBuildOrder,
        currentGate: "gate_1",
    });
    // Apply design evidence constraints to features (if design evidence loaded)
    if (state.designEvidence) {
        try {
            const { constraintsApplied, featuresMatched } = applyDesignEvidenceToSpec(appSpec, state.designEvidence);
            if (constraintsApplied > 0) {
                cb?.onSuccess(`Design constraints applied to ${constraintsApplied} features: ${featuresMatched.join(", ")}`);
                store.addLog(state.jobId, {
                    gate: "gate_1",
                    message: `Design evidence → ${constraintsApplied} features got design constraints: ${featuresMatched.join(", ")}`,
                });
                store.update(state.jobId, { appSpec });
            }
            else {
                cb?.onStep("Design evidence loaded but no features matched screen names — constraints skipped");
            }
        }
        catch (err) {
            cb?.onWarn(`Design constraint application failed: ${err.message} — continuing without`);
        }
    }
    cb?.onSuccess(`AppSpec: ${appSpec.features.length} features, ${appSpec.roles.length} roles, ${appSpec.acceptance_tests.length} tests, ${((appSpec.confidence?.overall ?? 0) * 100).toFixed(0)}% confidence (${usedLLM ? "LLM" : "template"})`);
    return {
        appSpec,
        currentGate: "gate_1",
        featureBuildOrder,
    };
}
