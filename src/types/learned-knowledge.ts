/**
 * Typed schemas for knowledge learned via reverse-engineering.
 *
 * These are the canonical shapes that the reverse-engineer and learn-ui
 * tools produce. The graph-reader and downstream nodes consume them.
 *
 * Mirrors the rigor of artifacts.ts — every field is concrete, no `any`.
 */

// ─── Schema Version ──────────────────────────────────────────────────

export const LEARNED_SCHEMA_VERSION = 1;

// ─── App Blueprint (top-level learned app) ───────────────────────────

export interface LearnedApp {
  source_id: string;                        // e.g. "learned-calcom-monorepo"
  name: string;                             // e.g. "calcom-monorepo"
  description: string;
  app_class: string;                        // maps to AES app_class taxonomy
  source_url: string;                       // GitHub URL or local path
  tech_stack: LearnedTechStack;
  features: LearnedFeature[];
  data_models: LearnedDataModel[];
  integrations: LearnedIntegration[];
  api_surface: LearnedApiSurface;
  ui: LearnedUI;
  patterns: LearnedPattern[];
  stats: LearnedStats;
  schema_version: number;
  learned_at: string;
}

// ─── Tech Stack ──────────────────────────────────────────────────────

export interface LearnedTechStack {
  framework: string;                        // "Next.js", "Remix", "Express"
  language: string;                         // "TypeScript", "JavaScript"
  runtime: string;                          // "Node.js", "Bun", "Deno"
  database: string;                         // "PostgreSQL (Prisma)", "MongoDB"
  orm: string;                              // "Prisma", "Drizzle", "TypeORM"
  styling: string;                          // "Tailwind CSS", "CSS Modules"
  testing: string;                          // "Vitest", "Jest", "Playwright"
  build_tool: string;                       // "Turborepo", "Nx", "Vite"
  monorepo: boolean;
  key_packages: string[];                   // top dependencies
}

// ─── Feature ─────────────────────────────────────────────────────────

export interface LearnedFeature {
  feature_id: string;                       // "feat-bookings"
  name: string;                             // "Bookings"
  description: string;                      // what it does
  directory: string;                        // relative path in source
  complexity: "simple" | "moderate" | "complex";
  file_count: number;
  has_tests: boolean;
  has_api: boolean;
  dependencies: string[];                   // package deps
  related_data_models: string[];            // model names used
  related_integrations: string[];           // integration names used
}

// ─── Data Model ──────────────────────────────────────────────────────

export interface LearnedDataModel {
  name: string;                             // "Booking", "User", "Payment"
  category: DataModelCategory;
  fields: LearnedField[];
  relations: LearnedRelation[];
}

export type DataModelCategory =
  | "auth_identity"
  | "scheduling"
  | "payments"
  | "automation"
  | "integration"
  | "organization"
  | "calendar"
  | "routing"
  | "audit"
  | "infrastructure"
  | "auth_oauth"
  | "notifications"
  | "general";

export interface LearnedField {
  name: string;                             // "userId"
  type: string;                             // "Int", "String", "DateTime"
  required: boolean;
  is_id: boolean;
  is_unique: boolean;
}

export interface LearnedRelation {
  target_model: string;                     // "User"
  type: "one_to_one" | "one_to_many" | "many_to_many";
  field_name: string;                       // "user"
}

// ─── Integration ─────────────────────────────────────────────────────

export interface LearnedIntegration {
  name: string;                             // "stripe", "googlecalendar"
  type: IntegrationType;
  provider: string;                         // human-readable name
  category: string;                         // "payment", "calendar", etc.
  auth_method: "oauth" | "api_key" | "webhook" | "unknown";
}

export type IntegrationType =
  | "payment"
  | "calendar"
  | "video_conferencing"
  | "crm"
  | "email"
  | "sms"
  | "messaging"
  | "analytics"
  | "automation"
  | "storage"
  | "auth"
  | "monitoring"
  | "cloud"
  | "other";

// ─── API Surface ─────────────────────────────────────────────────────

export interface LearnedApiSurface {
  style: ApiStyle;
  routes: LearnedApiRoute[];
  domains: LearnedApiDomain[];
  total_endpoints: number;
}

export type ApiStyle = "rest" | "trpc" | "graphql" | "grpc" | "mixed";

export interface LearnedApiRoute {
  path: string;
  methods: string[];
  domain: string;
  is_public: boolean;
}

export interface LearnedApiDomain {
  name: string;                             // "bookings", "users", "payments"
  endpoint_count: number;
  has_crud: boolean;
  has_search: boolean;
  has_batch: boolean;
}

// ─── UI ──────────────────────────────────────────────────────────────

export interface LearnedUI {
  design_system: LearnedDesignSystem;
  components: LearnedComponentLibrary;
  pages: LearnedPageStructure;
  navigation: LearnedNavigation;
  user_flows: LearnedUserFlow[];
  form_patterns: LearnedFormPattern[];
  state_patterns: LearnedStatePattern[];
}

// Design System
export interface LearnedDesignSystem {
  css_framework: string;                    // "Tailwind CSS"
  component_library: string;                // "Radix UI + Base UI"
  icon_library: string;                     // "Lucide"
  color_system: LearnedColorSystem;
  typography: LearnedTypography;
  spacing: LearnedSpacing;
}

