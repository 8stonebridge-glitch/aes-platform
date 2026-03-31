/**
 * design-normalize.ts — Single normalization gate for design evidence.
 *
 * Converts RawDesignEvidence (loose authoring format) into the canonical
 * DesignEvidence type. persistDesignEvidence() should only ever receive
 * the output of this function.
 *
 * Normalization rules:
 *   - IDs: fall back through alternative field names, then auto-generate from slugified name
 *   - Booleans: default to conservative values (false) when omitted
 *   - Arrays: default to [] when omitted
 *   - Strings: default to "" when omitted and no derivation is possible
 *   - implied_model: use source_hint if implied_model is missing
 *   - implied_operation: use api_hint if implied_operation is missing
 *   - is_destructive: derive from action type === "delete" if not set
 *   - is_primary: derive from being the first action on a screen with type "submit" if not set
 *   - explicit: default true for authored evidence
 *   - label (NavEdge): use nav_type if label is missing
 *   - label (Action): use name if label is missing
 *   - submit_label: use submit_text, or "Submit" as last resort
 */

import { randomUUID } from "node:crypto";
import type {
  DesignEvidence,
  DesignScreen,
  DesignComponent,
  DataView,
  DataColumn,
  DataViewCapability,
  DesignForm,
  FormField,
  DesignAction,
  DesignState,
  NavigationGraph,
  NavItem,
  NavEdge,
  LayoutInfo,
  ExtractionMeta,
  ExtractionWarning,
  ScreenRegion,
} from "../types/design-evidence.js";
import type {
  RawDesignEvidence,
  RawDesignScreen,
  RawDesignComponent,
  RawDataView,
  RawDesignForm,
  RawDesignAction,
  RawDesignState,
  RawNavEdge,
  RawNavItem,
} from "../types/raw-design-evidence.js";

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeId(prefix: string, name: string): string {
  return `${prefix}-${slugify(name)}`;
}

function fallbackNameFromId(value: string | undefined, fallback: string): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;
  return raw
    .replace(/^[a-z]+-/, "")
    .replace(/[-_]+/g, " ")
    .trim() || fallback;
}

/** Valid category values for DesignComponent */
const VALID_CATEGORIES = new Set([
  "data_display",
  "form",
  "navigation",
  "layout",
  "feedback",
  "action",
  "media",
  "overlay",
  "status",
  "other",
]);

/** Valid data view types */
const VALID_VIEW_TYPES = new Set([
  "table",
  "list",
  "card_grid",
  "detail_pane",
  "tree",
  "timeline",
  "chart",
  "kanban",
  "calendar",
]);

/** Valid layout patterns */
const VALID_LAYOUT_PATTERNS = new Set([
  "sidebar_main",
  "topbar_main",
  "sidebar_topbar_main",
  "full_width",
  "centered",
  "split",
  "dashboard_grid",
  "custom",
]);

/** Action types that imply destructive behavior */
const DESTRUCTIVE_ACTION_TYPES = new Set(["delete"]);

/** Valid action types */
const VALID_ACTION_TYPES = new Set([
  "create",
  "update",
  "delete",
  "navigate",
  "filter",
  "sort",
  "export",
  "import",
  "toggle",
  "confirm",
  "cancel",
  "submit",
  "search",
  "bulk",
  "custom",
]);

/** Valid state types */
const VALID_STATE_TYPES = new Set([
  "loading",
  "empty",
  "error",
  "success",
  "warning",
  "info",
  "permission_denied",
  "not_found",
  "offline",
  "approval_pending",
  "blocked",
  "upgrade_required",
  "onboarding",
  "skeleton",
  "custom",
]);

/** Valid column types */
const VALID_COLUMN_TYPES = new Set([
  "text",
  "number",
  "date",
  "status",
  "avatar",
  "badge",
  "action",
  "checkbox",
  "link",
  "image",
  "custom",
]);

