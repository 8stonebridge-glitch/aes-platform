/**
 * Designer Node — Auto-generates DesignEvidence from decomposed AppSpec.
 *
 * Runs after decomposer, before spec_validator.
 * Uses LLM to derive screens, components, forms, actions, states, and navigation
 * from the feature list. Falls back to template-based generation if no LLM.
 *
 * Output: populates state.designEvidence so downstream nodes (bridge compiler,
 * builder) can use design constraints.
 *
 * Paper MCP integration: if an operator has already created a design in Paper
 * and extracted it (design-evidence-*.json on disk), the graph-reader will have
 * loaded it into state.designEvidence already. This node skips generation in
 * that case and only enriches/validates.
 */

import { randomUUID } from "node:crypto";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { AESStateType } from "../state.js";
import type {
  DesignEvidence,
  DesignScreen,
  DesignComponent,
  DataView,
  DesignForm,
  DesignAction,
  DesignState,
  NavigationGraph,
  LayoutInfo,
  ExtractionMeta,
} from "../types/design-evidence.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { getLLM, isLLMAvailable, safeLLMCall } from "../llm/provider.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLATFORM_ROOT = join(__dirname, "..", "..", "..");

// ─── Main designer node ──────────────────────────────────────────

export async function designer(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  // Skip if design evidence already loaded (from Paper MCP or prior extraction)
  if (state.designEvidence) {
    const existing = state.designEvidence as DesignEvidence;
    cb?.onStep(
      `Design evidence already loaded (${existing.screens.length} screens, ${existing.components.length} components) — skipping auto-design`
    );
    store.addLog(state.jobId, {
      gate: "gate_1",
      message: `Designer: using pre-loaded design evidence (${existing.evidence_id})`,
    });
    return {};
  }

  if (!state.appSpec) {
    cb?.onStep("No appSpec available — skipping design generation");
    return {};
  }

  // ─── Paper MCP path: generate brief and wait for evidence ───
  if (state.designMode === "paper") {
    cb?.onStep("Design mode: Paper MCP — generating design brief for operator...");

    const brief = generateDesignBrief(state.appSpec, state.intentBrief);

    store.addLog(state.jobId, {
      gate: "gate_1",
      message: `Designer: Paper MCP mode — brief generated with ${brief.screens.length} screens across ${brief.directions.length} directions. Waiting for design evidence.`,
    });

    // Store the brief on the job so the API can serve it
    store.update(state.jobId, { designBrief: brief });

    // Broadcast brief + prompt to UI via SSE
    cb?.onPause(
      `Design brief ready — ${brief.screens.length} screens, ${brief.directions.length} directions. ` +
      `Waiting for design evidence. Use the prompt in the UI or POST to /api/jobs/${state.jobId}/design-evidence`
    );

    // Wait for design evidence to arrive via the API endpoint
    // (same pattern as onNeedsApproval — polls the job store)
    const designEvidence = await new Promise<any>((resolve) => {
      const check = setInterval(() => {
        const job = store.get(state.jobId);
        if (job?.designEvidence) {
          clearInterval(check);
          resolve(job.designEvidence);
        }
      }, 1000);
      // Timeout after 30 minutes (design takes time)
      setTimeout(() => { clearInterval(check); resolve(null); }, 1800000);
    });

    if (!designEvidence) {
      cb?.onWarn("Design evidence not received within 30 minutes — falling back to auto-design");
      const fallback = isLLMAvailable()
        ? await llmDesign(state.appSpec, state.intentBrief).catch(() => templateDesign(state.appSpec))
        : templateDesign(state.appSpec);
      return { designEvidence: fallback, designBrief: brief };
    }

    cb?.onSuccess(
      `Design evidence received: ${designEvidence.screens?.length || 0} screens, ${designEvidence.components?.length || 0} components`
    );

    return { designEvidence, designBrief: brief };
  }

  // ─── Auto path: generate evidence directly ───
  cb?.onStep("Design mode: auto — generating design evidence from AppSpec...");

  let designEvidence: DesignEvidence;

  if (isLLMAvailable()) {
    try {
      designEvidence = await llmDesign(state.appSpec, state.intentBrief);
      cb?.onSuccess(
        `LLM design: ${designEvidence.screens.length} screens, ${designEvidence.components.length} components, ${designEvidence.forms.length} forms`
      );
    } catch (err: any) {
      cb?.onWarn(`LLM design failed (${err.message}), using template designer`);
      designEvidence = templateDesign(state.appSpec);
    }
  } else {
    cb?.onStep("No LLM — using template designer");
    designEvidence = templateDesign(state.appSpec);
  }

  // Persist to disk
  try {
    const filename = `design-evidence-auto-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await writeFile(
      join(PLATFORM_ROOT, filename),
      JSON.stringify(designEvidence, null, 2)
    );
    cb?.onStep(`Design evidence written to ${filename}`);
  } catch (err: any) {
    cb?.onWarn(`Could not persist design evidence: ${err.message}`);
  }

  store.addLog(state.jobId, {
    gate: "gate_1",
    message: `Designer: auto-generated ${designEvidence.screens.length} screens, ${designEvidence.components.length} components`,
  });

  return { designEvidence };
}

// ─── LLM-based design generation ─────────────────────────────────

const DESIGNER_SYSTEM_PROMPT = `You are a UI/UX designer for a software build system. Given an application specification with features, generate a complete design evidence document.

For each feature, derive:
1. SCREENS — the pages/views needed. Every feature with UI gets at least one screen.
2. COMPONENTS — reusable UI elements on each screen (tables, forms, cards, nav items, status indicators).
3. DATA VIEWS — any table, list, card grid, or detail view showing data.
4. FORMS — input forms with their fields, types, and validation.
5. ACTIONS — buttons and interactive elements (create, update, delete, navigate, filter, export).
6. STATES — UI states each screen should handle (loading, empty, error, success, permission_denied).
7. NAVIGATION — how screens connect via sidebar, topbar, and contextual links.

Rules:
- Every screen needs loading, empty, and error states at minimum.
- Forms need validation indicators.
- Destructive actions (delete, remove) must be flagged.
- Use realistic component names (not generic "Component1").
- Data views must specify columns with types.
- Navigation must form a connected graph — every screen reachable from the primary nav or another screen.

Return valid JSON matching the DesignEvidence schema.`;

async function llmDesign(
  appSpec: any,
  intentBrief: any
): Promise<DesignEvidence> {
  const llm = getLLM()!;

  const features = (appSpec.features || [])
    .map((f: any) => `- ${f.name} (${f.feature_id}): ${f.description || f.outcome || ""}`)
    .join("\n");

  const roles = (appSpec.roles || [])
    .map((r: any) => `- ${r.name} (${r.role_id}): ${r.scope || ""}`)
    .join("\n");

  const result = await safeLLMCall("designer", () =>
    llm.invoke([
      { role: "system", content: DESIGNER_SYSTEM_PROMPT },
      {
        role: "user",
        content: `Application: ${appSpec.title || "Untitled"}
App Class: ${appSpec.app_class || "unknown"}
Target Users: ${(appSpec.target_users || []).join(", ")}
Platforms: ${(appSpec.platforms || []).join(", ")}

Features:
${features}

Roles:
${roles}

Generate the DesignEvidence JSON. Include every feature as at least one screen. Generate realistic components, data views, forms, actions, and states.

Return ONLY valid JSON — no markdown, no explanation.`,
      },
    ])
  );

  if (!result) {
    throw new Error("LLM design generation timed out or failed");
  }

  const content = typeof result === "string"
    ? result
    : (result as any).content || JSON.stringify(result);

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in LLM response");

  const parsed = JSON.parse(jsonMatch[0]);

  // Ensure required fields
  return {
    evidence_id: `design-auto-${randomUUID().slice(0, 8)}`,
    source: {
      type: "manual",
      ref: "llm-auto-designer",
      name: `Auto-design for ${appSpec.title || "app"}`,
    },
    screens: parsed.screens || [],
    navigation: parsed.navigation || { primary_items: [], secondary_items: [], edges: [] },
    components: parsed.components || [],
    data_views: parsed.data_views || [],
    forms: parsed.forms || [],
    actions: parsed.actions || [],
    states: parsed.states || [],
    layout: parsed.layout || {
      pattern: "sidebar_main",
      responsive_notes: ["Desktop-first, responsive to tablet"],
    },
    extraction_meta: {
      confidence: 0.7,
      artboards_analyzed: 0,
      nodes_traversed: 0,
      warnings: [{ type: "low_confidence_label", message: "Auto-generated from AppSpec, not from visual design" }],
      duration_ms: 0,
    },
    extracted_at: new Date().toISOString(),
  };
}

// ─── Template-based design generation (no LLM fallback) ──────────

function templateDesign(appSpec: any): DesignEvidence {
  const features = appSpec.features || [];
  const screens: DesignScreen[] = [];
  const components: DesignComponent[] = [];
  const dataViews: DataView[] = [];
  const forms: DesignForm[] = [];
  const actions: DesignAction[] = [];
  const states: DesignState[] = [];
  const navItems: NavigationGraph["primary_items"] = [];
  const navEdges: NavigationGraph["edges"] = [];

  // Always add a dashboard screen
  const dashScreenId = "screen-dashboard";
  screens.push({
    screen_id: dashScreenId,
    name: "Dashboard",
    purpose: "Overview of app state and quick actions",
    is_overlay: false,
    regions: [
      { name: "sidebar", purpose: "Primary navigation", component_ids: ["comp-sidebar-nav"] },
      { name: "main", purpose: "Dashboard content", component_ids: ["comp-stats-overview"] },
    ],
    component_ids: ["comp-sidebar-nav", "comp-stats-overview"],
    data_view_ids: [],
    form_ids: [],
    action_ids: [],
    state_ids: [`state-${dashScreenId}-loading`, `state-${dashScreenId}-empty`, `state-${dashScreenId}-error`],
  });

  navItems.push({ label: "Dashboard", target_screen_id: dashScreenId, level: "primary" });

  // Shared components
  components.push({
    component_id: "comp-sidebar-nav",
    name: "SidebarNav",
    category: "navigation",
    purpose: "Primary sidebar navigation",
    screen_ids: [dashScreenId],
    visible_props: ["items", "activeItem"],
    children: [],
    interactions: ["click to navigate"],
  });

  components.push({
    component_id: "comp-stats-overview",
    name: "StatsOverview",
    category: "data_display",
    purpose: "Key metrics cards",
    screen_ids: [dashScreenId],
    visible_props: ["metrics"],
    children: [],
    interactions: ["click card to drill down"],
  });

  // Add loading/empty/error states for dashboard
  addStates(states, dashScreenId);

  // Generate per-feature screens
  for (const feature of features) {
    const fSlug = (feature.feature_id || feature.name || "")
      .replace(/^f_/, "")
      .replace(/[\s]+/g, "_")
      .toLowerCase();
    const screenId = `screen-${fSlug}`;
    const featureName = feature.name || fSlug;
    const isAuth = /auth|login|register|signup|rbac|role/i.test(featureName);
    const isSettings = /setting|config|preference|profile/i.test(featureName);
    const isCrud = /manage|crud|list|admin/i.test(featureName) || feature.outcome?.includes("create");

    const screenComponents: string[] = ["comp-sidebar-nav"];
    const screenDataViews: string[] = [];
    const screenForms: string[] = [];
    const screenActions: string[] = [];

    // CRUD features get a data table + create form
    if (isCrud || (!isAuth && !isSettings)) {
      const tableId = `view-${fSlug}-table`;
      dataViews.push({
        view_id: tableId,
        name: `${featureName} Table`,
        type: "table",
        screen_id: screenId,
        columns: [
          { name: "Name", type: "text", sortable: true, filterable: true },
          { name: "Status", type: "status", sortable: true, filterable: true },
          { name: "Created", type: "date", sortable: true, filterable: false },
          { name: "Actions", type: "action", sortable: false, filterable: false },
        ],
        implied_model: featureName.replace(/s$/, ""),
        capabilities: ["sort", "filter", "search", "pagination"],
        row_actions: ["edit", "delete"],
        bulk_actions: [],
      });
      screenDataViews.push(tableId);

      const tableCompId = `comp-${fSlug}-table`;
      components.push({
        component_id: tableCompId,
        name: `${featureName}Table`,
        category: "data_display",
        purpose: `Display ${featureName.toLowerCase()} data`,
        screen_ids: [screenId],
        visible_props: ["data", "columns", "pagination"],
        children: [],
        interactions: ["sort by column", "filter", "click row to view details"],
      });
      screenComponents.push(tableCompId);

      // Create action + form
      const createActionId = `action-create-${fSlug}`;
      actions.push({
        action_id: createActionId,
        label: `Create ${featureName.replace(/s$/, "")}`,
        type: "create",
        screen_id: screenId,
        element: "button",
        is_destructive: false,
        is_primary: true,
        implied_operation: `POST /api/${fSlug}`,
      });
      screenActions.push(createActionId);

      const deleteActionId = `action-delete-${fSlug}`;
      actions.push({
        action_id: deleteActionId,
        label: `Delete ${featureName.replace(/s$/, "")}`,
        type: "delete",
        screen_id: screenId,
        element: "icon_button",
        is_destructive: true,
        is_primary: false,
        implied_operation: `DELETE /api/${fSlug}/:id`,
      });
      screenActions.push(deleteActionId);

      const formId = `form-create-${fSlug}`;
      forms.push({
        form_id: formId,
        name: `Create ${featureName.replace(/s$/, "")}`,
        screen_id: screenId,
        fields: [
          { name: "name", label: "Name", type: "text", required: true },
          { name: "description", label: "Description", type: "textarea", required: false },
        ],
        submit_label: "Create",
        cancel_label: "Cancel",
        is_multi_step: false,
        has_validation: true,
      });
      screenForms.push(formId);
    }

    // Auth features get login/register forms
    if (isAuth) {
      const formId = `form-${fSlug}`;
      forms.push({
        form_id: formId,
        name: featureName,
        screen_id: screenId,
        fields: [
          { name: "email", label: "Email", type: "email", required: true },
          { name: "password", label: "Password", type: "password", required: true },
        ],
        submit_label: /register|signup/i.test(featureName) ? "Sign Up" : "Sign In",
        is_multi_step: false,
        has_validation: true,
      });
      screenForms.push(formId);

      const submitActionId = `action-submit-${fSlug}`;
      actions.push({
        action_id: submitActionId,
        label: /register|signup/i.test(featureName) ? "Sign Up" : "Sign In",
        type: "submit",
        screen_id: screenId,
        element: "button",
        is_destructive: false,
        is_primary: true,
      });
      screenActions.push(submitActionId);
    }

    // Settings features get a settings form
    if (isSettings) {
      const formId = `form-${fSlug}`;
      forms.push({
        form_id: formId,
        name: featureName,
        screen_id: screenId,
        fields: [
          { name: "setting_value", label: "Value", type: "text", required: true },
        ],
        submit_label: "Save",
        cancel_label: "Reset",
        is_multi_step: false,
        has_validation: true,
      });
      screenForms.push(formId);
    }

    // States for every screen
    addStates(states, screenId);

    screens.push({
      screen_id: screenId,
      name: featureName,
      purpose: feature.outcome || feature.description || `${featureName} management`,
      is_overlay: false,
      regions: [
        { name: "sidebar", purpose: "Navigation", component_ids: ["comp-sidebar-nav"] },
        { name: "main", purpose: `${featureName} content`, component_ids: screenComponents.filter(c => c !== "comp-sidebar-nav") },
      ],
      component_ids: screenComponents,
      data_view_ids: screenDataViews,
      form_ids: screenForms,
      action_ids: screenActions,
      state_ids: states.filter(s => s.screen_id === screenId).map(s => s.state_id),
    });

    // Add to sidebar nav if not auth
    if (!isAuth) {
      navItems.push({ label: featureName, target_screen_id: screenId, level: "primary" });
    }

    // Nav edge from dashboard
    navEdges.push({
      from_screen_id: dashScreenId,
      to_screen_id: screenId,
      trigger: "click sidebar nav item",
    });

    // Update sidebar nav component to include this screen
    const sidebarComp = components.find(c => c.component_id === "comp-sidebar-nav");
    if (sidebarComp && !sidebarComp.screen_ids.includes(screenId)) {
      sidebarComp.screen_ids.push(screenId);
    }
  }

  const layout: LayoutInfo = {
    pattern: "sidebar_main",
    responsive_notes: ["Sidebar collapses to hamburger on mobile", "Tables scroll horizontally on small screens"],
    sidebar: { position: "left", collapsible: true, width_hint: "240px" },
    topbar: { sticky: true, has_search: true, has_user_menu: true, has_notifications: true },
    content: { max_width: "1280px", padding: "24px" },
  };

  return {
    evidence_id: `design-template-${randomUUID().slice(0, 8)}`,
    source: {
      type: "manual",
      ref: "template-auto-designer",
      name: `Template design for ${appSpec.title || "app"}`,
    },
    screens,
    navigation: { primary_items: navItems, secondary_items: [], edges: navEdges },
    components,
    data_views: dataViews,
    forms,
    actions,
    states,
    layout,
    extraction_meta: {
      confidence: 0.5,
      artboards_analyzed: 0,
      nodes_traversed: 0,
      warnings: [{ type: "low_confidence_label", message: "Template-generated, not from visual design. Refine in Paper MCP for better results." }],
      duration_ms: 0,
    },
    extracted_at: new Date().toISOString(),
  };
}

// ─── Helper: add standard states for a screen ────────────────────

function addStates(states: DesignState[], screenId: string): void {
  const stateTypes: Array<{ type: DesignState["type"]; desc: string; recovery?: string }> = [
    { type: "loading", desc: "Content is loading", recovery: undefined },
    { type: "empty", desc: "No data to display", recovery: "Create first item" },
    { type: "error", desc: "Failed to load data", recovery: "Retry" },
    { type: "success", desc: "Action completed successfully" },
  ];

  for (const st of stateTypes) {
    states.push({
      state_id: `state-${screenId}-${st.type}`,
      type: st.type,
      screen_id: screenId,
      description: st.desc,
      explicit: st.type === "loading" || st.type === "error",
      recovery_action: st.recovery,
    });
  }
}

// ─── Design brief generator (Paper MCP path) ─────────────────────

interface DesignDirection {
  name: string;
  description: string;
  layout: string;
  color_mood: string;
  density: string;
  typography: string;
}

interface DesignBrief {
  app_title: string;
  app_class: string;
  target_users: string[];
  platforms: string[];
  screens: Array<{
    screen_id: string;
    name: string;
    purpose: string;
    key_components: string[];
    data_views: string[];
    forms: string[];
    actions: string[];
    states: string[];
  }>;
  directions: DesignDirection[];
  navigation: {
    pattern: string;
    primary_items: string[];
  };
  constraints: {
    must_have_states: string[];
    destructive_actions: string[];
    auth_screens: string[];
  };
  /** Ready-to-paste prompt for Claude Code to drive Paper MCP */
  claude_prompt: string;
}

function generateDesignBrief(appSpec: any, intentBrief: any): DesignBrief {
  const features = appSpec.features || [];
  const screens: DesignBrief["screens"] = [];
  const destructiveActions: string[] = [];
  const authScreens: string[] = [];

  // Always include dashboard
  screens.push({
    screen_id: "screen-dashboard",
    name: "Dashboard",
    purpose: "Overview of key metrics and quick actions",
    key_components: ["stats cards", "recent activity", "quick actions"],
    data_views: ["summary metrics"],
    forms: [],
    actions: [],
    states: ["loading", "empty", "error"],
  });

  for (const feature of features) {
    const name = feature.name || feature.feature_id;
    const fSlug = (feature.feature_id || "").replace(/^f_/, "").replace(/[\s]+/g, "_").toLowerCase();
    const isAuth = /auth|login|register|signup|rbac|role/i.test(name);
    const isCrud = /manage|crud|list|admin/i.test(name) || feature.outcome?.includes("create");
    const isSettings = /setting|config|preference|profile/i.test(name);

    const screen: DesignBrief["screens"][0] = {
      screen_id: `screen-${fSlug}`,
      name,
      purpose: feature.outcome || feature.description || name,
      key_components: [],
      data_views: [],
      forms: [],
      actions: [],
      states: ["loading", "empty", "error", "success"],
    };

    if (isCrud || (!isAuth && !isSettings)) {
      screen.key_components.push("data table", "search/filter bar", "pagination");
      screen.data_views.push(`${name} table`);
      screen.forms.push(`create ${name.replace(/s$/, "")} form`);
      screen.actions.push(`create ${name.replace(/s$/, "")}`, `edit`, `delete`);
      destructiveActions.push(`delete ${name.replace(/s$/, "")}`);
    }

    if (isAuth) {
      screen.key_components.push("auth form", "social login buttons", "password field");
      screen.forms.push(/register|signup/i.test(name) ? "registration form" : "login form");
      screen.actions.push("submit");
      authScreens.push(screen.screen_id);
    }

    if (isSettings) {
      screen.key_components.push("settings form", "toggle switches", "save button");
      screen.forms.push("settings form");
      screen.actions.push("save", "reset");
    }

    screens.push(screen);
  }

  // Generate 3 design directions
  const directions: DesignDirection[] = [
    {
      name: "Minimal Command Center",
      description: "Dense, information-rich. Inspired by terminal UIs and developer tools. Dark background, monospace accents, high data density.",
      layout: "sidebar_main",
      color_mood: "Dark neutral with single accent color (amber or cyan)",
      density: "High — tables, compact cards, minimal whitespace",
      typography: "Inter for UI, JetBrains Mono for data. Heavy weight contrast between headings and labels.",
    },
    {
      name: "Clean Editorial",
      description: "Spacious, readable. Inspired by Notion and Linear. Light background, generous whitespace, strong typographic hierarchy.",
      layout: "sidebar_main",
      color_mood: "Warm off-white with one refined accent (slate blue or warm red)",
      density: "Medium — breathing room around elements, card-based layouts",
      typography: "Inter throughout. Large bold headings, regular body, small muted secondary text.",
    },
    {
      name: "Dashboard Grid",
      description: "Widget-based layout. Inspired by Grafana and analytics tools. Modular cards, charts, status indicators.",
      layout: "sidebar_topbar_main",
      color_mood: "Light with color-coded status indicators (green/amber/red)",
      density: "Medium-high — grid of cards with charts and status badges",
      typography: "Inter. Tabular numbers for data, condensed headers for card titles.",
    },
  ];

  const appTitle = appSpec.title || intentBrief?.inferred_core_outcome || "Untitled App";

  // Build the ready-to-paste Claude Code prompt
  const screenSpecs = screens.map(s => {
    const parts = [`### ${s.name}\n- Purpose: ${s.purpose}`];
    if (s.key_components.length > 0) parts.push(`- Components: ${s.key_components.join(", ")}`);
    if (s.data_views.length > 0) parts.push(`- Data views: ${s.data_views.join(", ")}`);
    if (s.forms.length > 0) parts.push(`- Forms: ${s.forms.join(", ")}`);
    if (s.actions.length > 0) parts.push(`- Actions: ${s.actions.join(", ")}`);
    parts.push(`- States: ${s.states.join(", ")}`);
    return parts.join("\n");
  }).join("\n\n");

  const directionSpecs = directions.map((d, i) =>
    `**Direction ${i + 1}: ${d.name}**\n${d.description}\n- Layout: ${d.layout}\n- Colors: ${d.color_mood}\n- Density: ${d.density}\n- Typography: ${d.typography}`
  ).join("\n\n");

  const claudePrompt = `Design a UI for "${appTitle}" in Paper. Create ${directions.length} design directions as separate artboard sets. Each direction should cover all ${screens.length} screens below but with a different visual treatment.

## Screens to design

${screenSpecs}

## Design directions

${directionSpecs}

## Navigation
- Pattern: sidebar with collapsible sections
- Primary items: ${screens.filter(s => !authScreens.includes(s.screen_id)).map(s => s.name).join(", ")}

## Requirements
- Every screen must show loading, empty, and error states (can be as separate artboards or annotated)
- Destructive actions (${destructiveActions.length > 0 ? destructiveActions.join(", ") : "none"}) need confirmation dialogs
- Auth screens: ${authScreens.length > 0 ? authScreens.join(", ") : "none — auth handled externally"}
- Use realistic placeholder content
- Desktop-first (1440px wide artboards), note responsive considerations

## After designing
When all directions are done, I will pick one. Then run:
\`\`\`
npx tsx src/tools/design-extract.ts --paper --persist
\`\`\`
This extracts the design as evidence for the AES build pipeline.`;

  return {
    app_title: appTitle,
    app_class: appSpec.app_class || "unknown",
    target_users: appSpec.target_users || [],
    platforms: appSpec.platforms || [],
    screens,
    directions,
    navigation: {
      pattern: "sidebar with collapsible sections",
      primary_items: screens.filter(s => !authScreens.includes(s.screen_id)).map(s => s.name),
    },
    constraints: {
      must_have_states: ["loading", "empty", "error", "success"],
      destructive_actions: destructiveActions,
      auth_screens: authScreens,
    },
    claude_prompt: claudePrompt,
  };
}