export interface LearnedColorSystem {
  token_count: number;
  categories: string[];                     // ["brand", "bg", "border", "text", "semantic"]
  has_dark_mode: boolean;
  has_custom_theming: boolean;              // per-org/user brand colors
}

export interface LearnedTypography {
  font_families: string[];                  // ["Inter", "Cal Sans"]
  scale: string[];                          // ["xs", "sm", "base", "lg", "xl", "2xl"]
  has_display_font: boolean;
}

export interface LearnedSpacing {
  system: "tailwind" | "css_variables" | "theme_object" | "custom";
  base_unit: string;                        // "4px", "0.25rem"
}

// Component Library
export interface LearnedComponentLibrary {
  total_components: number;
  categories: LearnedComponentCategory[];
}

export interface LearnedComponentCategory {
  name: string;                             // "form", "overlay", "navigation"
  count: number;
  key_components: string[];                 // ["Button", "Dialog", "Select"]
}

// Page Structure
export interface LearnedPageStructure {
  total_pages: number;
  sections: LearnedPageSection[];
}

export interface LearnedPageSection {
  name: string;                             // "dashboard", "settings", "auth"
  page_count: number;
  is_public: boolean;
  requires_auth: boolean;
  key_routes: string[];
}

// Navigation
export interface LearnedNavigation {
  style: "sidebar" | "topnav" | "bottomnav" | "mixed";
  items: LearnedNavItem[];
  has_command_palette: boolean;
  has_mobile_nav: boolean;
  has_breadcrumbs: boolean;
}

export interface LearnedNavItem {
  label: string;
  route: string;
  icon: string;
  section: string;
  has_submenu: boolean;
  badge: boolean;                           // notification badge
}

// User Flows
export interface LearnedUserFlow {
  name: string;                             // "User Onboarding"
  section: string;                          // "onboarding"
  step_count: number;
  steps: LearnedFlowStep[];
  entry_point: string;                      // route or trigger
}

export interface LearnedFlowStep {
  order: number;
  name: string;
  description: string;
  route: string;
  requires_input: boolean;
  can_skip: boolean;
}

// Form Patterns
export interface LearnedFormPattern {
  name: string;                             // "Event Type Creator"
  validation_library: string;               // "zod", "yup"
  form_library: string;                     // "react-hook-form"
  components: string[];                     // ["Input", "Select", "DatePicker"]
  has_multi_step: boolean;
  has_file_upload: boolean;
}

// State Patterns
export interface LearnedStatePattern {
  type: "loading" | "empty" | "error" | "success" | "notification";
  component: string;                        // "Skeleton", "EmptyScreen"
  description: string;
  scope: "page" | "section" | "component" | "global";
}

// ─── Patterns ────────────────────────────────────────────────────────

export interface LearnedPattern {
  name: string;                             // "Monorepo Architecture"
  type: PatternType;
  description: string;
  evidence: string;                         // how we detected it
  applicable_to: string[];                  // which app classes benefit
  key_files: string[];                      // reference files in source
}

export type PatternType =
  | "architecture"
  | "data_access"
  | "api"
  | "auth"
  | "validation"
  | "forms"
  | "data_fetching"
  | "styling"
  | "components"
  | "localization"
  | "payments"
  | "integration"
  | "caching"
  | "notifications"
  | "extensibility"
  | "automation"
  | "routing"
  | "compliance"
  | "distribution"
  | "testing"
  | "deployment";

// ─── Stats ───────────────────────────────────────────────────────────

export interface LearnedStats {
  total_files: number;
  total_components: number;
  total_pages: number;
  total_models: number;
  total_integrations: number;
  total_api_endpoints: number;
  total_patterns: number;
  total_user_flows: number;
}

// ─── Graph Node Labels ───────────────────────────────────────────────
// These map to Neo4j node labels for the learned knowledge layer.

export const LEARNED_NODE_LABELS = {
  app: "LearnedApp",
  feature: "LearnedFeature",
  data_model: "LearnedDataModel",
  integration: "LearnedIntegration",
  api_domain: "LearnedApiDomain",
  component_group: "LearnedComponentGroup",
  page_section: "LearnedPageSection",
  user_flow: "LearnedUserFlow",
  pattern: "LearnedPattern",
  design_system: "LearnedDesignSystem",
  form_pattern: "LearnedFormPattern",
  state_pattern: "LearnedStatePattern",
} as const;

// ─── Graph Relationship Types ────────────────────────────────────────

export const LEARNED_RELATIONSHIPS = {
  has_feature: "HAS_FEATURE",
  has_data_model: "HAS_DATA_MODEL",
  has_integration: "HAS_INTEGRATION",
  has_api_domain: "HAS_API_DOMAIN",
  has_components: "HAS_COMPONENTS",
  has_pages: "HAS_PAGES",
  has_user_flow: "HAS_USER_FLOW",
  has_pattern: "USES_PATTERN",
  has_design_system: "HAS_DESIGN_SYSTEM",
  has_form_pattern: "HAS_FORM_PATTERN",
  has_state_pattern: "HAS_STATE_PATTERN",
  feature_uses_model: "USES_MODEL",
  feature_uses_integration: "USES_INTEGRATION",
  model_relates_to: "RELATES_TO",
} as const;