/** Valid form field types */
const VALID_FIELD_TYPES = new Set([
  "text",
  "email",
  "password",
  "number",
  "date",
  "select",
  "multiselect",
  "checkbox",
  "radio",
  "toggle",
  "textarea",
  "file",
  "color",
  "rich_text",
  "search",
  "phone",
  "url",
  "custom",
]);

/** Valid data view capabilities */
const VALID_CAPABILITIES = new Set([
  "sort",
  "filter",
  "search",
  "pagination",
  "infinite_scroll",
  "select_rows",
  "bulk_actions",
  "column_resize",
  "column_reorder",
  "export",
  "inline_edit",
  "expand_row",
  "drag_reorder",
]);

// ═══════════════════════════════════════════════════════════════
// MAIN NORMALIZER
// ═══════════════════════════════════════════════════════════════

export function normalizeDesignEvidence(
  raw: RawDesignEvidence
): DesignEvidence {
  const evidenceId =
    raw.evidence_id ?? `de-${randomUUID().slice(0, 8)}`;

  // ── Normalize screens first (components, views, forms, actions, states
  //    are extracted per-screen but collected into flat top-level arrays) ──

  const allComponents: DesignComponent[] = [];
  const allDataViews: DataView[] = [];
  const allForms: DesignForm[] = [];
  const allActions: DesignAction[] = [];
  const allStates: DesignState[] = [];
  const componentMap = new Map<string, DesignComponent>();

  // Pre-index raw top-level collections by ID for lookup
  const rawComponentIndex = new Map<string, RawDesignComponent>();
  for (const rc of raw.components ?? []) {
    const id = rc.component_id ?? rc.id ?? makeId("comp", rc.name);
    rawComponentIndex.set(id, rc);
  }

  const rawDataViewIndex = new Map<string, RawDataView>();
  for (const rv of raw.data_views ?? []) {
    const id =
      rv.view_id ?? rv.data_view_id ?? rv.id ?? makeId("view", rv.name);
    rawDataViewIndex.set(id, rv);
  }

  const rawFormIndex = new Map<string, RawDesignForm>();
  for (const rf of raw.forms ?? []) {
    const id = rf.form_id ?? rf.id ?? makeId("form", rf.name);
    rawFormIndex.set(id, rf);
  }

  const rawActionIndex = new Map<string, RawDesignAction>();
  for (const ra of raw.actions ?? []) {
    const id = ra.action_id ?? ra.id ?? makeId("action", ra.label ?? ra.name ?? "unknown");
    rawActionIndex.set(id, ra);
  }

  const rawStateIndex = new Map<string, RawDesignState>();
  for (const rs of raw.states ?? []) {
    const id = rs.state_id ?? rs.id ?? makeId("state", `${rs.type}`);
    rawStateIndex.set(id, rs);
  }

  // ── Build screens ──────────────────────────────────────────────

  const screens: DesignScreen[] = (raw.screens ?? []).map((rs) => {
    const screenName = typeof rs.name === "string" && rs.name.trim().length > 0
      ? rs.name.trim()
      : fallbackNameFromId(rs.screen_id ?? rs.id, "Untitled Screen");
    const screenId = rs.screen_id ?? rs.id ?? makeId("screen", screenName);

    // Normalize regions
    const regions: ScreenRegion[] = (rs.regions ?? []).map((r) => ({
      name: r.name,
      purpose: r.purpose ?? "",
      component_ids: r.component_ids ?? r.components?.map((c) => makeId("comp", c)) ?? [],
    }));

    // Collect component IDs from screen + regions
    const compIds = new Set<string>(
      rs.component_ids ??
        rs.components?.map((c) => makeId("comp", c)) ??
        []
    );
    for (const r of regions) {
      for (const cid of r.component_ids) compIds.add(cid);
    }

    // Ensure referenced components exist in map
    for (const cid of compIds) {
      if (!componentMap.has(cid)) {
        const rawComp = rawComponentIndex.get(cid);
        if (rawComp) {
          componentMap.set(cid, normalizeComponent(rawComp, screenId));
        } else {
          // Create stub component from ID
          componentMap.set(cid, {
            component_id: cid,
            name: cid.replace(/^comp-/, "").replace(/-/g, " "),
            category: "other",
            purpose: "",
            screen_ids: [screenId],
            visible_props: [],
            children: [],
            interactions: [],
          });
        }
      } else {
        // Add this screen to existing component's screen_ids
        const existing = componentMap.get(cid)!;
        if (!existing.screen_ids.includes(screenId)) {
          existing.screen_ids.push(screenId);
        }
      }
    }

    // Normalize data views for this screen
    const dvIds = rs.data_view_ids ?? [];
    for (const dvId of dvIds) {
      const rawDv = rawDataViewIndex.get(dvId);
      if (rawDv && !allDataViews.some((dv) => dv.view_id === dvId)) {
        allDataViews.push(normalizeDataView(rawDv, screenId));
      }
    }

    // Normalize forms for this screen
    const fIds = rs.form_ids ?? [];
    for (const fId of fIds) {
      const rawForm = rawFormIndex.get(fId);
      if (rawForm && !allForms.some((f) => f.form_id === fId)) {
        allForms.push(normalizeForm(rawForm, screenId));
      }
    }

    // Normalize actions for this screen
    const aIds = rs.action_ids ?? [];
    for (const aId of aIds) {
      const rawAction = rawActionIndex.get(aId);
      if (rawAction && !allActions.some((a) => a.action_id === aId)) {
        allActions.push(normalizeAction(rawAction, screenId));
      }
    }

    // Normalize states for this screen
    const stIds = rs.state_ids ?? [];
    for (const stId of stIds) {
      const rawState = rawStateIndex.get(stId);
      if (rawState && !allStates.some((st) => st.state_id === stId)) {
        allStates.push(normalizeState(rawState, screenId));
      }
    }

    return {
      screen_id: screenId,
      name: screenName,
      purpose: rs.purpose ?? "",
      artboard_ref: rs.artboard_ref,
      dimensions: rs.dimensions,
      is_overlay: rs.is_overlay ?? false,
      regions,
      component_ids: Array.from(compIds),
      data_view_ids: dvIds,
      form_ids: fIds,
      action_ids: aIds,
      state_ids: stIds,
    };
  });

  // ── Also normalize any top-level items not referenced by screens ──

  for (const [id, rawComp] of rawComponentIndex) {
    if (!componentMap.has(id)) {
      componentMap.set(id, normalizeComponent(rawComp, ""));
    }
  }

  for (const rawDv of raw.data_views ?? []) {
    const id =
      rawDv.view_id ?? rawDv.data_view_id ?? rawDv.id ?? makeId("view", rawDv.name);
    if (!allDataViews.some((dv) => dv.view_id === id)) {
      allDataViews.push(normalizeDataView(rawDv, rawDv.screen_id ?? ""));
    }
  }

  for (const rawForm of raw.forms ?? []) {
    const id = rawForm.form_id ?? rawForm.id ?? makeId("form", rawForm.name);
    if (!allForms.some((f) => f.form_id === id)) {
      allForms.push(normalizeForm(rawForm, rawForm.screen_id ?? ""));
    }
  }

  for (const rawAction of raw.actions ?? []) {
    const id =
      rawAction.action_id ??
      rawAction.id ??
      makeId("action", rawAction.label ?? rawAction.name ?? "unknown");
    if (!allActions.some((a) => a.action_id === id)) {
      allActions.push(normalizeAction(rawAction, rawAction.screen_id ?? ""));
    }
  }

  for (const rawState of raw.states ?? []) {
    const id =
      rawState.state_id ?? rawState.id ?? makeId("state", `${rawState.type}`);
    if (!allStates.some((st) => st.state_id === id)) {
      allStates.push(normalizeState(rawState, rawState.screen_id ?? ""));
    }
  }

  // ── Navigation ─────────────────────────────────────────────────

  const navigation = normalizeNavigation(raw.navigation);

  // ── Layout ─────────────────────────────────────────────────────

  const layout = normalizeLayout(raw.layout);

  // ── Meta ───────────────────────────────────────────────────────

  const meta = raw.extraction_meta ?? {};
  const warnings: ExtractionWarning[] = (meta.warnings ?? []).map((w) => ({
    type: (w.type ?? "ambiguous_component") as ExtractionWarning["type"],
    message: w.message ?? "",
    ref: w.ref,
  }));

  const extractionMeta: ExtractionMeta = {
    confidence: meta.confidence ?? 1.0,
    artboards_analyzed: meta.artboards_analyzed ?? raw.screens?.length ?? 0,
    nodes_traversed: meta.nodes_traversed ?? 0,
    warnings,
    duration_ms: meta.duration_ms ?? 0,
  };

  return {
    evidence_id: evidenceId,
    source: {
      type: raw.source.type,
      ref: raw.source.ref,
      name: raw.source.name,
      artboard_ids: raw.source.artboard_ids,
      artboard_count: raw.source.artboard_count,
    },
    screens,
    navigation,
    components: Array.from(componentMap.values()),
    data_views: allDataViews,
    forms: allForms,
    actions: allActions,
    states: allStates,
    layout,
    extraction_meta: extractionMeta,
    extracted_at: raw.extracted_at ?? new Date().toISOString(),
  };
}

