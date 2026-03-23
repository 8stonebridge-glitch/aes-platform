import type { AESStateType } from "../state.js";
import { randomUUID } from "node:crypto";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

// Keyword-based classification — no LLM needed for now.
// Will be replaced with LLM classification later.

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

export async function intentClassifier(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();
  const input = state.rawRequest;

  cb?.onGate("gate_0", "Classifying intent...");

  const appClass = classifyAppClass(input);
  const riskClass = classifyRisk(input, appClass);
  const platforms = classifyPlatforms(input);
  const integrations = classifyIntegrations(input);
  const ambiguityFlags = detectAmbiguity(input, appClass);
  const coreOutcome = inferCoreOutcome(input, appClass);
  const primaryUsers = inferPrimaryUsers(appClass);

  // Build confirmation statement
  const confirmationStatement = `You want a ${appClass.replace(/_/g, " ")} for ${primaryUsers.join(" and ")}, focused on ${coreOutcome}, delivered as ${platforms.join(" + ")}${integrations.length > 0 ? `, with ${integrations.join(", ")}` : ""} — correct?`;

  // Determine confirmation status
  let confirmationStatus: string;
  if (ambiguityFlags.length === 0 && riskClass === "low") {
    confirmationStatus = "auto_confirmed_low_ambiguity";
  } else {
    confirmationStatus = "pending";
  }

  const intentBrief = {
    request_id: state.requestId,
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
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  cb?.onStep(`App class: ${appClass}`);
  cb?.onStep(`Risk: ${riskClass}`);
  cb?.onStep(`Platforms: ${platforms.join(", ")}`);
  if (integrations.length > 0) cb?.onStep(`Integrations: ${integrations.join(", ")}`);
  if (ambiguityFlags.length > 0) cb?.onWarn(`Ambiguity flags: ${ambiguityFlags.join(", ")}`);

  store.addLog(state.jobId, {
    gate: "gate_0",
    message: `Classified as ${appClass} (${riskClass} risk), status: ${confirmationStatus}`,
  });

  if (confirmationStatus === "auto_confirmed_low_ambiguity") {
    cb?.onSuccess("Auto-confirmed — low ambiguity, low risk");
    return {
      intentBrief,
      intentConfirmed: true,
    };
  }

  cb?.onStep("Needs confirmation");
  return {
    intentBrief,
    intentConfirmed: false,
  };
}
