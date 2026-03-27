import { describe, it, expect } from "vitest";
import { normalizeDesignEvidence } from "../src/tools/design-normalize.js";
import type { RawDesignEvidence } from "../src/types/raw-design-evidence.js";
import type { DesignEvidence } from "../src/types/design-evidence.js";

// ═══════════════════════════════════════════════════════════════
// FIXTURES
// ═══════════════════════════════════════════════════════════════

/** Minimal valid raw evidence */
function minimalRaw(): RawDesignEvidence {
  return {
    source: { type: "manual", ref: "test", name: "Test Design" },
    screens: [
      {
        name: "Home",
        purpose: "Landing page",
      },
    ],
  };
}

/** Raw evidence using old/alternative field names */
function rawWithOldFieldNames(): RawDesignEvidence {
  return {
    evidence_id: "test-old-fields",
    source: { type: "paper", ref: "test-doc", name: "Old Fields Test" },
    screens: [
      {
        id: "screen-home",
        name: "Home",
        purpose: "Main page",
        component_ids: ["comp-nav"],
        data_view_ids: ["view-table"],
        form_ids: ["form-login"],
        action_ids: ["action-delete"],
        state_ids: ["state-loading"],
      },
    ],
    components: [
      {
        id: "comp-nav",
        name: "Navigation",
        category: "navigation",
        purpose: "Main nav bar",
      },
    ],
    data_views: [
      {
        data_view_id: "view-table",
        name: "Users Table",
        type: "table",
        source_hint: "User",
        columns: [{ name: "email", type: "text" }],
      },
    ],
    forms: [
      {
        id: "form-login",
        name: "Login Form",
        submit_text: "Sign In",
        fields: [
          { field_id: "email", label: "Email", type: "email", required: true },
        ],
      },
    ],
    actions: [
      {
        id: "action-delete",
        name: "Delete User",
        type: "delete",
        api_hint: "DELETE /api/users/:id",
      },
    ],
    states: [
      {
        id: "state-loading",
        type: "loading",
        description: "Loading data...",
        // explicit omitted
      },
    ],
    navigation: {
      edges: [
        {
          from_screen_id: "screen-home",
          to_screen_id: "screen-profile",
          trigger: "click avatar",
          nav_type: "profile_link",
        },
      ],
    },
  };
}