// ═══════════════════════════════════════════════════════════════
// PER-TYPE NORMALIZERS
// ═══════════════════════════════════════════════════════════════

function normalizeComponent(
  rc: RawDesignComponent,
  defaultScreenId: string
): DesignComponent {
  const id = rc.component_id ?? rc.id ?? makeId("comp", rc.name);
  const category = VALID_CATEGORIES.has(rc.category ?? "")
    ? (rc.category as DesignComponent["category"])
    : "other";

  return {
    component_id: id,
    name: rc.name,
    category,
    purpose: rc.purpose ?? "",
    screen_ids:
      rc.screen_ids && rc.screen_ids.length > 0
        ? rc.screen_ids
        : defaultScreenId
          ? [defaultScreenId]
          : [],
    visible_props: rc.visible_props ?? [],
    children: rc.children ?? [],
    interactions: rc.interactions ?? [],
  };
}

function normalizeDataView(
  rv: RawDataView,
  defaultScreenId: string
): DataView {
  const id =
    rv.view_id ?? rv.data_view_id ?? rv.id ?? makeId("view", rv.name);
  const viewType = VALID_VIEW_TYPES.has(rv.type ?? "")
    ? (rv.type as DataView["type"])
    : "table";

  // implied_model: use source_hint as fallback, null only when no grounded inference
  const impliedModel = rv.implied_model ?? rv.source_hint ?? "";

  const columns: DataColumn[] = (rv.columns ?? []).map((c) => ({
    name: c.name,
    type: VALID_COLUMN_TYPES.has(c.type ?? "")
      ? (c.type as DataColumn["type"])
      : "text",
    sortable: c.sortable ?? false,
    filterable: c.filterable ?? false,
  }));

  const capabilities = (rv.capabilities ?? []).filter((c) =>
    VALID_CAPABILITIES.has(c)
  ) as DataViewCapability[];

  return {
    view_id: id,
    name: rv.name,
    type: viewType,
    screen_id: rv.screen_id ?? defaultScreenId,
    columns,
    implied_model: impliedModel,
    capabilities,
    row_actions: rv.row_actions ?? [],
    bulk_actions: rv.bulk_actions ?? [],
  };
}

