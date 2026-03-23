import type { AESStateType } from "../state.js";
import { randomUUID } from "node:crypto";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

/**
 * Bridge Compiler — compiles one FeatureBridge per feature from:
 * - The feature definition in AppSpec
 * - Catalog search results (reuse candidates)
 * - Applied rules
 * - Required tests from acceptance_tests
 * - Dependency status
 *
 * Iterates through features in build order.
 */

function compileBridge(
  feature: any,
  appSpec: any,
  catalogMatches: any[],
  buildIndex: number
): any {
  const featureLower = feature.name.toLowerCase();

  // Derive write scope paths from feature type
  const writePaths: string[] = [];
  if (featureLower.includes("form") || featureLower.includes("submission") || featureLower.includes("wizard")) {
    writePaths.push("app/(dashboard)/" + feature.feature_id);
    writePaths.push("components/forms/");
    writePaths.push("convex/");
  } else if (featureLower.includes("queue") || featureLower.includes("table") || featureLower.includes("list")) {
    writePaths.push("app/(dashboard)/" + feature.feature_id);
    writePaths.push("components/tables/");
    writePaths.push("convex/");
  } else if (featureLower.includes("dashboard") || featureLower.includes("overview")) {
    writePaths.push("app/(dashboard)/");
    writePaths.push("components/dashboard/");
    writePaths.push("convex/");
  } else if (featureLower.includes("notification") || featureLower.includes("email")) {
    writePaths.push("convex/");
    writePaths.push("lib/notifications/");
  } else if (featureLower.includes("audit")) {
    writePaths.push("convex/");
    writePaths.push("components/audit/");
    writePaths.push("app/(dashboard)/audit/");
  } else {
    writePaths.push("app/(dashboard)/" + feature.feature_id);
    writePaths.push("components/" + feature.feature_id);
    writePaths.push("convex/");
  }

  // Get selected reuse assets
  const selectedAssets = (catalogMatches || [])
    .filter((c: any) => c.selected)
    .map((c: any) => c.candidate_id);

  // Get relevant acceptance tests
  const relevantTests = (appSpec.acceptance_tests || [])
    .filter((t: any) => t.feature_id === feature.feature_id)
    .map((t: any) => ({
      test_id: t.test_id,
      name: t.name,
      type: t.type,
      description: t.description,
      pass_condition: t.pass_condition,
    }));

  // Check dependencies
  const deps = (appSpec.dependency_graph || [])
    .filter((e: any) => e.from_feature_id === feature.feature_id)
    .map((e: any) => ({
      dependency_id: e.to_feature_id,
      feature_id: e.to_feature_id,
      reason: e.reason,
      status: "required" as const,
    }));

  // Applied rules based on feature properties
  const rules: any[] = [];
  if (feature.audit_required) {
    rules.push({
      rule_id: "rule-audit",
      title: "Audit logging required",
      description: "All mutations must call logAuditEvent",
      severity: "critical",
      rationale: "Feature marked as audit_required",
    });
  }
  if (feature.destructive_actions?.length > 0) {
    rules.push({
      rule_id: "rule-destructive",
      title: "Destructive actions must have confirmation",
      description: "All destructive actions require confirmation dialog and audit log",
      severity: "critical",
      rationale: `${feature.destructive_actions.length} destructive action(s) defined`,
    });
  }
  if (feature.external_dependencies?.length > 0) {
    rules.push({
      rule_id: "rule-fallback",
      title: "External dependencies need fallback",
      description: "Each external service must have defined fallback behavior",
      severity: "error",
      rationale: `Dependencies: ${feature.external_dependencies.join(", ")}`,
    });
  }

  // Confidence
  const confidence = {
    scope_clarity: 0.85,
    reuse_fit: selectedAssets.length > 0 ? 0.8 : 0.5,
    dependency_clarity: deps.every((d: any) => d.status !== "blocked") ? 0.9 : 0.4,
    rule_coverage: rules.length > 0 ? 0.85 : 0.7,
    test_coverage: relevantTests.length > 0 ? 0.8 : 0.5,
    overall: 0,
    notes: [] as string[],
  };
  confidence.overall =
    (confidence.scope_clarity +
      confidence.reuse_fit +
      confidence.dependency_clarity +
      confidence.rule_coverage +
      confidence.test_coverage) /
    5;

  return {
    bridge_id: randomUUID(),
    app_id: appSpec.app_id,
    app_spec_id: appSpec.app_id,
    feature_id: feature.feature_id,
    feature_name: feature.name,
    status: "draft",
    build_scope: {
      objective: feature.outcome,
      included_capabilities: [feature.name],
      excluded_capabilities: [],
      acceptance_boundary: feature.outcome,
    },
    read_scope: {
      allowed_repo_paths: ["app/", "components/", "convex/", "lib/", "public/"],
      allowed_packages: ["@aes/ui", "@aes/auth", "@aes/layouts", "@aes/workflows", "@aes/audit"],
      allowed_features: [],
      allowed_graph_nodes: [],
      allowed_artifacts: [],
    },
    write_scope: {
      target_repo: "", // Will be set when product repo is created
      allowed_repo_paths: writePaths,
      forbidden_repo_paths: [".github/", "node_modules/", ".env"],
      may_create_files: true,
      may_modify_existing_files: true,
      may_delete_files: false,
      may_change_shared_packages: false,
      may_change_schema: true,
    },
    reuse_candidates: catalogMatches || [],
    selected_reuse_assets: selectedAssets,
    applied_rules: rules,
    required_tests: relevantTests,
    dependencies: deps,
    hard_vetoes: [], // Will be populated by veto checker
    blocked_reason: null,
    success_definition: {
      user_visible_outcome: feature.outcome,
      technical_outcome: `${feature.name} implemented with tests passing`,
      validation_requirements: relevantTests.map((t: any) => t.pass_condition),
    },
    confidence,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function bridgeCompiler(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.appSpec || !state.userApproved) {
    cb?.onFail("Cannot compile bridges — app not approved");
    return { currentGate: "failed" as const, errorMessage: "App not approved" };
  }

  cb?.onGate("gate_2", "Compiling feature bridges...");

  const bridges: Record<string, any> = {};
  const catalogMatches = state.featureBridges || {};
  const features = state.appSpec.features;
  const buildOrder = state.featureBuildOrder || features.map((f: any) => f.feature_id);

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const matches = catalogMatches[feature.feature_id] || [];
    const bridge = compileBridge(feature, state.appSpec, matches, i);

    bridges[feature.feature_id] = bridge;

    const selectedCount = bridge.selected_reuse_assets.length;
    const testCount = bridge.required_tests.length;
    const ruleCount = bridge.applied_rules.length;

    cb?.onFeatureStatus(
      feature.feature_id,
      feature.name,
      "draft"
    );
    cb?.onStep(
      `${feature.name}: ${selectedCount} reuse assets, ${ruleCount} rules, ${testCount} tests, ${(bridge.confidence.overall * 100).toFixed(0)}% confidence`
    );
  }

  store.addLog(state.jobId, {
    gate: "gate_2",
    message: `${features.length} bridges compiled`,
  });

  cb?.onSuccess(`${features.length} feature bridges compiled`);

  return {
    featureBridges: bridges,
    featureBuildOrder: buildOrder,
    featureBuildIndex: 0,
  };
}
