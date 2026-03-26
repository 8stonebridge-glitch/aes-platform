import type { AESStateType } from "../state.js";
import { randomUUID } from "node:crypto";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { getLLM, isLLMAvailable } from "../llm/provider.js";
import { IntentBriefSchema } from "../llm/schemas.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";

// ─── Keyword-based classification (fallback) ───────────────────────────

const APP_CLASS_KEYWORDS: Record<string, string[]> = {
  internal_ops_tool: ["internal", "ops", "admin", "backoffice", "back office", "dashboard", "management tool"],
  customer_portal: ["portal", "customer", "client", "self-service", "account"],
  fintech_wallet: ["wallet", "fintech", "money", "payment", "transfer", "banking app", "send money"],
  digital_banking_portal: ["banking", "bank", "digital bank", "retail bank"],
  banking_operations_system: ["banking ops", "bank operations", "core banking"],
  marketplace: ["marketplace", "two-sided", "vendor", "seller", "buyer", "store", "shop", "e-commerce"],
  workflow_approval_system: ["approval", "workflow", "request", "review", "approve", "sign-off"],
  property_management_system: ["property", "real estate", "tenant", "landlord", "rental"],
  logistics_operations_system: ["logistics", "shipping", "delivery", "fleet", "tracking", "dispatch"],
  compliance_case_management: ["compliance", "case", "audit", "regulatory", "investigation"],
};

const RISK_KEYWORDS: Record<string, string[]> = {
  regulated: ["banking", "fintech", "payment", "compliance", "financial", "money", "wallet"],
  high: ["security", "sensitive", "enterprise", "production"],
  medium: ["customer", "portal", "marketplace", "external"],
  low: ["internal", "ops", "admin", "tool", "dashboard", "approval", "request"],
};

const PLATFORM_KEYWORDS: Record<string, string[]> = {
  pwa: ["mobile", "offline", "pwa", "phone"],
  admin_console: ["admin", "console", "backoffice"],
  web: [], // default
};

const INTEGRATION_KEYWORDS: Record<string, string[]> = {
  payments: ["payment", "stripe", "paystack", "checkout", "billing"],
  email: ["email", "notification", "send email"],
  sms: ["sms", "text message"],
  storage: ["upload", "file", "storage", "attachment"],
  maps: ["map", "location", "address"],
  analytics: ["analytics", "tracking", "metrics"],
};

const AMBIGUITY_CHECKS: Record<string, (input: string, appClass: string) => boolean> = {
  ambiguous_app_class: (input, appClass) => appClass === "other",
  ambiguous_primary_user: (input) => {
    const hasUser = /\b(for|by|used by)\s+\w+/i.test(input);
    return !hasUser && input.split(" ").length < 8;
  },
  ambiguous_core_workflow: (input) => {
    return input.split(" ").length < 6;
  },
};

function classifyAppClass(input: string): string {
  const lower = input.toLowerCase();
  let bestMatch = "other";
  let bestScore = 0;

  for (const [cls, keywords] of Object.entries(APP_CLASS_KEYWORDS)) {
    const score = keywords.filter((kw) => lower.includes(kw)).length;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = cls;
    }
  }

  return bestMatch;
}

function classifyRisk(input: string, appClass: string): string {
  const lower = input.toLowerCase();

  // Regulated classes always get regulated risk
  if (["fintech_wallet", "digital_banking_portal", "banking_operations_system"].includes(appClass)) {
    return "regulated";
  }

  for (const [risk, keywords] of Object.entries(RISK_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      return risk;
    }
  }

  return "low";
}

function classifyPlatforms(input: string): string[] {
  const lower = input.toLowerCase();
  const platforms = ["web"];

  if (PLATFORM_KEYWORDS.pwa.some((kw) => lower.includes(kw))) {
    platforms.push("pwa");
  }
  if (PLATFORM_KEYWORDS.admin_console.some((kw) => lower.includes(kw))) {
    if (!platforms.includes("admin_console")) platforms.push("admin_console");
  }

  return platforms;
}

function classifyIntegrations(input: string): string[] {
  const lower = input.toLowerCase();
  const integrations: string[] = [];

  for (const [type, keywords] of Object.entries(INTEGRATION_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) {
      integrations.push(type);
    }
  }

  return integrations;
}

function detectAmbiguity(input: string, appClass: string): string[] {
  const flags: string[] = [];

  for (const [flag, check] of Object.entries(AMBIGUITY_CHECKS)) {
    if (check(input, appClass)) {
      flags.push(flag);
    }
  }

  return flags;
}

