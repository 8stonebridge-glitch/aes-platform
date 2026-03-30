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
};
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
};
