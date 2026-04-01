import { describe, expect, it } from "vitest";
import { extractDesignConstraintsForFeature } from "../src/services/design-evidence-loader.js";
import type { DesignEvidence } from "../src/types/design-evidence.js";

function makeEvidence(): DesignEvidence {
  return {
    evidence_id: "design-test-1",
    source: { type: "manual", ref: "test", name: "Test" },
    screens: [
      {
        screen_id: "screen-appointments",
        name: "Appointment Booking",
        purpose: "Patients can book and manage appointments",
        is_overlay: false,
        regions: [],
        component_ids: ["comp-calendar"],
        data_view_ids: ["view-appointments"],
        form_ids: ["form-appointment"],
        action_ids: ["action-book"],
        state_ids: ["state-loading"],
      },
      {
        screen_id: "screen-bad",
        name: undefined as any,
        purpose: "Malformed screen with no name",
        is_overlay: false,
        regions: [],
        component_ids: [],
        data_view_ids: [],
        form_ids: [],
        action_ids: [],
        state_ids: [],
      },
    ],
    navigation: {
      primary_items: [
        { label: "Appointments", target_screen_id: "screen-appointments", level: "primary" },
      ],
      secondary_items: [],
      edges: [],
    },
    components: [
      {
        component_id: "comp-calendar",
        name: "Calendar",
        category: "data_display",
        purpose: "Displays available appointment slots",
        screen_ids: ["screen-appointments"],
        visible_props: [],
        children: [],
        interactions: [],
      },
      {
        component_id: "comp-bad",
        name: "Broken",
        category: "other",
        purpose: "",
        screen_ids: [undefined as any],
        visible_props: [],
        children: [],
        interactions: [],
      },
    ],
    data_views: [
      {
        view_id: "view-appointments",
        name: "Appointments",
        type: "calendar",
        screen_id: "screen-appointments",
        columns: [],
        implied_model: "Appointment",
        capabilities: ["filter"],
        row_actions: [],
        bulk_actions: [],
      },
    ],
    forms: [
      {
        form_id: "form-appointment",
        name: "Book Appointment",
        screen_id: "screen-appointments",
        fields: [{ name: "date", label: "Date", type: "date", required: true }],
        submit_label: "Book",
        is_multi_step: false,
        has_validation: true,
      },
    ],
    actions: [
      {
        action_id: "action-book",
        label: "Book",
        type: "submit",
        screen_id: "screen-appointments",
        element: "button",
        is_destructive: false,
        is_primary: true,
      },
    ],
    states: [
      {
        state_id: "state-loading",
        type: "loading",
        screen_id: "screen-appointments",
        description: "Loading",
        explicit: true,
      },
    ],
    layout: {
      pattern: "sidebar_main",
      responsive_notes: [],
    },
    extraction_meta: {
      confidence: 1,
      artboards_analyzed: 1,
      nodes_traversed: 1,
      warnings: [],
      duration_ms: 0,
    },
    extracted_at: new Date().toISOString(),
  };
}

describe("extractDesignConstraintsForFeature", () => {
  it("skips malformed design rows instead of crashing bridge compilation", () => {
    const constraints = extractDesignConstraintsForFeature(
      makeEvidence(),
      "Appointment Booking"
    );

    expect(constraints).toBeDefined();
    expect(constraints?.required_screens).toHaveLength(1);
    expect(constraints?.required_screens[0]?.screen_id).toBe("screen-appointments");
    expect(constraints?.required_components[0]?.component_id).toBe("comp-calendar");
    expect(constraints?.required_forms[0]?.form_id).toBe("form-appointment");
  });
});
