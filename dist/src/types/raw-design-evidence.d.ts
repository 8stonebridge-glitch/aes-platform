/**
 * raw-design-evidence.ts — Loose authoring types for design evidence.
 *
 * These types accept alternative field names, missing defaults, and
 * optional derived fields. The normalizeDesignEvidence() function in
 * design-normalize.ts maps this shape into the canonical DesignEvidence
 * type before persistence.
 *
 * Rules:
 *   - Every field that has a canonical equivalent accepts both names
 *   - Boolean flags default to conservative values when omitted
 *   - Derived fields (implied_model, implied_operation) accept hints
 *   - Arrays default to [] when omitted
 */
export interface RawDesignEvidence {
    evidence_id?: string;
    source: RawDesignSource;
    screens: RawDesignScreen[];
    navigation?: RawNavigationGraph;
    components?: RawDesignComponent[];
    data_views?: RawDataView[];
    forms?: RawDesignForm[];
    actions?: RawDesignAction[];
    states?: RawDesignState[];
    layout?: RawLayoutInfo;
    extraction_meta?: Partial<RawExtractionMeta>;
    extracted_at?: string;
}
export interface RawDesignSource {
    type: "paper" | "figma" | "screenshot" | "html" | "manual";
    ref: string;
    name: string;
    artboard_ids?: string[];
    artboard_count?: number;
}
export interface RawDesignScreen {
    /** Accepts screen_id or id */
    screen_id?: string;
    id?: string;
    name: string;
    purpose: string;
    artboard_ref?: string;
    dimensions?: {
        width: number;
        height: number;
    };
    is_overlay?: boolean;
    regions?: RawScreenRegion[];
    /** Can be component_ids or components (name strings) */
    component_ids?: string[];
    components?: string[];
    data_view_ids?: string[];
    form_ids?: string[];
    action_ids?: string[];
    state_ids?: string[];
}
export interface RawScreenRegion {
    name: string;
    purpose: string;
    /** Accepts component_ids or components */
    component_ids?: string[];
    components?: string[];
}
export interface RawNavigationGraph {
    primary_items?: RawNavItem[];
    secondary_items?: RawNavItem[];
    edges?: RawNavEdge[];
}
export interface RawNavItem {
    label: string;
    /** Accepts target_screen_id or target_screen */
    target_screen_id?: string;
    target_screen?: string;
    icon?: string;
    level?: "primary" | "secondary" | "contextual";
    parent?: string;
    badge?: string;
}
export interface RawNavEdge {
    from_screen_id: string;
    to_screen_id: string;
    trigger: string;
    /** Accepts label or nav_type */
    label?: string;
    nav_type?: string;
}
export interface RawDesignComponent {
    /** Accepts component_id or id */
    component_id?: string;
    id?: string;
    name: string;
    category?: string;
    purpose?: string;
    screen_ids?: string[];
    visible_props?: string[];
    children?: string[];
    interactions?: string[];
}
export interface RawDataView {
    /** Accepts view_id, data_view_id, or id */
    view_id?: string;
    data_view_id?: string;
    id?: string;
    name: string;
    type?: string;
    screen_id?: string;
    columns?: RawDataColumn[];
    /** Accepts implied_model or source_hint */
    implied_model?: string;
    source_hint?: string;
    capabilities?: string[];
    row_actions?: string[];
    bulk_actions?: string[];
}
export interface RawDataColumn {
    name: string;
    type?: string;
    sortable?: boolean;
    filterable?: boolean;
}
export interface RawDesignForm {
    /** Accepts form_id or id */
    form_id?: string;
    id?: string;
    name: string;
    screen_id?: string;
    fields?: RawFormField[];
    /** Accepts submit_label or submit_text */
    submit_label?: string;
    submit_text?: string;
    cancel_label?: string;
    is_multi_step?: boolean;
    has_validation?: boolean;
}
export interface RawFormField {
    /** Accepts name or field_id */
    name?: string;
    field_id?: string;
    label?: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
    helper_text?: string;
    options?: string[];
}
export interface RawDesignAction {
    /** Accepts action_id or id */
    action_id?: string;
    id?: string;
    /** Accepts label or name */
    label?: string;
    name?: string;
    type?: string;
    screen_id?: string;
    element?: string;
    is_destructive?: boolean;
    is_primary?: boolean;
    target_screen_id?: string;
    /** Accepts implied_operation or api_hint */
    implied_operation?: string;
    api_hint?: string;
}
export interface RawDesignState {
    /** Accepts state_id or id */
    state_id?: string;
    id?: string;
    type: string;
    screen_id?: string;
    description: string;
    explicit?: boolean;
    recovery_action?: string;
}
export interface RawLayoutInfo {
    pattern?: string;
    responsive_notes?: string[];
    sidebar?: {
        position?: string;
        collapsible?: boolean;
        width_hint?: string;
    };
    topbar?: {
        sticky?: boolean;
        has_search?: boolean;
        has_user_menu?: boolean;
        has_notifications?: boolean;
    };
    content?: {
        max_width?: string;
        padding?: string;
    };
}
export interface RawExtractionMeta {
    confidence?: number;
    artboards_analyzed?: number;
    nodes_traversed?: number;
    warnings?: {
        type: string;
        message: string;
        ref?: string;
    }[];
    duration_ms?: number;
}