function normalizeForm(
  rf: RawDesignForm,
  defaultScreenId: string
): DesignForm {
  const id = rf.form_id ?? rf.id ?? makeId("form", rf.name);

  const fields: FormField[] = (rf.fields ?? []).map((f) => ({
    name: f.name ?? f.field_id ?? "unnamed",
    label: f.label ?? f.name ?? f.field_id ?? "",
    type: VALID_FIELD_TYPES.has(f.type ?? "")
      ? (f.type as FormField["type"])
      : "text",
    required: f.required ?? false,
    placeholder: f.placeholder,
    helper_text: f.helper_text,
    options: f.options,
  }));

  return {
    form_id: id,
    name: rf.name,
    screen_id: rf.screen_id ?? defaultScreenId,
    fields,
    submit_label: rf.submit_label ?? rf.submit_text ?? "Submit",
    cancel_label: rf.cancel_label,
    is_multi_step: rf.is_multi_step ?? false,
    has_validation: rf.has_validation ?? fields.some((f) => f.required),
  };
}

function normalizeAction(
  ra: RawDesignAction,
  defaultScreenId: string
): DesignAction {
  const label = ra.label ?? ra.name ?? "Unknown Action";
  const id = ra.action_id ?? ra.id ?? makeId("action", label);
  const actionType = VALID_ACTION_TYPES.has(ra.type ?? "")
    ? (ra.type as DesignAction["type"])
    : "custom";

  // Derive is_destructive from type if not explicitly set
  const isDestructive =
    ra.is_destructive ?? DESTRUCTIVE_ACTION_TYPES.has(actionType);

  // Derive is_primary: default false unless explicitly set
  const isPrimary = ra.is_primary ?? false;

  // implied_operation: use api_hint as fallback
  const impliedOp = ra.implied_operation ?? ra.api_hint;

  return {
    action_id: id,
    label,
    type: actionType,
    screen_id: ra.screen_id ?? defaultScreenId,
    element: ra.element ?? "button",
    is_destructive: isDestructive,
    is_primary: isPrimary,
    target_screen_id: ra.target_screen_id,
    implied_operation: impliedOp,
  };
}

