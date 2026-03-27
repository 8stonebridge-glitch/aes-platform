import { z } from "zod";

export const AppClass = z.enum([
  "internal_ops_tool",
  "customer_portal",
  "fintech_wallet",
  "marketplace",
  "saas_platform",
  "content_cms",
  "analytics_dashboard",
  "iot_control_panel",
  "healthcare_portal",
  "education_platform",
  "social_platform",
]);
export type AppClass = z.infer<typeof AppClass>;

export const RiskLevel = z.enum(["low", "medium", "high", "regulated"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

export const APP_CLASS_ROUTING = {
  internal_ops_tool: {
    default_template: "admin-console",
    validator_emphasis: ["permission", "audit_trail"],
    risk_default: "low" as const,
    description: "Internal tools for operational teams with strong permission and audit needs",
    typical_actors: ["admin", "operator", "support_agent"],
  },
  customer_portal: {
    default_template: "customer-portal",
    validator_emphasis: ["responsive_ui", "offline_reconnect"],
    risk_default: "medium" as const,
    description: "Customer-facing portals with responsive and offline requirements",
    typical_actors: ["customer", "guest", "support_agent"],
  },
  fintech_wallet: {
    default_template: "fintech-wallet",
    validator_emphasis: ["audit_trail", "external_api_fallback", "offline_reconnect", "idempotency_check", "pii_compliance"],
    risk_default: "regulated" as const,
    description: "Financial products with strict regulatory, audit, and idempotency requirements",
    typical_actors: ["account_holder", "admin", "compliance_officer"],
  },
  marketplace: {
    default_template: "marketplace",
    validator_emphasis: ["permission", "external_api_fallback", "responsive_ui", "tenant_isolation"],
    risk_default: "high" as const,
    description: "Two-sided marketplaces with seller/buyer isolation and payment integration",
    typical_actors: ["buyer", "seller", "admin", "moderator"],
  },
  saas_platform: {
    default_template: "saas-platform",
    validator_emphasis: ["tenant_isolation", "permission", "audit_trail", "responsive_ui"],
    risk_default: "high" as const,
    description: "Multi-tenant SaaS with strong isolation, permissions, and audit needs",
    typical_actors: ["workspace_admin", "member", "billing_admin", "super_admin"],
  },
  content_cms: {
    default_template: "content-cms",
    validator_emphasis: ["permission", "responsive_ui", "workflow_integrity"],
    risk_default: "low" as const,
    description: "Content management systems with publishing workflows and role-based editing",
    typical_actors: ["author", "editor", "reviewer", "admin"],
  },
  analytics_dashboard: {
    default_template: "analytics-dashboard",
    validator_emphasis: ["permission", "responsive_ui", "external_api_fallback"],
    risk_default: "medium" as const,
    description: "Data dashboards with query-heavy backends and visualization-heavy frontends",
    typical_actors: ["analyst", "viewer", "admin"],
  },
  iot_control_panel: {
    default_template: "iot-control-panel",
    validator_emphasis: ["offline_reconnect", "external_api_fallback", "audit_trail"],
    risk_default: "high" as const,
    description: "IoT device management with real-time data, offline resilience, and device control",
    typical_actors: ["device_operator", "fleet_admin", "technician"],
  },
  healthcare_portal: {
    default_template: "healthcare-portal",
    validator_emphasis: ["pii_compliance", "audit_trail", "permission", "offline_reconnect"],
    risk_default: "regulated" as const,
    description: "Healthcare applications with HIPAA-grade PII handling and strict audit requirements",
    typical_actors: ["patient", "provider", "admin", "compliance_officer"],
  },
  education_platform: {
    default_template: "education-platform",
    validator_emphasis: ["responsive_ui", "permission", "offline_reconnect"],
    risk_default: "medium" as const,
    description: "Learning platforms with student/instructor roles and content delivery",
    typical_actors: ["student", "instructor", "admin", "parent"],
  },
  social_platform: {
    default_template: "social-platform",
    validator_emphasis: ["responsive_ui", "permission", "pii_compliance", "tenant_isolation"],
    risk_default: "high" as const,
    description: "Social applications with user-generated content, privacy controls, and moderation",
    typical_actors: ["user", "moderator", "admin"],
  },
} as const;

export type AppClassConfig = (typeof APP_CLASS_ROUTING)[AppClass];

export function routingForClass(appClass: AppClass) {
  return APP_CLASS_ROUTING[appClass];
}

export function riskForClass(appClass: AppClass): RiskLevel {
  return APP_CLASS_ROUTING[appClass].risk_default as RiskLevel;
}

export function validatorEmphasisForClass(appClass: AppClass): readonly string[] {
  return APP_CLASS_ROUTING[appClass].validator_emphasis;
}
