/**
 * design-extract.ts — Extracts structured DesignEvidence from Paper MCP
 * designs, JSON descriptions, or screenshot descriptions.
 *
 * Modes:
 *   --paper <file>   Accept piped Paper MCP JSON (get_tree_summary / get_children output)
 *   --json <file>    Accept a semi-structured design description JSON
 *   --output <file>  Write the extracted evidence to a file
 *   --persist        Also persist the evidence to Neo4j
 *
 * Usage:
 *   npx tsx src/tools/design-extract.ts --json design-input.json
 *   npx tsx src/tools/design-extract.ts --json design-input.json --output evidence.json --persist
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { getNeo4jService } from "../services/neo4j-service.js";
import type {
  DesignEvidence,
  DesignScreen,
  DesignComponent,
  DataView,
  DesignForm,
  DesignAction,
  DesignState,
  NavigationGraph,
  NavItem,
  NavEdge,
  LayoutInfo,
  ExtractionMeta,
  DesignSource,
  ScreenRegion,
  DataColumn,
  FormField,
  ExtractionWarning,
} from "../types/design-evidence.js";

// ═══════════════════════════════════════════════════════════════════════
// INPUT TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface DesignInput {
  name: string;
  source_type: "paper" | "figma" | "screenshot" | "manual";
  source_ref: string;
  screens: DesignInputScreen[];
  navigation?: {
    primary?: { label: string; target_screen: string; icon?: string }[];
    secondary?: {
      label: string;
      target_screen: string;
      parent?: string;
    }[];
  };
  layout?: {
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
  };
}

interface DesignInputScreen {
  name: string;
  purpose: string;
  is_overlay?: boolean;
  artboard_ref?: string;
  dimensions?: { width: number; height: number };
  regions?: {
    name: string;
    purpose: string;
    components?: string[];
  }[];
  components?: string[];
  data_views?: DesignInputDataView[];
  forms?: DesignInputForm[];
  actions?: DesignInputAction[];
  states?: DesignInputState[];
}

interface DesignInputDataView {
  name: string;
  type:
    | "table"
    | "list"
    | "card_grid"
    | "detail_pane"
    | "tree"
    | "timeline"
    | "chart"
    | "kanban"
    | "calendar";
  implied_model: string;
  columns?: {
    name: string;
    type?: string;
    sortable?: boolean;
    filterable?: boolean;
  }[];
  capabilities?: string[];
  row_actions?: string[];
  bulk_actions?: string[];
}

interface DesignInputForm {
  name: string;
  fields: {
    name: string;
    label: string;
    type?: string;
    required?: boolean;
    placeholder?: string;
    options?: string[];
  }[];
  submit_label: string;
  cancel_label?: string;
  is_multi_step?: boolean;
}

interface DesignInputAction {
  label: string;
  type?: string;
  element?: string;
  is_destructive?: boolean;
  is_primary?: boolean;
  target_screen?: string;
  implied_operation?: string;
}

interface DesignInputState {
  type: string;
  description: string;
  explicit?: boolean;
  recovery_action?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeId(prefix: string, name: string): string {
  return `${prefix}-${slugify(name)}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════
// EXTRACTION LOGIC
// ═══════════════════════════════════════════════════════════════════════

export function extractDesignEvidence(input: DesignInput): DesignEvidence {
  const evidenceId = `de-${randomUUID().slice(0, 8)}`;
  const extractedAt = nowISO();
  const warnings: ExtractionWarning[] = [];

  // Track component deduplication: name -> DesignComponent
  const componentMap = new Map<string, DesignComponent>();

  // ── Flat collection arrays (populated during screen extraction) ────
  const allDataViews: DataView[] = [];
  const allForms: DesignForm[] = [];
  const allActions: DesignAction[] = [];
  const allStates: DesignState[] = [];

  // ── Build screens ──────────────────────────────────────────────────

  const screens: DesignScreen[] = input.screens.map((s) => {
    const screenId = makeId("screen", s.name);

    // Collect component names from regions + top-level
    const allComponentNames = new Set<string>();
    if (s.components) {
      for (const c of s.components) allComponentNames.add(c);
    }
    if (s.regions) {
      for (const r of s.regions) {
        if (r.components) {
          for (const c of r.components) allComponentNames.add(c);
        }
      }
    }

    // Register / deduplicate components
    const componentIds: string[] = [];
    for (const name of allComponentNames) {
      const compId = makeId("comp", name);
      const existing = componentMap.get(name);
      if (existing) {
        if (!existing.screen_ids.includes(screenId)) {
          existing.screen_ids.push(screenId);
        }
      } else {
        componentMap.set(name, {
          component_id: compId,
          name,
          category: "other" as DesignComponent["category"],
          purpose: "",
          screen_ids: [screenId],
          visible_props: [],
          children: [],
          interactions: [],
        });
      }
      componentIds.push(compId);
    }

    // Build regions
    const regions: ScreenRegion[] = (s.regions ?? []).map((r) => ({
      name: r.name,
      purpose: r.purpose,
      component_ids: (r.components ?? []).map((c) => makeId("comp", c)),
    }));

    // Build data views
    const dataViews: DataView[] = (s.data_views ?? []).map((dv) => ({
      view_id: makeId("view", dv.name),
      name: dv.name,
      type: dv.type,
      screen_id: screenId,
      implied_model: dv.implied_model,
      columns: (dv.columns ?? []).map(
        (col): DataColumn => ({
          name: col.name,
          type: (col.type ?? "text") as DataColumn["type"],
          sortable: col.sortable ?? false,
          filterable: col.filterable ?? false,
        })
      ),
      capabilities: (dv.capabilities ?? []) as DataView["capabilities"],
      row_actions: dv.row_actions ?? [],
      bulk_actions: dv.bulk_actions ?? [],
    }));

    // Build forms
    const forms: DesignForm[] = (s.forms ?? []).map((f) => ({
      form_id: makeId("form", f.name),
      name: f.name,
      screen_id: screenId,
      fields: f.fields.map(
        (fld): FormField => ({
          name: fld.name,
          label: fld.label,
          type: (fld.type ?? "text") as FormField["type"],
          required: fld.required ?? false,
          placeholder: fld.placeholder,
          options: fld.options,
        })
      ),
      submit_label: f.submit_label,
      cancel_label: f.cancel_label,
      is_multi_step: f.is_multi_step ?? false,
      has_validation: false,
    }));

    // Build actions
    const actions: DesignAction[] = (s.actions ?? []).map((a) => ({
      action_id: makeId("action", a.label),
      label: a.label,
      type: (a.type ?? "custom") as DesignAction["type"],
      screen_id: screenId,
      element: a.element ?? "button",
      is_destructive: a.is_destructive ?? false,
      is_primary: a.is_primary ?? false,
      target_screen_id: a.target_screen
        ? makeId("screen", a.target_screen)
        : undefined,
      implied_operation: a.implied_operation,
    }));

    // Build states
    const states: DesignState[] = (s.states ?? []).map((st) => ({
      state_id: makeId("state", `${s.name}-${st.type}`),
      type: st.type as DesignState["type"],
      screen_id: screenId,
      description: st.description,
      explicit: st.explicit ?? true,
      recovery_action: st.recovery_action,
    }));

    // ── Infer missing states ───────────────────────────────────────

    const stateTypes = new Set(states.map((st) => st.type));

    if (dataViews.length > 0 && !stateTypes.has("empty")) {
      warnings.push({
        type: "missing_state",
        ref: screenId,
        message: `Screen "${s.name}" has data views but no "empty" state defined`,
      });
    }

    if (dataViews.length > 0 && !stateTypes.has("loading")) {
      warnings.push({
        type: "missing_state",
        ref: screenId,
        message: `Screen "${s.name}" has data views but no "loading" state defined`,
      });
    }

    if (forms.length > 0 && !stateTypes.has("error")) {
      warnings.push({
        type: "missing_state",
        ref: screenId,
        message: `Screen "${s.name}" has forms but no "error" state defined`,
      });
    }

    const hasDestructiveAction = actions.some((a) => a.is_destructive);
    if (hasDestructiveAction && !stateTypes.has("custom")) {
      warnings.push({
        type: "missing_state",
        ref: screenId,
        message: `Screen "${s.name}" has destructive actions but no "custom" (confirm) state defined`,
      });
    }

    // Collect into flat arrays for top-level evidence
    allDataViews.push(...dataViews);
    allForms.push(...forms);
    allActions.push(...actions);
    allStates.push(...states);

    return {
      screen_id: screenId,
      name: s.name,
      purpose: s.purpose,
      is_overlay: s.is_overlay ?? false,
      artboard_ref: s.artboard_ref,
      dimensions: s.dimensions,
      regions,
      component_ids: componentIds,
      data_view_ids: dataViews.map((dv) => dv.view_id),
      form_ids: forms.map((f) => f.form_id),
      action_ids: actions.map((a) => a.action_id),
      state_ids: states.map((st) => st.state_id),
    };
  });

  // ── Components array from dedup map ────────────────────────────────

  const components = Array.from(componentMap.values());

  // ── Build navigation graph ─────────────────────────────────────────

  const navItems: NavItem[] = [];
  const navEdges: NavEdge[] = [];
  const edgeSet = new Set<string>();

  function addEdge(
    from: string,
    to: string,
    trigger: string,
    label?: string
  ): void {
    const key = `${from}::${to}::${trigger}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    navEdges.push({
      from_screen_id: from,
      to_screen_id: to,
      trigger,
      label,
    });
  }

  // Explicit navigation
  if (input.navigation?.primary) {
    for (const nav of input.navigation.primary) {
      const targetId = makeId("screen", nav.target_screen);
      navItems.push({
        label: nav.label,
        target_screen_id: targetId,
        icon: nav.icon,
        level: "primary",
      });
      // Primary nav items are reachable from any screen
      for (const screen of screens) {
        addEdge(screen.screen_id, targetId, "nav_link", nav.label);
      }
    }
  }

  if (input.navigation?.secondary) {
    for (const nav of input.navigation.secondary) {
      const targetId = makeId("screen", nav.target_screen);
      navItems.push({
        label: nav.label,
        target_screen_id: targetId,
        level: "secondary",
        parent: nav.parent,
      });
      if (nav.parent) {
        const parentId = makeId("screen", nav.parent);
        addEdge(parentId, targetId, "nav_link", nav.label);
      }
    }
  }

  // Implicit edges from action targets
  for (const action of allActions) {
    if (action.target_screen_id) {
      addEdge(
        action.screen_id,
        action.target_screen_id,
        "action",
        action.label
      );
    }
  }

  const navigation: NavigationGraph = {
    primary_items: navItems.filter((n) => n.level === "primary"),
    secondary_items: navItems.filter((n) => n.level !== "primary"),
    edges: navEdges,
  };

  // ── Layout ─────────────────────────────────────────────────────────

  const layout: LayoutInfo = {
    pattern: (input.layout?.pattern ?? "custom") as LayoutInfo["pattern"],
    responsive_notes: input.layout?.responsive_notes ?? [],
    sidebar: input.layout?.sidebar
      ? {
          position: (input.layout.sidebar.position ?? "left") as "left" | "right",
          collapsible: input.layout.sidebar.collapsible ?? false,
          width_hint: input.layout.sidebar.width_hint ?? "auto",
        }
      : undefined,
    topbar: input.layout?.topbar
      ? {
          sticky: input.layout.topbar.sticky ?? true,
          has_search: input.layout.topbar.has_search ?? false,
          has_user_menu: input.layout.topbar.has_user_menu ?? false,
          has_notifications: input.layout.topbar.has_notifications ?? false,
        }
      : undefined,
  };

  // ── Compute confidence ─────────────────────────────────────────────

  let confidenceScore = 1.0;
  let deductions: string[] = [];

  for (const screen of screens) {
    if (screen.component_ids.length === 0) {
      confidenceScore -= 0.05;
      deductions.push(
        `Screen "${screen.name}" has no components (-0.05)`
      );
    }
    if (
      screen.data_view_ids.length === 0 &&
      screen.form_ids.length === 0 &&
      screen.action_ids.length === 0
    ) {
      confidenceScore -= 0.05;
      deductions.push(
        `Screen "${screen.name}" has no views, forms, or actions (-0.05)`
      );
    }
  }

  for (const action of allActions) {
    if (action.type === "custom" && !action.implied_operation) {
      confidenceScore -= 0.02;
      deductions.push(
        `Action "${action.label}" has no implied operation (-0.02)`
      );
    }
  }

  if (navItems.length === 0) {
    confidenceScore -= 0.1;
    deductions.push("No navigation defined (-0.1)");
  }

  if (layout.pattern === "custom") {
    confidenceScore -= 0.05;
    deductions.push("Layout pattern is unknown (-0.05)");
  }

  // Clamp to [0, 1]
  confidenceScore = Math.max(0, Math.min(1, confidenceScore));

  // Round to 2 decimal places
  confidenceScore = Math.round(confidenceScore * 100) / 100;

  // ── Source ─────────────────────────────────────────────────────────

  const source: DesignSource = {
    type: input.source_type,
    ref: input.source_ref,
    name: input.name,
  };

  // ── Meta ───────────────────────────────────────────────────────────

  const extractionMeta: ExtractionMeta = {
    confidence: confidenceScore,
    artboards_analyzed: input.screens.length,
    nodes_traversed: 0,
    warnings,
    duration_ms: 0,
  };

  // ── Assemble DesignEvidence ────────────────────────────────────────

  const evidence: DesignEvidence = {
    evidence_id: evidenceId,
    source,
    screens,
    components,
    data_views: allDataViews,
    forms: allForms,
    actions: allActions,
    states: allStates,
    navigation,
    layout,
    extraction_meta: extractionMeta,
    extracted_at: extractedAt,
  };

  return evidence;
}

// ═══════════════════════════════════════════════════════════════════════
// NEO4J PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Persist design evidence to Neo4j.
 *
 * IMPORTANT: This function accepts ONLY the canonical DesignEvidence type.
 * Raw/authored evidence must be normalized first via normalizeDesignEvidence().
 * Do not pass RawDesignEvidence directly — it will compile but produce null
 * properties in the graph.
 */