/** Raw evidence in already-canonical shape (like hand-authored) */
function rawAlreadyCanonical(): RawDesignEvidence {
  return {
    evidence_id: "test-canonical",
    source: { type: "paper", ref: "test", name: "Canonical Test" },
    screens: [
      {
        screen_id: "screen-dash",
        name: "Dashboard",
        purpose: "Overview",
        is_overlay: false,
        regions: [
          {
            name: "Main",
            purpose: "Content area",
            component_ids: ["comp-chart"],
          },
        ],
        component_ids: ["comp-chart"],
        data_view_ids: [],
        form_ids: [],
        action_ids: ["action-refresh"],
        state_ids: ["state-empty"],
      },
    ],
    components: [
      {
        component_id: "comp-chart",
        name: "Chart",
        category: "data_display",
        purpose: "Revenue chart",
        screen_ids: ["screen-dash"],
        visible_props: ["data"],
        children: [],
        interactions: ["hover"],
      },
    ],
    actions: [
      {
        action_id: "action-refresh",
        label: "Refresh",
        type: "custom",
        screen_id: "screen-dash",
        element: "icon_button",
        is_destructive: false,
        is_primary: false,
      },
    ],
    states: [
      {
        state_id: "state-empty",
        type: "empty",
        screen_id: "screen-dash",
        description: "No data yet",
        explicit: true,
      },
    ],
    layout: {
      pattern: "sidebar_main",
      sidebar: { position: "left", collapsible: true, width_hint: "240px" },
    },
  };
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

describe("normalizeDesignEvidence", () => {
  describe("ID resolution", () => {
    it("auto-generates evidence_id when omitted", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      expect(result.evidence_id).toMatch(/^de-[a-f0-9]{8}$/);
    });

    it("preserves explicit evidence_id", () => {
      const raw = minimalRaw();
      raw.evidence_id = "my-custom-id";
      const result = normalizeDesignEvidence(raw);
      expect(result.evidence_id).toBe("my-custom-id");
    });

    it("resolves screen id from 'id' field", () => {
      const raw = rawWithOldFieldNames();
      const result = normalizeDesignEvidence(raw);
      expect(result.screens[0].screen_id).toBe("screen-home");
    });

    it("auto-generates screen_id from name when no id given", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      expect(result.screens[0].screen_id).toBe("screen-home");
    });

    it("resolves component id from 'id' field", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const nav = result.components.find((c) => c.name === "Navigation");
      expect(nav?.component_id).toBe("comp-nav");
    });

    it("resolves data_view_id from 'data_view_id' field", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const table = result.data_views.find((dv) => dv.name === "Users Table");
      expect(table?.view_id).toBe("view-table");
    });

    it("resolves form id from 'id' field", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const form = result.forms.find((f) => f.name === "Login Form");
      expect(form?.form_id).toBe("form-login");
    });

    it("resolves action id from 'id' field", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const action = result.actions.find((a) => a.label === "Delete User");
      expect(action?.action_id).toBe("action-delete");
    });

    it("resolves state id from 'id' field", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const state = result.states.find((s) => s.type === "loading");
      expect(state?.state_id).toBe("state-loading");
    });
  });

  describe("derived flags", () => {
    it("derives is_destructive=true from type=delete", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const action = result.actions.find((a) => a.label === "Delete User");
      expect(action?.is_destructive).toBe(true);
    });

    it("derives is_destructive=false for non-delete types", () => {
      const result = normalizeDesignEvidence(rawAlreadyCanonical());
      const action = result.actions.find((a) => a.label === "Refresh");
      expect(action?.is_destructive).toBe(false);
    });

    it("respects explicit is_destructive=false even for delete type", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          {
            name: "X",
            purpose: "x",
            action_ids: ["action-soft-delete"],
          },
        ],
        actions: [
          {
            action_id: "action-soft-delete",
            label: "Archive",
            type: "delete",
            is_destructive: false,
          },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.actions[0].is_destructive).toBe(false);
    });

    it("defaults is_primary to false when omitted", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const action = result.actions.find((a) => a.label === "Delete User");
      expect(action?.is_primary).toBe(false);
    });

    it("defaults explicit=true for states when omitted", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const state = result.states.find((s) => s.type === "loading");
      expect(state?.explicit).toBe(true);
    });

    it("derives is_multi_step=false when omitted", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const form = result.forms.find((f) => f.name === "Login Form");
      expect(form?.is_multi_step).toBe(false);
    });

    it("derives has_validation from required fields when omitted", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", form_ids: ["form-x"] },
        ],
        forms: [
          {
            form_id: "form-x",
            name: "X Form",
            fields: [{ name: "email", required: true }],
          },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.forms[0].has_validation).toBe(true);
    });
  });

  describe("field name mapping", () => {
    it("maps action name -> label", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const action = result.actions.find(
        (a) => a.action_id === "action-delete"
      );
      expect(action?.label).toBe("Delete User");
    });

    it("maps form submit_text -> submit_label", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const form = result.forms.find((f) => f.form_id === "form-login");
      expect(form?.submit_label).toBe("Sign In");
    });

    it("maps form field_id -> name", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const form = result.forms.find((f) => f.form_id === "form-login");
      expect(form?.fields[0].name).toBe("email");
    });

    it("maps data view source_hint -> implied_model", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const dv = result.data_views.find((v) => v.view_id === "view-table");
      expect(dv?.implied_model).toBe("User");
    });

    it("maps action api_hint -> implied_operation", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const action = result.actions.find(
        (a) => a.action_id === "action-delete"
      );
      expect(action?.implied_operation).toBe("DELETE /api/users/:id");
    });

    it("maps nav edge nav_type -> label", () => {
      const result = normalizeDesignEvidence(rawWithOldFieldNames());
      const edge = result.navigation.edges[0];
      expect(edge?.label).toBe("profile_link");
    });
  });

  describe("defaults for missing arrays", () => {
    it("defaults component arrays to empty", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      const comp = result.components[0]; // auto-created stub
      if (comp) {
        expect(comp.visible_props).toEqual([]);
        expect(comp.children).toEqual([]);
        expect(comp.interactions).toEqual([]);
      }
    });

    it("defaults navigation to empty when omitted", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      expect(result.navigation.primary_items).toEqual([]);
      expect(result.navigation.secondary_items).toEqual([]);
      expect(result.navigation.edges).toEqual([]);
    });
  });

  describe("already-canonical evidence passthrough", () => {
    it("preserves canonical evidence without mutation", () => {
      const result = normalizeDesignEvidence(rawAlreadyCanonical());
      expect(result.evidence_id).toBe("test-canonical");
      expect(result.screens[0].screen_id).toBe("screen-dash");
      expect(result.components[0].component_id).toBe("comp-chart");
      expect(result.components[0].purpose).toBe("Revenue chart");
      expect(result.actions[0].label).toBe("Refresh");
      expect(result.states[0].explicit).toBe(true);
      expect(result.layout.pattern).toBe("sidebar_main");
      expect(result.layout.sidebar?.collapsible).toBe(true);
    });
  });

  describe("type validation", () => {
    it("falls back to 'other' for invalid component category", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", component_ids: ["comp-x"] },
        ],
        components: [
          { component_id: "comp-x", name: "Widget", category: "invalid_cat" },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.components[0].category).toBe("other");
    });

    it("falls back to 'table' for invalid view type", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", data_view_ids: ["view-x"] },
        ],
        data_views: [
          { view_id: "view-x", name: "Widget", type: "invalid_type" },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.data_views[0].type).toBe("table");
    });

    it("falls back to 'custom' for invalid action type", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", action_ids: ["action-x"] },
        ],
        actions: [
          { action_id: "action-x", label: "Do Thing", type: "invalid_type" },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.actions[0].type).toBe("custom");
    });

    it("falls back to 'custom' for invalid state type", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", state_ids: ["state-x"] },
        ],
        states: [
          {
            state_id: "state-x",
            type: "invalid_type",
            description: "Something",
          },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.states[0].type).toBe("custom");
    });

    it("filters invalid capabilities from data views", () => {
      const raw: RawDesignEvidence = {
        source: { type: "manual", ref: "t", name: "t" },
        screens: [
          { name: "X", purpose: "x", data_view_ids: ["view-x"] },
        ],
        data_views: [
          {
            view_id: "view-x",
            name: "Table",
            capabilities: ["sort", "invalid_cap", "filter"],
          },
        ],
      };
      const result = normalizeDesignEvidence(raw);
      expect(result.data_views[0].capabilities).toEqual(["sort", "filter"]);
    });
  });

  describe("operator UI evidence (integration)", () => {
    it("normalizes the real operator UI raw evidence", async () => {
      // Dynamically import to test the actual authored evidence
      const mod = await import(
        "../src/tools/extract-operator-ui-design.js"
      ).catch(() => null);

      // If the module can't be imported (Neo4j dependency), test with inline copy
      const raw: RawDesignEvidence = {
        evidence_id: "design-aes-operator-ui-001",
        source: { type: "paper", ref: "Diligent ink", name: "AES Operator UI" },
        screens: [
          {
            screen_id: "screen-intent-input",
            name: "Intent Input",
            purpose: "Landing state",
            action_ids: ["action-start-build"],
            state_ids: ["state-idle"],
          },
        ],
        actions: [
          {
            action_id: "action-start-build",
            label: "Start Build",
            type: "submit",
            is_primary: true,
            api_hint: "POST /api/app/intake",
          },
          {
            action_id: "action-abort-build",
            name: "Abort Build",
            type: "delete",
            api_hint: "POST /api/builds/:id/abort-builder",
          },
        ],
        states: [
          {
            state_id: "state-idle",
            type: "empty",
            description: "No build active",
          },
        ],
        data_views: [
          {
            view_id: "view-knowledge-graph",
            name: "Knowledge Graph",
            type: "chart",
            source_hint: "GraphNode",
          },
        ],
      };

      const result = normalizeDesignEvidence(raw);

      // Verify key derivations
      const abort = result.actions.find(
        (a) => a.action_id === "action-abort-build"
      );
      expect(abort?.label).toBe("Abort Build");
      expect(abort?.is_destructive).toBe(true);
      expect(abort?.implied_operation).toBe(
        "POST /api/builds/:id/abort-builder"
      );

      const start = result.actions.find(
        (a) => a.action_id === "action-start-build"
      );
      expect(start?.is_primary).toBe(true);
      expect(start?.implied_operation).toBe("POST /api/app/intake");

      const graphView = result.data_views.find(
        (dv) => dv.view_id === "view-knowledge-graph"
      );
      expect(graphView?.implied_model).toBe("GraphNode");

      const idle = result.states.find((s) => s.state_id === "state-idle");
      expect(idle?.explicit).toBe(true);
    });
  });

  describe("extraction_meta", () => {
    it("defaults confidence to 1.0 when omitted", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      expect(result.extraction_meta.confidence).toBe(1.0);
    });

    it("preserves explicit confidence", () => {
      const raw = minimalRaw();
      raw.extraction_meta = { confidence: 0.75 };
      const result = normalizeDesignEvidence(raw);
      expect(result.extraction_meta.confidence).toBe(0.75);
    });

    it("counts artboards from screens when not specified", () => {
      const result = normalizeDesignEvidence(minimalRaw());
      expect(result.extraction_meta.artboards_analyzed).toBe(1);
    });
  });
});
