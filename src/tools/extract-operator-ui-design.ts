/**
 * extract-operator-ui-design.ts
 *
 * Hand-authored design evidence for the AES Operator UI.
 * Uses RawDesignEvidence (loose authoring format) and normalizes
 * through the canonical gate before persisting.
 *
 * Pipeline: RawDesignEvidence → normalizeDesignEvidence() → persistDesignEvidence()
 */

import type { RawDesignEvidence } from "../types/raw-design-evidence.js";
import { normalizeDesignEvidence } from "./design-normalize.js";
import { persistDesignEvidence } from "./design-extract.js";

// ═══════════════════════════════════════════════════════════════
// RAW AUTHORED EVIDENCE
// ═══════════════════════════════════════════════════════════════

const raw: RawDesignEvidence = {
  evidence_id: "design-aes-operator-ui-001",
  source: {
    type: "paper",
    ref: "Diligent ink",
    name: "AES Operator UI",
    artboard_ids: ["01-intent-input", "02-active-build", "03-knowledge-graph"],
    artboard_count: 3,
  },

  screens: [
    {
      screen_id: "screen-intent-input",
      name: "Intent Input",
      purpose:
        "Landing state where the user describes what they want to build. Single text area with Start button.",
      artboard_ref: "01-intent-input",
      dimensions: { width: 1440, height: 900 },
      is_overlay: false,
      regions: [
        {
          name: "Sidebar",
          purpose: "Navigation and health status",
          component_ids: ["comp-sidebar-nav", "comp-health-indicator"],
        },
        {
          name: "Main Content",
          purpose: "Centered intent input form",
          component_ids: ["comp-intent-input"],
        },
      ],
      component_ids: [
        "comp-sidebar-nav",
        "comp-health-indicator",
        "comp-intent-input",
      ],
      data_view_ids: [],
      form_ids: ["form-intent"],
      action_ids: ["action-start-build"],
      state_ids: ["state-idle", "state-disconnected"],
    },
    {
      screen_id: "screen-active-build",
      name: "Active Build",
      purpose:
        "Shows the AES pipeline in motion — thinking line, stage rail, feature cards, dependency graph, and activity timeline.",
      artboard_ref: "02-active-build",
      dimensions: { width: 1440, height: 900 },
      is_overlay: false,
      regions: [
        {
          name: "Sidebar",
          purpose: "Navigation and health status",
          component_ids: ["comp-sidebar-nav", "comp-health-indicator"],
        },
        {
          name: "Thinking Line",
          purpose: "Human-readable status of what AES is doing right now",
          component_ids: ["comp-thinking-line"],
        },
        {
          name: "Pipeline Content",
          purpose: "Stage rail, feature cards, dependency graph",
          component_ids: [
            "comp-stage-rail",
            "comp-feature-card",
            "comp-dependency-graph",
          ],
        },
        {
          name: "Activity Sidebar",
          purpose: "Chronological event timeline",
          component_ids: ["comp-activity-timeline"],
        },
      ],
      component_ids: [
        "comp-sidebar-nav",
        "comp-health-indicator",
        "comp-thinking-line",
        "comp-stage-rail",
        "comp-feature-card",
        "comp-dependency-graph",
        "comp-activity-timeline",
        "comp-gate-controls",
      ],
      data_view_ids: ["view-feature-cards", "view-dependency-graph"],
      form_ids: [],
      action_ids: ["action-approve-plan", "action-abort-build"],
      state_ids: [
        "state-researching",
        "state-decomposing",
        "state-promoting",
        "state-building",
        "state-verifying",
        "state-blocked",
        "state-failed",
        "state-complete",
      ],
    },
    {
      screen_id: "screen-knowledge-graph",
      name: "Knowledge Graph",
      purpose:
        "Interactive visualization of the knowledge graph with search and color-coded node types.",
      artboard_ref: "03-knowledge-graph",
      dimensions: { width: 1440, height: 900 },
      is_overlay: false,
      regions: [
        {
          name: "Sidebar",
          purpose: "Navigation and health status",
          component_ids: ["comp-sidebar-nav", "comp-health-indicator"],
        },
        {
          name: "Graph Header",
          purpose: "Title, stats, search, legend",
          component_ids: ["comp-graph-search", "comp-graph-legend"],
        },
        {
          name: "Graph Canvas",
          purpose: "Interactive node-edge visualization",
          component_ids: ["comp-knowledge-graph"],
        },
      ],
      component_ids: [
        "comp-sidebar-nav",
        "comp-health-indicator",
        "comp-graph-search",
        "comp-graph-legend",
        "comp-knowledge-graph",
      ],
      data_view_ids: ["view-knowledge-graph"],
      form_ids: [],
      action_ids: ["action-search-graph"],
      state_ids: ["state-graph-loading", "state-graph-error"],
    },
  ],

  navigation: {
    primary_items: [
      {
        label: "Builds",
        target_screen_id: "screen-intent-input",
        icon: "amber-dot",
        level: "primary",
      },
      {
        label: "Graph",
        target_screen_id: "screen-knowledge-graph",
        icon: "circle-outline",
        level: "primary",
      },
      {
        label: "History",
        target_screen_id: "screen-history",
        icon: "clock",
        level: "primary",
      },
    ],
    secondary_items: [],
    edges: [
      {
        from_screen_id: "screen-intent-input",
        to_screen_id: "screen-active-build",
        trigger: "Submit intent via Start button",
        label: "Start Build",
      },
      {
        from_screen_id: "screen-active-build",
        to_screen_id: "screen-knowledge-graph",
        trigger: "Click Graph tab in sidebar",
        label: "Graph",
      },
      {
        from_screen_id: "screen-knowledge-graph",
        to_screen_id: "screen-active-build",
        trigger: "Click Builds tab in sidebar",
        label: "Builds",
      },
      {
        from_screen_id: "screen-intent-input",
        to_screen_id: "screen-knowledge-graph",
        trigger: "Click Graph tab in sidebar",
        label: "Graph",
      },
    ],
  },

  components: [
    {
      component_id: "comp-sidebar-nav",
      name: "Sidebar Navigation",
      category: "navigation",
      purpose:
        "220px wide sidebar with logo, 3 nav items (Builds, Graph, History), and health indicator at bottom.",
      screen_ids: [
        "screen-intent-input",
        "screen-active-build",
        "screen-knowledge-graph",
      ],
      visible_props: ["activeTab"],
      children: ["comp-health-indicator"],
      interactions: ["click"],
    },
    {
      component_id: "comp-health-indicator",
      name: "Health Indicator",
      category: "status",
      purpose:
        "Green/amber/red dot + record count text at bottom of sidebar.",
      screen_ids: [
        "screen-intent-input",
        "screen-active-build",
        "screen-knowledge-graph",
      ],
      visible_props: ["status", "recordCount", "pendingEscalations"],
    },
    {
      component_id: "comp-intent-input",
      name: "Intent Input",
      category: "form",
      purpose:
        "Centered card with heading, textarea (560px), and Start button.",
      screen_ids: ["screen-intent-input"],
      visible_props: ["disabled", "onSubmit"],
      interactions: ["type", "submit"],
    },
    {
      component_id: "comp-thinking-line",
      name: "Thinking Line",
      category: "feedback",
      purpose:
        "Amber pulse dot + human-readable text. Text cross-fades on update.",
      screen_ids: ["screen-active-build"],
      visible_props: ["text", "phase"],
    },
    {
      component_id: "comp-stage-rail",
      name: "Stage Rail",
      category: "feedback",
      purpose:
        "5 stages as circles. Done=green, active=amber, future=gray.",
      screen_ids: ["screen-active-build"],
      visible_props: ["activeStage", "completedStages", "featureCounts"],
    },
    {
      component_id: "comp-feature-card",
      name: "Feature Card",
      category: "data_display",
      purpose:
        "220px card with feature name, status badge, and dependency list.",
      screen_ids: ["screen-active-build"],
      visible_props: ["feature", "stage"],
    },
    {
      component_id: "comp-dependency-graph",
      name: "Dependency Graph",
      category: "data_display",
      purpose:
        "Horizontal node-edge diagram showing feature build order.",
      screen_ids: ["screen-active-build"],
      visible_props: ["features"],
      interactions: ["click", "hover"],
    },
    {
      component_id: "comp-activity-timeline",
      name: "Activity Timeline",
      category: "data_display",
      purpose:
        "260px right sidebar. Vertical timeline with colored dots.",
      screen_ids: ["screen-active-build"],
      visible_props: ["events"],
    },
    {
      component_id: "comp-gate-controls",
      name: "Gate Controls",
      category: "action",
      purpose:
        "Amber banner at approve stage. Approve Plan button.",
      screen_ids: ["screen-active-build"],
      visible_props: ["featureCount", "onApprove"],
      interactions: ["click"],
    },
    {
      component_id: "comp-knowledge-graph",
      name: "Knowledge Graph Viewer",
      category: "data_display",
      purpose:
        "Full-width canvas with interactive node-edge visualization.",
      screen_ids: ["screen-knowledge-graph"],
      visible_props: ["graphData", "searchQuery"],
      interactions: ["click", "hover", "drag", "zoom"],
    },
    {
      component_id: "comp-graph-search",
      name: "Graph Search",
      category: "form",
      purpose: "220px text input. Filters graph nodes by label.",
      screen_ids: ["screen-knowledge-graph"],
      visible_props: ["value", "onChange"],
      interactions: ["type"],
    },
    {
      component_id: "comp-graph-legend",
      name: "Graph Legend",
      category: "data_display",
      purpose:
        "Horizontal row of colored dots with labels: App, Feature, Model, Integration, UI Pattern.",
      screen_ids: ["screen-knowledge-graph"],
    },
  ],

  data_views: [
    {
      view_id: "view-feature-cards",
      name: "Feature Cards Grid",
      type: "card_grid",
      screen_id: "screen-active-build",
      columns: [
        { name: "name", type: "text" },
        { name: "stage", type: "status", filterable: true },
        { name: "dependencies", type: "text" },
      ],
      implied_model: "OrchestratorFeature",
      capabilities: ["filter"],
    },
    {
      view_id: "view-dependency-graph",
      name: "Dependency Graph",
      type: "chart",
      screen_id: "screen-active-build",
      columns: [
        { name: "feature_id", type: "text" },
        { name: "name", type: "text" },
        { name: "dependencies", type: "text" },
        { name: "stage", type: "status" },
      ],
      implied_model: "OrchestratorFeature",
    },
    {
      view_id: "view-knowledge-graph",
      name: "Knowledge Graph",
      type: "chart",
      screen_id: "screen-knowledge-graph",
      columns: [
        { name: "id", type: "text" },
        { name: "label", type: "text", filterable: true },
        { name: "type", type: "status", filterable: true },
        { name: "source", type: "text" },
        { name: "target", type: "text" },
      ],
      source_hint: "GraphNode",
      capabilities: ["search", "filter"],
    },
  ],

  forms: [
    {
      form_id: "form-intent",
      name: "Intent Form",
      screen_id: "screen-intent-input",
      fields: [
        {
          name: "intent-text",
          label: "What do you want to build?",
          type: "textarea",
          required: true,
          placeholder:
            "A project management tool with team workspaces, kanban boards, and billing...",
        },
      ],
      submit_label: "Start",
      is_multi_step: false,
      has_validation: true,
    },
  ],

  actions: [
    {
      action_id: "action-start-build",
      label: "Start Build",
      type: "submit",
      screen_id: "screen-intent-input",
      element: "button",
      is_primary: true,
      target_screen_id: "screen-active-build",
      api_hint: "POST /api/app/intake",
    },
    {
      action_id: "action-approve-plan",
      label: "Approve Plan",
      type: "confirm",
      screen_id: "screen-active-build",
      element: "button",
      is_primary: true,
      api_hint: "POST /api/app/:id/promote",
    },
    {
      action_id: "action-abort-build",
      // Using name instead of label — normalizer should handle this
      name: "Abort Build",
      type: "delete",
      screen_id: "screen-active-build",
      element: "button",
      // is_destructive omitted — should be derived from type=delete
      api_hint: "POST /api/builds/:id/abort-builder",
    },
    {
      action_id: "action-search-graph",
      label: "Search Graph",
      type: "filter",
      screen_id: "screen-knowledge-graph",
      element: "button",
      implied_operation: "client-side filter on GET /api/graph/visualize",
    },
  ],

  states: [
    {
      state_id: "state-idle",
      type: "empty",
      screen_id: "screen-intent-input",
      description: "No build active. Showing intent input.",
      // explicit omitted — should default to true
    },
    {
      state_id: "state-disconnected",
      type: "offline",
      screen_id: "screen-intent-input",
      description: "Neo4j offline. Health dot red. Start button disabled.",
      recovery_action: "Check Neo4j connection",
    },
    {
      state_id: "state-researching",
      type: "loading",
      screen_id: "screen-active-build",
      description: "Thinking line: researching patterns. Stage rail: Research active.",
    },
    {
      state_id: "state-decomposing",
      type: "loading",
      screen_id: "screen-active-build",
      description: "Thinking line: breaking into features. Stage rail: Plan active.",
    },
    {
      state_id: "state-promoting",
      type: "approval_pending",
      screen_id: "screen-active-build",
      description: "Thinking line: checking gates. Gate controls visible.",
    },
    {
      state_id: "state-building",
      type: "loading",
      screen_id: "screen-active-build",
      description: "Thinking line: building feature X. Stage rail: Build active.",
    },
    {
      state_id: "state-verifying",
      type: "loading",
      screen_id: "screen-active-build",
      description: "Thinking line: running validators. Stage rail: Verify active.",
    },
    {
      state_id: "state-blocked",
      type: "blocked",
      screen_id: "screen-active-build",
      description: "Thinking line: blocked, needs input.",
      recovery_action: "Resolve blocker in governance queue",
    },
    {
      state_id: "state-failed",
      type: "error",
      screen_id: "screen-active-build",
      description: "Thinking line: feature failed. Feature card red border.",
      recovery_action: "Retry or abort build",
    },
    {
      state_id: "state-complete",
      type: "success",
      screen_id: "screen-active-build",
      description: "Thinking line: all features built. All stage dots green.",
    },
    {
      state_id: "state-graph-loading",
      type: "loading",
      screen_id: "screen-knowledge-graph",
      description: "Loading knowledge graph text centered in canvas.",
    },
    {
      state_id: "state-graph-error",
      type: "error",
      screen_id: "screen-knowledge-graph",
      description: "Error message with retry button in canvas.",
      recovery_action: "Retry graph load",
    },
  ],

  layout: {
    pattern: "sidebar_main",
    responsive_notes: [
      "Desktop only for MVP (1440px). No responsive breakpoints.",
    ],
    sidebar: {
      position: "left",
      collapsible: false,
      width_hint: "220px",
    },
    content: {
      padding: "32px",
    },
  },

  extraction_meta: {
    confidence: 0.95,
    artboards_analyzed: 3,
  },
};

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("=== AES Operator UI Design Evidence ===");
  console.log("Pipeline: RawDesignEvidence -> normalize -> persist\n");

  // Step 1: Normalize
  const evidence = normalizeDesignEvidence(raw);

  console.log(`Normalized evidence ${evidence.evidence_id}:`);
  console.log(`  Screens:    ${evidence.screens.length}`);
  console.log(`  Components: ${evidence.components.length}`);
  console.log(`  Data Views: ${evidence.data_views.length}`);
  console.log(`  Forms:      ${evidence.forms.length}`);
  console.log(`  Actions:    ${evidence.actions.length}`);
  console.log(`  States:     ${evidence.states.length}`);
  console.log(`  Nav Edges:  ${evidence.navigation.edges.length}`);
  console.log(`  Confidence: ${evidence.extraction_meta.confidence}`);

  // Verify derived fields
  const abortAction = evidence.actions.find(
    (a) => a.action_id === "action-abort-build"
  );
  if (abortAction) {
    console.log(
      `\n  Derived: action-abort-build.is_destructive = ${abortAction.is_destructive} (expected: true)`
    );
    console.log(
      `  Derived: action-abort-build.label = "${abortAction.label}" (from name field)`
    );
    console.log(
      `  Derived: action-abort-build.implied_operation = "${abortAction.implied_operation}" (from api_hint)`
    );
  }

  const graphView = evidence.data_views.find(
    (dv) => dv.view_id === "view-knowledge-graph"
  );
  if (graphView) {
    console.log(
      `  Derived: view-knowledge-graph.implied_model = "${graphView.implied_model}" (from source_hint)`
    );
  }

  // Step 2: Persist
  try {
    await persistDesignEvidence(evidence);
    console.log("\nPersisted to Neo4j graph.");
  } catch (err) {
    console.error(
      "\nCould not persist to Neo4j:",
      (err as Error).message
    );
  }

  // Step 3: Write backup JSON
  const fs = await import("fs");
  const outPath = `design-evidence-operator-ui-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));
  console.log(`Written to ${outPath}`);
}

main().catch(console.error);