export async function persistDesignEvidence(
  evidence: DesignEvidence
): Promise<void> {
  const neo = getNeo4jService();
  const ok = await neo.connect();
  if (!ok) {
    console.warn(
      "[design-extract] Neo4j unavailable — skipping persistence"
    );
    return;
  }

  console.log(
    `[design-extract] Persisting evidence ${evidence.evidence_id} to Neo4j...`
  );

  // ── Evidence root node ─────────────────────────────────────────────

  await neo.runCypher(
    `MERGE (e:DesignEvidence {evidence_id: $eid})
     SET e.source_name = $sourceName,
         e.source_type = $sourceType,
         e.source_ref  = $sourceRef,
         e.confidence  = $confidence,
         e.extracted_at = $extractedAt`,
    {
      eid: evidence.evidence_id,
      sourceName: evidence.source.name,
      sourceType: evidence.source.type,
      sourceRef: evidence.source.ref,
      confidence: evidence.extraction_meta.confidence,
      extractedAt: evidence.extracted_at,
    }
  );

  // ── Screens ────────────────────────────────────────────────────────

  for (const screen of evidence.screens) {
    await neo.runCypher(
      `MERGE (s:DesignScreen {screen_id: $sid})
       SET s.name       = $name,
           s.purpose    = $purpose,
           s.is_overlay = $isOverlay
       WITH s
       MATCH (e:DesignEvidence {evidence_id: $eid})
       MERGE (e)-[:HAS_SCREEN]->(s)`,
      {
        sid: screen.screen_id,
        name: screen.name,
        purpose: screen.purpose,
        isOverlay: screen.is_overlay,
        eid: evidence.evidence_id,
      }
    );

    // ── Components for this screen ───────────────────────────────────

    for (const compId of screen.component_ids) {
      const comp = evidence.components.find(
        (c) => c.component_id === compId
      );
      if (!comp) continue;

      await neo.runCypher(
        `MERGE (c:DesignComponent {component_id: $cid})
         SET c.name         = $name,
             c.category     = $category,
             c.purpose      = $purpose,
             c.screen_ids   = $screenIds,
             c.visible_props = $visibleProps,
             c.children     = $children,
             c.interactions = $interactions
         WITH c
         MATCH (s:DesignScreen {screen_id: $sid})
         MERGE (s)-[:HAS_COMPONENT]->(c)`,
        {
          cid: comp.component_id,
          name: comp.name,
          category: comp.category,
          purpose: comp.purpose,
          screenIds: comp.screen_ids,
          visibleProps: comp.visible_props,
          children: comp.children,
          interactions: comp.interactions,
          sid: screen.screen_id,
        }
      );
    }

    // ── Data views ───────────────────────────────────────────────────

    const screenDataViews = evidence.data_views.filter(
      (dv) => dv.screen_id === screen.screen_id
    );
    for (const dv of screenDataViews) {
      await neo.runCypher(
        `MERGE (v:DesignDataView {view_id: $vid})
         SET v.name          = $name,
             v.type          = $type,
             v.implied_model = $impliedModel,
             v.column_names  = $columnNames,
             v.capabilities  = $capabilities,
             v.row_actions   = $rowActions,
             v.bulk_actions  = $bulkActions
         WITH v
         MATCH (s:DesignScreen {screen_id: $sid})
         MERGE (s)-[:HAS_DATA_VIEW]->(v)`,
        {
          vid: dv.view_id,
          name: dv.name,
          type: dv.type,
          impliedModel: dv.implied_model,
          columnNames: dv.columns.map((c) => c.name),
          capabilities: dv.capabilities,
          rowActions: dv.row_actions,
          bulkActions: dv.bulk_actions,
          sid: screen.screen_id,
        }
      );
    }

    // ── Forms ────────────────────────────────────────────────────────

    const screenForms = evidence.forms.filter(
      (f) => f.screen_id === screen.screen_id
    );
    for (const form of screenForms) {
      await neo.runCypher(
        `MERGE (f:DesignForm {form_id: $fid})
         SET f.name           = $name,
             f.submit_label   = $submitLabel,
             f.cancel_label   = $cancelLabel,
             f.field_count    = $fieldCount,
             f.field_names    = $fieldNames,
             f.is_multi_step  = $isMultiStep,
             f.has_validation = $hasValidation
         WITH f
         MATCH (s:DesignScreen {screen_id: $sid})
         MERGE (s)-[:HAS_FORM]->(f)`,
        {
          fid: form.form_id,
          name: form.name,
          submitLabel: form.submit_label,
          cancelLabel: form.cancel_label ?? null,
          fieldCount: form.fields.length,
          fieldNames: form.fields.map((f) => f.name),
          isMultiStep: form.is_multi_step,
          hasValidation: form.has_validation,
          sid: screen.screen_id,
        }
      );
    }

    // ── Actions ──────────────────────────────────────────────────────

    const screenActions = evidence.actions.filter(
      (a) => a.screen_id === screen.screen_id
    );
    for (const action of screenActions) {
      await neo.runCypher(
        `MERGE (a:DesignAction {action_id: $aid})
         SET a.label             = $label,
             a.type              = $type,
             a.is_destructive    = $isDestructive,
             a.is_primary        = $isPrimary,
             a.implied_operation = $impliedOp
         WITH a
         MATCH (s:DesignScreen {screen_id: $sid})
         MERGE (s)-[:HAS_ACTION]->(a)`,
        {
          aid: action.action_id,
          label: action.label,
          type: action.type,
          isDestructive: action.is_destructive,
          isPrimary: action.is_primary,
          impliedOp: action.implied_operation ?? null,
          sid: screen.screen_id,
        }
      );
    }

    // ── States ───────────────────────────────────────────────────────

    const screenStates = evidence.states.filter(
      (st) => st.screen_id === screen.screen_id
    );
    for (const state of screenStates) {
      await neo.runCypher(
        `MERGE (st:DesignState {state_id: $stid})
         SET st.type        = $type,
             st.description = $description,
             st.explicit    = $explicit
         WITH st
         MATCH (s:DesignScreen {screen_id: $sid})
         MERGE (s)-[:HAS_STATE]->(st)`,
        {
          stid: state.state_id,
          type: state.type,
          description: state.description,
          explicit: state.explicit,
          sid: screen.screen_id,
        }
      );
    }
  }

  // ── Navigation edges (NAVIGATES_TO between screens) ────────────────

  for (const edge of evidence.navigation.edges) {
    await neo.runCypher(
      `MATCH (from:DesignScreen {screen_id: $fromId})
       MATCH (to:DesignScreen {screen_id: $toId})
       MERGE (from)-[r:NAVIGATES_TO]->(to)
       SET r.trigger = $trigger,
           r.label   = $label`,
      {
        fromId: edge.from_screen_id,
        toId: edge.to_screen_id,
        trigger: edge.trigger,
        label: edge.label ?? null,
      }
    );
  }

  console.log(
    `[design-extract] Persisted: ${evidence.screens.length} screens, ` +
      `${evidence.components.length} components, ` +
      `${evidence.data_views.length} data views, ` +
      `${evidence.forms.length} forms, ` +
      `${evidence.actions.length} actions, ` +
      `${evidence.states.length} states, ` +
      `${evidence.navigation.edges.length} nav edges`
  );
}