function normalizeState(
  rs: RawDesignState,
  defaultScreenId: string
): DesignState {
  const id =
    rs.state_id ?? rs.id ?? makeId("state", `${rs.type}`);
  const stateType = VALID_STATE_TYPES.has(rs.type)
    ? (rs.type as DesignState["type"])
    : "custom";

  return {
    state_id: id,
    type: stateType,
    screen_id: rs.screen_id ?? defaultScreenId,
    description: rs.description ?? "",
    explicit: rs.explicit ?? true,
    recovery_action: rs.recovery_action,
  };
}

function normalizeNavigation(
  raw?: any
): NavigationGraph {
  if (!raw) {
    return { primary_items: [], secondary_items: [], edges: [] };
  }

  const normalizeItem = (ri: RawNavItem): NavItem => ({
    label: ri.label,
    target_screen_id: ri.target_screen_id ?? ri.target_screen ?? "",
    icon: ri.icon,
    level: ri.level ?? "primary",
    parent: ri.parent,
    badge: ri.badge,
  });

  const normalizeEdge = (re: RawNavEdge): NavEdge => ({
    from_screen_id: re.from_screen_id,
    to_screen_id: re.to_screen_id,
    trigger: re.trigger,
    label: re.label ?? re.nav_type,
  });

  return {
    primary_items: (raw.primary_items ?? []).map(normalizeItem),
    secondary_items: (raw.secondary_items ?? []).map(normalizeItem),
    edges: (raw.edges ?? []).map(normalizeEdge),
  };
}

function normalizeLayout(raw?: any): LayoutInfo {
  if (!raw) {
    return { pattern: "custom", responsive_notes: [] };
  }

  const pattern = VALID_LAYOUT_PATTERNS.has(raw.pattern ?? "")
    ? (raw.pattern as LayoutInfo["pattern"])
    : "custom";

  return {
    pattern,
    responsive_notes: raw.responsive_notes ?? [],
    sidebar: raw.sidebar
      ? {
          position: (raw.sidebar.position === "right" ? "right" : "left") as
            | "left"
            | "right",
          collapsible: raw.sidebar.collapsible ?? false,
          width_hint: raw.sidebar.width_hint ?? "auto",
        }
      : undefined,
    topbar: raw.topbar
      ? {
          sticky: raw.topbar.sticky ?? true,
          has_search: raw.topbar.has_search ?? false,
          has_user_menu: raw.topbar.has_user_menu ?? false,
          has_notifications: raw.topbar.has_notifications ?? false,
        }
      : undefined,
    content: raw.content,
  };
}