function inferCoreOutcome(input: string, appClass: string): string {
  const outcomes: Record<string, string> = {
    internal_ops_tool: "manage internal operations and data",
    customer_portal: "self-service account and activity management",
    fintech_wallet: "sending, receiving, and tracking money",
    digital_banking_portal: "digital banking for retail customers",
    banking_operations_system: "internal banking operations management",
    marketplace: "connecting buyers and sellers",
    workflow_approval_system: "submitting, reviewing, and approving requests",
    property_management_system: "managing properties, tenants, and leases",
    logistics_operations_system: "tracking and managing deliveries",
    compliance_case_management: "managing compliance cases and investigations",
    other: "custom application",
  };

  return outcomes[appClass] || "custom application";
}

function inferPrimaryUsers(appClass: string): string[] {
  const users: Record<string, string[]> = {
    internal_ops_tool: ["internal staff", "administrators"],
    customer_portal: ["customers", "support staff"],
    fintech_wallet: ["consumers", "support administrators"],
    digital_banking_portal: ["retail customers", "bank staff"],
    banking_operations_system: ["bank operators", "compliance officers"],
    marketplace: ["buyers", "sellers", "marketplace admins"],
    workflow_approval_system: ["requesters", "reviewers", "approvers"],
    property_management_system: ["property managers", "tenants"],
    logistics_operations_system: ["dispatchers", "drivers", "operations managers"],
    compliance_case_management: ["compliance officers", "case managers", "auditors"],
    other: ["users"],
  };

  return users[appClass] || ["users"];
}

// ─── Keyword-based classifier (original, now used as fallback) ──────────