// ═══════════════════════════════════════════════════════════════════════
// PAPER MCP INPUT NORMALIZATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Converts Paper MCP tree summary JSON into a DesignInput.
 * Expects the combined output of get_tree_summary and optionally get_children.
 */
function normalizePaperInput(raw: unknown): DesignInput {
  const data = raw as Record<string, unknown>;
  const treeSummary = (data.tree_summary ?? data) as Record<string, unknown>;
  const name =
    (treeSummary.name as string) ??
    (treeSummary.fileName as string) ??
    "Paper Design";

  const artboards = (treeSummary.artboards ??
    treeSummary.children ??
    []) as Record<string, unknown>[];

  const screens: DesignInputScreen[] = artboards.map((ab) => {
    const abName = (ab.name as string) ?? "Untitled Screen";
    const children = (ab.children ?? []) as Record<string, unknown>[];

    const componentNames: string[] = children
      .filter(
        (c) =>
          (c.type as string) === "component" ||
          (c.type as string) === "instance"
      )
      .map((c) => (c.name as string) ?? "Unknown Component");

    return {
      name: abName,
      purpose: `Screen from Paper artboard "${abName}"`,
      artboard_ref: (ab.id as string) ?? undefined,
      dimensions: ab.width
        ? {
            width: ab.width as number,
            height: ab.height as number,
          }
        : undefined,
      components: componentNames.length > 0 ? componentNames : undefined,
    };
  });

  return {
    name,
    source_type: "paper",
    source_ref: (treeSummary.fileId as string) ?? "paper-mcp",
    screens,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  let inputFile: string | undefined;
  let outputFile: string | undefined;
  let mode: "json" | "paper" | "interactive" = "interactive";
  let persist = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--json":
        mode = "json";
        inputFile = args[++i];
        break;
      case "--paper":
        mode = "paper";
        inputFile = args[++i];
        break;
      case "--output":
        outputFile = args[++i];
        break;
      case "--persist":
        persist = true;
        break;
      case "--help":
      case "-h":
        console.log(`Usage:
  npx tsx src/tools/design-extract.ts --json <file>    Extract from JSON design description
  npx tsx src/tools/design-extract.ts --paper <file>   Extract from Paper MCP JSON output
  npx tsx src/tools/design-extract.ts                  Interactive mode (reads from stdin)

Options:
  --output <file>   Write evidence JSON to file
  --persist         Also persist to Neo4j
  --help            Show this help`);
        process.exit(0);
    }
  }

  let designInput: DesignInput;

  if (mode === "json" || mode === "paper") {
    if (!inputFile) {
      console.error(`Error: --${mode} requires a file path`);
      process.exit(1);
    }

    let raw: unknown;
    try {
      const content = readFileSync(inputFile, "utf-8");
      raw = JSON.parse(content);
    } catch (err: any) {
      console.error(`Error reading ${inputFile}: ${err.message}`);
      process.exit(1);
    }

    if (mode === "paper") {
      designInput = normalizePaperInput(raw);
    } else {
      designInput = raw as DesignInput;
    }
  } else {
    // Interactive mode: read from stdin
    console.log(
      "Interactive mode: paste a JSON design description and press Ctrl+D when done."
    );
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    const stdinContent = Buffer.concat(chunks).toString("utf-8").trim();
    if (!stdinContent) {
      console.error("Error: no input received on stdin");
      process.exit(1);
    }

    try {
      designInput = JSON.parse(stdinContent) as DesignInput;
    } catch (err: any) {
      console.error(`Error parsing stdin JSON: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Extract ──────────────────────────────────────────────────────

  console.log(`[design-extract] Extracting from "${designInput.name}"...`);
  const evidence = extractDesignEvidence(designInput);

  console.log(
    `[design-extract] Extracted: ${evidence.screens.length} screens, ` +
      `${evidence.components.length} components, ` +
      `${evidence.data_views.length} data views, ` +
      `${evidence.forms.length} forms, ` +
      `${evidence.actions.length} actions, ` +
      `${evidence.states.length} states`
  );

  if (evidence.extraction_meta.warnings.length > 0) {
    console.log(
      `[design-extract] Warnings (${evidence.extraction_meta.warnings.length}):`
    );
    for (const w of evidence.extraction_meta.warnings) {
      console.log(`  - [${w.type}] ${w.message}`);
    }
  }

  console.log(
    `[design-extract] Confidence: ${evidence.extraction_meta.confidence}`
  );

  // ── Output ─────────────────────────────────────────────────────────

  const jsonOutput = JSON.stringify(evidence, null, 2);

  if (outputFile) {
    writeFileSync(outputFile, jsonOutput, "utf-8");
    console.log(`[design-extract] Written to ${outputFile}`);
  } else if (!persist) {
    // Only print to stdout if not writing to file and not persisting (avoid noise)
    console.log(jsonOutput);
  }

  // ── Persist ────────────────────────────────────────────────────────

  if (persist) {
    await persistDesignEvidence(evidence);
  }

  console.log("[design-extract] Done.");
}

// ── Run CLI if executed directly ─────────────────────────────────────

const isDirectRun =
  process.argv[1]?.endsWith("design-extract.ts") ||
  process.argv[1]?.endsWith("design-extract.js");

if (isDirectRun) {
  main().catch((err) => {
    console.error("[design-extract] Fatal:", err);
    process.exit(1);
  });
}
