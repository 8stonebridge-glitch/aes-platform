/**
 * Typed schemas for knowledge learned via reverse-engineering.
 *
 * These are the canonical shapes that the reverse-engineer and learn-ui
 * tools produce. The graph-reader and downstream nodes consume them.
 *
 * Mirrors the rigor of artifacts.ts — every field is concrete, no `any`.
 */
export declare const LEARNED_SCHEMA_VERSION = 1;
export interface LearnedApp {
    source_id: string;
    name: string;
    description: string;
    app_class: string;
    source_url: string;
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
export interface LearnedTechStack {
    framework: string;
    language: string;
    runtime: string;
    database: string;
    orm: string;
    styling: string;
    testing: string;
    build_tool: string;
    monorepo: boolean;
    key_packages: string[];
}
export interface LearnedFeature {
    feature_id: string;
    name: string;
    description: string;
    directory: string;
    complexity: "simple" | "moderate" | "complex";
    file_count: number;
    has_tests: boolean;
    has_api: boolean;
    dependencies: string[];
    related_data_models: string[];
    related_integrations: string[];
}
export interface LearnedDataModel {
    name: string;
    category: DataModelCategory;
    fields: LearnedField[];
    relations: LearnedRelation[];
}
export type DataModelCategory = "auth_identity" | "scheduling" | "payments" | "automation" | "integration" | "organization" | "calendar" | "routing" | "audit" | "infrastructure" | "auth_oauth" | "notifications" | "general";
export interface LearnedField {
    name: string;
    type: string;
    required: boolean;
    is_id: boolean;
    is_unique: boolean;
}
export interface LearnedRelation {
    target_model: string;
    type: "one_to_one" | "one_to_many" | "many_to_many";
    field_name: string;
}
export interface LearnedIntegration {
    name: string;
    type: IntegrationType;
    provider: string;
    category: string;
    auth_method: "oauth" | "api_key" | "webhook" | "unknown";
}
export type IntegrationType = "payment" | "calendar" | "video_conferencing" | "crm" | "email" | "sms" | "messaging" | "analytics" | "automation" | "storage" | "auth" | "monitoring" | "cloud" | "other";
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
    name: string;
    endpoint_count: number;
    has_crud: boolean;
    has_search: boolean;
    has_batch: boolean;
}
export interface LearnedUI {
    design_system: LearnedDesignSystem;
    components: LearnedComponentLibrary;
    pages: LearnedPageStructure;
    navigation: LearnedNavigation;
    user_flows: LearnedUserFlow[];
    form_patterns: LearnedFormPattern[];
    state_patterns: LearnedStatePattern[];
    component_patterns?: {
        name: string;
        category: string;
        props: string[];
        child_components: string[];
        uses_state: boolean;
        uses_effects: boolean;
        line_count: number;
        file_path: string;
    }[];
}
export interface LearnedDesignSystem {
    css_framework: string;
    component_library: string;
    icon_library: string;
    color_system: LearnedColorSystem;
    typography: LearnedTypography;
    spacing: LearnedSpacing;
}
export interface LearnedColorSystem {
    token_count: number;
    categories: string[];
    has_dark_mode: boolean;
    has_custom_theming: boolean;
}
export interface LearnedTypography {
    font_families: string[];
    scale: string[];
    has_display_font: boolean;
}
export interface LearnedSpacing {
    system: "tailwind" | "css_variables" | "theme_object" | "custom";
    base_unit: string;
}
export interface LearnedComponentLibrary {
    total_components: number;
    categories: LearnedComponentCategory[];
}
export interface LearnedComponentCategory {
    name: string;
    count: number;
    key_components: string[];
}
export interface LearnedPageStructure {
    total_pages: number;
    sections: LearnedPageSection[];
}
export interface LearnedPageSection {
    name: string;
    page_count: number;
    is_public: boolean;
    requires_auth: boolean;
    key_routes: string[];
}
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
    badge: boolean;
}
export interface LearnedUserFlow {
    name: string;
    section: string;
    step_count: number;
    steps: LearnedFlowStep[];
    entry_point: string;
}
export interface LearnedFlowStep {
    order: number;
    name: string;
    description: string;
    route: string;
    requires_input: boolean;
    can_skip: boolean;
}
export interface LearnedFormPattern {
    name: string;
    validation_library: string;
    form_library: string;
    components: string[];
    has_multi_step: boolean;
    has_file_upload: boolean;
}
export interface LearnedStatePattern {
    type: "loading" | "empty" | "error" | "success" | "notification";
    component: string;
    description: string;
    scope: "page" | "section" | "component" | "global";
}
export interface LearnedPattern {
    name: string;
    type: PatternType;
    description: string;
    evidence: string;
    applicable_to: string[];
    key_files: string[];
}
export type PatternType = "architecture" | "data_access" | "api" | "auth" | "validation" | "forms" | "data_fetching" | "styling" | "components" | "localization" | "payments" | "integration" | "caching" | "notifications" | "extensibility" | "automation" | "routing" | "compliance" | "distribution" | "testing" | "deployment";
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
export declare const LEARNED_NODE_LABELS: {
    readonly app: "LearnedApp";
    readonly feature: "LearnedFeature";
    readonly data_model: "LearnedDataModel";
    readonly integration: "LearnedIntegration";
    readonly api_domain: "LearnedApiDomain";
    readonly component_group: "LearnedComponentGroup";
    readonly page_section: "LearnedPageSection";
    readonly user_flow: "LearnedUserFlow";
    readonly pattern: "LearnedPattern";
    readonly design_system: "LearnedDesignSystem";
    readonly form_pattern: "LearnedFormPattern";
    readonly state_pattern: "LearnedStatePattern";
};
export declare const LEARNED_RELATIONSHIPS: {
    readonly has_feature: "HAS_FEATURE";
    readonly has_data_model: "HAS_DATA_MODEL";
    readonly has_integration: "HAS_INTEGRATION";
    readonly has_api_domain: "HAS_API_DOMAIN";
    readonly has_components: "HAS_COMPONENTS";
    readonly has_pages: "HAS_PAGES";
    readonly has_user_flow: "HAS_USER_FLOW";
    readonly has_pattern: "USES_PATTERN";
    readonly has_design_system: "HAS_DESIGN_SYSTEM";
    readonly has_form_pattern: "HAS_FORM_PATTERN";
    readonly has_state_pattern: "HAS_STATE_PATTERN";
    readonly feature_uses_model: "USES_MODEL";
    readonly feature_uses_integration: "USES_INTEGRATION";
    readonly model_relates_to: "RELATES_TO";
};