export function keywordClassifyIntent(rawRequest: string, requestId: string): any {
  const input = rawRequest;
  const appClass = classifyAppClass(input);
  const riskClass = classifyRisk(input, appClass);
  const platforms = classifyPlatforms(input);
  const integrations = classifyIntegrations(input);
  const ambiguityFlags = detectAmbiguity(input, appClass);
  const coreOutcome = inferCoreOutcome(input, appClass);
  const primaryUsers = inferPrimaryUsers(appClass);

  const confirmationStatement = `You want a ${appClass.replace(/_/g, " ")} for ${primaryUsers.join(" and ")}, focused on ${coreOutcome}, delivered as ${platforms.join(" + ")}${integrations.length > 0 ? `, with ${integrations.join(", ")}` : ""} — correct?`;

  let confirmationStatus: string;
  if (ambiguityFlags.length === 0 && riskClass === "low") {
    confirmationStatus = "auto_confirmed_low_ambiguity";
  } else {
    confirmationStatus = "pending";
  }

  return {
    request_id: requestId,
    raw_request: input,
    inferred_app_class: appClass,
    inferred_primary_users: primaryUsers,
    inferred_core_outcome: coreOutcome,
    inferred_platforms: platforms,
    inferred_risk_class: riskClass,
    inferred_integrations: integrations,
    explicit_inclusions: [],
    explicit_exclusions: [],
    ambiguity_flags: ambiguityFlags,
    assumptions: [],
    confirmation_statement: confirmationStatement,
    confirmation_status: confirmationStatus,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ─── LLM-powered classifier ────────────────────────────────────────────

const INTENT_CLASSIFIER_SYSTEM_PROMPT = `You are an intent classifier for a governed software factory. Given a natural-language app description, classify it into a structured intent brief.

App class categories:
- internal_ops_tool: Internal dashboards, admin panels, back-office tools
- customer_portal: Customer-facing self-service portals
- fintech_wallet: Money transfer, payment, wallet apps
- digital_banking_portal: Retail/digital banking interfaces
- banking_operations_system: Core banking, operations systems
- marketplace: Two-sided marketplaces, e-commerce
- workflow_approval_system: Approval workflows, request management
- property_management_system: Real estate, tenant, rental management
- logistics_operations_system: Shipping, delivery, fleet tracking
- compliance_case_management: Compliance, audit, regulatory case management
- other: If none of the above clearly match

Risk classification:
- regulated: Anything involving money, banking, financial transactions, compliance
- high: Enterprise systems, security-sensitive apps
- medium: Customer-facing, marketplace, external-facing apps
- low: Internal tools, dashboards, simple approval workflows

Be precise. Extract explicit requirements vs inferences. Flag genuine ambiguities — don't flag things that are clearly implied. Generate a natural confirmation statement.

Platforms must always include "web". Add "pwa" if mobile/offline is mentioned. Add "admin_console" if admin management is needed.`;

async function llmClassifyIntent(rawRequest: string, requestId: string): Promise<any> {
  const llm = getLLM()!;
  const structured = llm.withStructuredOutput(IntentBriefSchema);

  const result = await structured.invoke([
    {
      role: "system",
      content: INTENT_CLASSIFIER_SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: rawRequest,
    },
  ]);

  // Ensure "web" is always in platforms
  if (!result.inferred_platforms.includes("web")) {
    result.inferred_platforms.unshift("web");
  }

  // Build full IntentBrief with fields the LLM doesn't generate
  const now = new Date().toISOString();

  // Determine confirmation status using same logic as keyword classifier
  let confirmationStatus: string;
  if (result.ambiguity_flags.length === 0 && result.inferred_risk_class === "low") {
    confirmationStatus = "auto_confirmed_low_ambiguity";
  } else {
    confirmationStatus = "pending";
  }

  return {
    request_id: requestId,
    raw_request: rawRequest,
    ...result,
    confirmation_status: confirmationStatus,
    schema_version: CURRENT_SCHEMA_VERSION,
    created_at: now,
    updated_at: now,
  };
}

// ─── Main intent classifier (LLM with keyword fallback) ────────────────

export async function intentClassifier(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();
  const { rawRequest, requestId, jobId } = state;

  cb?.onGate("gate_0", "Classifying intent...");

  // Check graph context for prior knowledge
  const graphCtx = state.graphContext;
  const hasPriorKnowledge =
    (graphCtx?.priorBuilds?.length || 0) > 0 ||
    (graphCtx?.similarFeatures?.length || 0) > 0;

  if (hasPriorKnowledge) {
    cb?.onStep(
      `Graph context: ${graphCtx.priorBuilds.length} prior builds, ${graphCtx.similarFeatures.length} similar features inform classification`
    );
  }

  let brief: any;
  let usedLLM = false;

  if (isLLMAvailable()) {
    try {
      cb?.onStep("Using LLM for intent classification...");
      brief = await llmClassifyIntent(rawRequest, requestId);
      usedLLM = true;
      cb?.onSuccess("LLM classification complete");
    } catch (err: any) {
      cb?.onWarn(`LLM classification failed (${err.message}), falling back to keyword classifier`);
      brief = keywordClassifyIntent(rawRequest, requestId);
    }
  } else {
    cb?.onStep("No LLM configured, using keyword classifier");
    brief = keywordClassifyIntent(rawRequest, requestId);
  }

  // Enrich brief with graph context — if we've built similar apps before,
  // reduce ambiguity and carry forward learned patterns
  if (hasPriorKnowledge) {
    // If prior builds exist for this app class, clear ambiguity flags
    // that the system has already resolved in past runs
    const priorAppClasses = graphCtx.priorBuilds
      .map((b: any) => b.name?.toLowerCase() || "")
      .filter(Boolean);
    const classLower = brief.inferred_app_class.replace(/_/g, " ");

    if (priorAppClasses.some((p: string) => p.includes(classLower) || classLower.includes(p))) {
      const cleared = brief.ambiguity_flags.length;
      brief.ambiguity_flags = [];
      if (cleared > 0) {
        cb?.onStep(`Cleared ${cleared} ambiguity flags — system has built this app class before`);
        brief.assumptions = [
          ...(brief.assumptions || []),
          `Ambiguity resolved via prior build knowledge (${graphCtx.priorBuilds.length} prior builds)`,
        ];
      }
    }

    // Carry forward known integrations from similar prior builds
    const priorDescriptions = [
      ...graphCtx.priorBuilds.map((b: any) => b.description || ""),
      ...graphCtx.similarFeatures.map((f: any) => f.description || ""),
    ].join(" ").toLowerCase();

    for (const [type, keywords] of Object.entries(INTEGRATION_KEYWORDS)) {
      if (
        !brief.inferred_integrations.includes(type) &&
        keywords.some((kw: string) => priorDescriptions.includes(kw))
      ) {
        brief.inferred_integrations.push(type);
        cb?.onStep(`Added integration '${type}' from prior build knowledge`);
      }
    }
  }

  cb?.onStep(`App class: ${brief.inferred_app_class}`);
  cb?.onStep(`Risk: ${brief.inferred_risk_class}`);
  cb?.onStep(`Platforms: ${brief.inferred_platforms.join(", ")}`);
  if (brief.inferred_integrations.length > 0) cb?.onStep(`Integrations: ${brief.inferred_integrations.join(", ")}`);
  if (brief.ambiguity_flags.length > 0) cb?.onWarn(`Ambiguity flags: ${brief.ambiguity_flags.join(", ")}`);

  store.addLog(jobId, {
    gate: "gate_0",
    message: `Classified as ${brief.inferred_app_class} (${brief.inferred_risk_class} risk), method: ${usedLLM ? "llm" : "keyword"}, status: ${brief.confirmation_status}`,
  });

  const intentConfirmed = brief.confirmation_status === "auto_confirmed_low_ambiguity";

  if (intentConfirmed) {
    cb?.onSuccess(`Auto-confirmed: ${brief.inferred_app_class} (${usedLLM ? "LLM" : "keyword"})`);
  } else {
    cb?.onStep("Needs confirmation");
  }

  return {
    intentBrief: brief,
    intentConfirmed,
  };
}
