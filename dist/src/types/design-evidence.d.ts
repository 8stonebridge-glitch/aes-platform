/**
 * design-evidence.ts — Typed schema for design-as-evidence in AES.
 * Designs become first-class evidence comparable to donor code and graph knowledge.
 */
export interface DesignEvidence {
    /** Unique ID for this extraction */
    evidence_id: string;
    /** Where the design came from */
    source: DesignSource;
    /** Extracted screens/pages */
    screens: DesignScreen[];
    /** Navigation graph between screens */
    navigation: NavigationGraph;
    /** All extracted components across screens */
    components: DesignComponent[];
    /** All data views (tables, lists, cards, detail panes) */
    data_views: DataView[];
    /** All forms and their fields */
    forms: DesignForm[];
    /** All user actions discovered */
    actions: DesignAction[];
    /** All UI states discovered (loading, empty, error, success, etc.) */
    states: DesignState[];
    /** Layout and responsive notes */
    layout: LayoutInfo;
    /** Extraction quality metrics */
    extraction_meta: ExtractionMeta;
    /** ISO timestamp */
    extracted_at: string;
}
export interface DesignSource {
    type: "paper" | "figma" | "screenshot" | "html" | "manual";
    /** Paper document ID, Figma URL, file path, etc. */
    ref: string;
    /** Human-readable name */
    name: string;
    /** Artboard/frame IDs that were extracted */
    artboard_ids?: string[];
    /** Number of artboards/frames in source */
    artboard_count?: number;
}
export interface DesignScreen {
    /** Unique screen ID (slug) */
    screen_id: string;
    /** Human name: "Dashboard", "Settings", "User Profile" */
    name: string;
    /** What this screen does */
    purpose: string;
    /** Source artboard/frame ID */
    artboard_ref?: string;
    /** Screen dimensions */
    dimensions?: {
        width: number;
        height: number;
    };
    /** Is this a modal/dialog/overlay rather than a full page? */
    is_overlay: boolean;
    /** Regions/sections within the screen */
    regions: ScreenRegion[];
    /** Component IDs used on this screen */
    component_ids: string[];
    /** Data view IDs on this screen */
    data_view_ids: string[];
    /** Form IDs on this screen */
    form_ids: string[];
    /** Action IDs available on this screen */
    action_ids: string[];
    /** States shown on this screen */
    state_ids: string[];
}
export interface ScreenRegion {
    /** Region name: "header", "sidebar", "main", "footer", "modal-body" */
    name: string;
    /** What's in this region */
    purpose: string;
    /** Component IDs in this region */
    component_ids: string[];
}
export interface NavigationGraph {
    /** Top-level nav items */
    primary_items: NavItem[];
    /** Secondary/nested nav items */
    secondary_items: NavItem[];
    /** Edges: screen A -> screen B via action/link */
    edges: NavEdge[];
}
export interface NavItem {
    label: string;
    target_screen_id: string;
    icon?: string;
    /** Is this in the primary nav (sidebar/topbar) or secondary? */
    level: "primary" | "secondary" | "contextual";
    /** Parent nav item label (for nested nav) */
    parent?: string;
    /** Badge/indicator (e.g., notification count) */
    badge?: string;
}
export interface NavEdge {
    from_screen_id: string;
    to_screen_id: string;
    trigger: string;
    label?: string;
}
export interface DesignComponent {
    /** Unique component ID */
    component_id: string;
    /** Component name: "ProjectTable", "UserAvatar", "BillingCard" */
    name: string;
    /** Category */
    category: "data_display" | "form" | "navigation" | "layout" | "feedback" | "action" | "media" | "overlay" | "status" | "other";
    /** What this component shows/does */
    purpose: string;
    /** Screen IDs where this component appears */
    screen_ids: string[];
    /** Props/configuration visible in the design */
    visible_props: string[];
    /** Child component IDs */
    children: string[];
    /** Interaction patterns (hover, click, drag, etc.) */
    interactions: string[];
}
export interface DataView {
    /** Unique ID */
    view_id: string;
    /** Name: "Projects Table", "Team Members List" */
    name: string;
    /** Type of data presentation */
    type: "table" | "list" | "card_grid" | "detail_pane" | "tree" | "timeline" | "chart" | "kanban" | "calendar";
    /** Screen ID where this view lives */
    screen_id: string;
    /** Columns/fields visible */
    columns: DataColumn[];
    /** Implied data model name (e.g., "Project", "User") */
    implied_model: string;
    /** Capabilities visible in the design */
    capabilities: DataViewCapability[];
    /** Row/item actions (edit, delete, view, etc.) */
    row_actions: string[];
    /** Bulk actions if visible */
    bulk_actions: string[];
}
export interface DataColumn {
    name: string;
    /** Inferred type */
    type: "text" | "number" | "date" | "status" | "avatar" | "badge" | "action" | "checkbox" | "link" | "image" | "custom";
    /** Is this column sortable (sort icon visible)? */
    sortable: boolean;
    /** Is there a filter for this column? */
    filterable: boolean;
}
export type DataViewCapability = "sort" | "filter" | "search" | "pagination" | "infinite_scroll" | "select_rows" | "bulk_actions" | "column_resize" | "column_reorder" | "export" | "inline_edit" | "expand_row" | "drag_reorder";
export interface DesignForm {
    /** Unique ID */
    form_id: string;
    /** Name: "Create Project Form", "Login Form" */
    name: string;
    /** Screen ID */
    screen_id: string;
    /** Form fields */
    fields: FormField[];
    /** Submit action label */
    submit_label: string;
    /** Cancel/secondary action label */
    cancel_label?: string;
    /** Is this a multi-step/wizard form? */
    is_multi_step: boolean;
    /** Validation visible in design (required indicators, helper text) */
    has_validation: boolean;
}
export interface FormField {
    name: string;
    label: string;
    type: "text" | "email" | "password" | "number" | "date" | "select" | "multiselect" | "checkbox" | "radio" | "toggle" | "textarea" | "file" | "color" | "rich_text" | "search" | "phone" | "url" | "custom";
    required: boolean;
    placeholder?: string;
    /** Helper text visible in design */
    helper_text?: string;
    /** Options for select/radio/checkbox */
    options?: string[];
}
export interface DesignAction {
    /** Unique ID */
    action_id: string;
    /** Label: "Create Project", "Delete User", "Export CSV" */
    label: string;
    /** What kind of action */
    type: "create" | "update" | "delete" | "navigate" | "filter" | "sort" | "export" | "import" | "toggle" | "confirm" | "cancel" | "submit" | "search" | "bulk" | "custom";
    /** Screen where this action lives */
    screen_id: string;
    /** UI element: "button", "link", "menu_item", "icon_button", "dropdown_item" */
    element: string;
    /** Is this destructive? (red, requires confirmation) */
    is_destructive: boolean;
    /** Is this the primary action on the screen? */
    is_primary: boolean;
    /** Where does this action lead? (screen_id or null) */
    target_screen_id?: string;
    /** Implied API operation */
    implied_operation?: string;
}
export interface DesignState {
    /** Unique ID */
    state_id: string;
    /** State type */
    type: "loading" | "empty" | "error" | "success" | "warning" | "info" | "permission_denied" | "not_found" | "offline" | "approval_pending" | "blocked" | "upgrade_required" | "onboarding" | "skeleton" | "custom";
    /** Screen where this state appears */
    screen_id: string;
    /** Human description */
    description: string;
    /** Does the design show this state explicitly, or is it implied? */
    explicit: boolean;
    /** Recovery action (retry button, CTA, etc.) */
    recovery_action?: string;
}
export interface LayoutInfo {
    /** Overall layout pattern */
    pattern: "sidebar_main" | "topbar_main" | "sidebar_topbar_main" | "full_width" | "centered" | "split" | "dashboard_grid" | "custom";
    /** Responsive breakpoints noted */
    responsive_notes: string[];
    /** Sidebar details if present */
    sidebar?: {
        position: "left" | "right";
        collapsible: boolean;
        width_hint: string;
    };
    /** Topbar details if present */
    topbar?: {
        sticky: boolean;
        has_search: boolean;
        has_user_menu: boolean;
        has_notifications: boolean;
    };
    /** Content area details */
    content?: {
        max_width?: string;
        padding?: string;
    };
}
export interface ExtractionMeta {
    /** Overall confidence in extraction quality (0-1) */
    confidence: number;
    /** Number of artboards analyzed */
    artboards_analyzed: number;
    /** Number of nodes traversed in the design tree */
    nodes_traversed: number;
    /** Warnings about extraction quality */
    warnings: ExtractionWarning[];
    /** Time taken in ms */
    duration_ms: number;
}
export interface ExtractionWarning {
    type: "ambiguous_component" | "missing_state" | "unclear_navigation" | "truncated_content" | "low_confidence_label" | "unresolved_reference";
    message: string;
    /** Related screen/component ID */
    ref?: string;
}
export interface DesignConstraints {
    /** Required screens for this feature */
    required_screens: {
        screen_id: string;
        name: string;
        purpose: string;
    }[];
    /** Required components */
    required_components: {
        component_id: string;
        name: string;
        category: string;
    }[];
    /** Required data views */
    required_data_views: {
        view_id: string;
        name: string;
        type: string;
        columns: string[];
        capabilities: string[];
    }[];
    /** Required forms */
    required_forms: {
        form_id: string;
        name: string;
        fields: string[];
    }[];
    /** Required actions */
    required_actions: {
        action_id: string;
        label: string;
        type: string;
        is_destructive: boolean;
    }[];
    /** Required states */
    required_states: {
        state_id: string;
        type: string;
        screen_id: string;
    }[];
    /** Required navigation entries */
    required_nav: {
        label: string;
        target_screen_id: string;
        level: string;
    }[];
}
export interface DesignVerificationResult {
    /** Overall pass/fail/warn */
    status: "PASS" | "FAIL" | "WARN";
    /** Overall coverage score (0-1) */
    coverage: number;
    /** Per-category results */
    screens: VerificationItem[];
    components: VerificationItem[];
    data_views: VerificationItem[];
    forms: VerificationItem[];
    actions: VerificationItem[];
    states: VerificationItem[];
    navigation: VerificationItem[];
    /** Summary */
    summary: {
        total_obligations: number;
        met: number;
        missing: number;
        partial: number;
    };
}
export interface VerificationItem {
    id: string;
    name: string;
    status: "met" | "missing" | "partial";
    reason?: string;
}
