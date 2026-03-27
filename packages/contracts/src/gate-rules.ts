import { z } from "zod";
import type { AppSpec } from "./app-spec.js";
import type { FeatureBridge } from "./feature-bridge.js";

// ─── Rule Result ──────────────────────────────────────────────────────

export const GateRuleResultSchema = z.object({
  code: z.string(),
  passed: z.boolean(),
  reason: z.string().optional(),
});
export type GateRuleResult = z.infer<typeof GateRuleResultSchema>;

// ─── Gate 1 — AppSpec Validation Rules ────────────────────────────────

export const GATE_1_RULES = [
  "ALL_FEATURES_HAVE_ACTORS",
  "ALL_FEATURES_HAVE_OUTCOMES",
  "ALL_WORKFLOWS_REFERENCE_VALID_FEATURES",
  "ALL_PERMISSIONS_REFERENCE_VALID_ROLES",
  "ALL_PERMISSION_RESOURCES_DEFINED",
  "NO_UNDEFINED_FEATURE_DEPENDENCIES",
  "ALL_CRITICAL_FEATURES_HAVE_ACCEPTANCE_TESTS",
  "ALL_EXTERNAL_INTEGRATIONS_DECLARE_FALLBACK_STATUS",
  "ALL_AUDIT_REQUIRED_FEATURES_HAVE_COMPLIANCE_OR_AUDIT_REQUIREMENTS",
  "ALL_OFFLINE_REQUIRED_FEATURES_HAVE_OFFLINE_REQUIREMENTS",
] as const;

export type Gate1RuleCode = (typeof GATE_1_RULES)[number];

export function validateAppSpec(spec: AppSpec): GateRuleResult[] {
  const results: GateRuleResult[] = [];
  const featureIds = new Set(spec.features.map((f) => f.feature_id));
  const roleIds = new Set(spec.roles.map((r) => r.role_id));
  const entityIds = new Set(spec.domain_entities.map((e) => e.entity_id));

  // ALL_FEATURES_HAVE_ACTORS
  const featuresWithoutActors = spec.features.filter(
    (f) => f.actor_ids.length === 0
  );
  results.push({
    code: "ALL_FEATURES_HAVE_ACTORS",
    passed: featuresWithoutActors.length === 0,
    reason:
      featuresWithoutActors.length > 0
        ? `Features without actors: ${featuresWithoutActors.map((f) => f.feature_id).join(", ")}`
        : undefined,
  });

  // ALL_FEATURES_HAVE_OUTCOMES
  const featuresWithoutOutcomes = spec.features.filter(
    (f) => !f.outcome || f.outcome.trim() === ""
  );
  results.push({
    code: "ALL_FEATURES_HAVE_OUTCOMES",
    passed: featuresWithoutOutcomes.length === 0,
    reason:
      featuresWithoutOutcomes.length > 0
        ? `Features without outcomes: ${featuresWithoutOutcomes.map((f) => f.feature_id).join(", ")}`
        : undefined,
  });

  // ALL_WORKFLOWS_REFERENCE_VALID_FEATURES
  const invalidWorkflowRefs = spec.workflows.flatMap((w) =>
    w.steps.filter((s) => !featureIds.has(s.feature_id))
  );
  results.push({
    code: "ALL_WORKFLOWS_REFERENCE_VALID_FEATURES",
    passed: invalidWorkflowRefs.length === 0,
    reason:
      invalidWorkflowRefs.length > 0
        ? `Workflow steps reference invalid features: ${invalidWorkflowRefs.map((s) => s.feature_id).join(", ")}`
        : undefined,
  });

  // ALL_PERMISSIONS_REFERENCE_VALID_ROLES
  const invalidPermRoles = spec.permissions.filter(
    (p) => !roleIds.has(p.role_id)
  );
  results.push({
    code: "ALL_PERMISSIONS_REFERENCE_VALID_ROLES",
    passed: invalidPermRoles.length === 0,
    reason:
      invalidPermRoles.length > 0
        ? `Permissions reference invalid roles: ${invalidPermRoles.map((p) => p.role_id).join(", ")}`
        : undefined,
  });

  // ALL_PERMISSION_RESOURCES_DEFINED
  const permResources = spec.permissions.map((p) => p.resource);
  const validResources = new Set([
    ...featureIds,
    ...entityIds,
    ...spec.features.map((f) => f.name),
    ...spec.domain_entities.map((e) => e.name),
  ]);
  const undefinedResources = permResources.filter(
    (r) => !validResources.has(r)
  );
  results.push({
    code: "ALL_PERMISSION_RESOURCES_DEFINED",
    passed: undefinedResources.length === 0,
    reason:
      undefinedResources.length > 0
        ? `Undefined permission resources: ${undefinedResources.join(", ")}`
        : undefined,
  });

  // NO_UNDEFINED_FEATURE_DEPENDENCIES
  const undefinedDeps = spec.dependency_graph.filter(
    (d) => !featureIds.has(d.from_feature_id) || !featureIds.has(d.to_feature_id)
  );
  results.push({
    code: "NO_UNDEFINED_FEATURE_DEPENDENCIES",
    passed: undefinedDeps.length === 0,
    reason:
      undefinedDeps.length > 0
        ? `Dependency graph references undefined features: ${undefinedDeps.map((d) => `${d.from_feature_id}->${d.to_feature_id}`).join(", ")}`
        : undefined,
  });

  // ALL_CRITICAL_FEATURES_HAVE_ACCEPTANCE_TESTS
  const criticalFeatureIds = spec.features
    .filter((f) => f.priority === "critical" || f.priority === "high")
    .map((f) => f.feature_id);
  const testedFeatureIds = new Set(
    spec.acceptance_tests.map((t) => t.feature_id)
  );
  const untestedCritical = criticalFeatureIds.filter(
    (id) => !testedFeatureIds.has(id)
  );
  results.push({
    code: "ALL_CRITICAL_FEATURES_HAVE_ACCEPTANCE_TESTS",
    passed: untestedCritical.length === 0,
    reason:
      untestedCritical.length > 0
        ? `Critical/high features without acceptance tests: ${untestedCritical.join(", ")}`
        : undefined,
  });

  // ALL_EXTERNAL_INTEGRATIONS_DECLARE_FALLBACK_STATUS
  const integrationsWithoutFallback = spec.integrations.filter(
    (i) => !i.fallback_defined
  );
  results.push({
    code: "ALL_EXTERNAL_INTEGRATIONS_DECLARE_FALLBACK_STATUS",
    passed: integrationsWithoutFallback.length === 0,
    reason:
      integrationsWithoutFallback.length > 0
        ? `Integrations without fallback declaration: ${integrationsWithoutFallback.map((i) => i.name).join(", ")}`
        : undefined,
  });

  // ALL_AUDIT_REQUIRED_FEATURES_HAVE_COMPLIANCE_OR_AUDIT_REQUIREMENTS
  const auditFeatures = spec.features.filter((f) => f.audit_required);
  const complianceCoveredFeatures = new Set(
    spec.compliance_requirements.flatMap((c) => c.applies_to_feature_ids)
  );
  const auditFeaturesWithoutCompliance = auditFeatures.filter(
    (f) => !complianceCoveredFeatures.has(f.feature_id)
  );
  results.push({
    code: "ALL_AUDIT_REQUIRED_FEATURES_HAVE_COMPLIANCE_OR_AUDIT_REQUIREMENTS",
    passed: auditFeaturesWithoutCompliance.length === 0,
    reason:
      auditFeaturesWithoutCompliance.length > 0
        ? `Audit-required features without compliance requirements: ${auditFeaturesWithoutCompliance.map((f) => f.feature_id).join(", ")}`
        : undefined,
  });

  // ALL_OFFLINE_REQUIRED_FEATURES_HAVE_OFFLINE_REQUIREMENTS
  const offlineFeatures = spec.features.filter(
    (f) => f.offline_behavior_required
  );
  const nfrOffline = spec.non_functional_requirements.some(
    (n) => n.category === "offline_behavior"
  );
  results.push({
    code: "ALL_OFFLINE_REQUIRED_FEATURES_HAVE_OFFLINE_REQUIREMENTS",
    passed: offlineFeatures.length === 0 || nfrOffline,
    reason:
      offlineFeatures.length > 0 && !nfrOffline
        ? `Features require offline behavior but no offline NFR defined: ${offlineFeatures.map((f) => f.feature_id).join(", ")}`
        : undefined,
  });

  return results;
}

// ─── Gate 2 — Bridge Compile Checks ───────────────────────────────────

export const GATE_2_RULES = [
  "BRIDGE_HAS_SINGLE_FEATURE_TARGET",
  "BUILD_SCOPE_IS_EXPLICIT",
  "WRITE_SCOPE_IS_BOUNDED",
  "NO_FORBIDDEN_PATHS_IN_WRITE_SCOPE",
  "ALL_REQUIRED_DEPENDENCIES_RESOLVED_OR_MARKED_BLOCKED",
  "ALL_CRITICAL_RULES_ATTACHED",
  "ALL_REQUIRED_TESTS_ATTACHED",
  "ALL_SELECTED_REUSE_ASSETS_EXIST",
  "NO_TRIGGERED_HARD_VETOES",
  "SUCCESS_DEFINITION_PRESENT",
] as const;

export type Gate2RuleCode = (typeof GATE_2_RULES)[number];

export function validateBridge(bridge: FeatureBridge): GateRuleResult[] {
  const results: GateRuleResult[] = [];

  // BRIDGE_HAS_SINGLE_FEATURE_TARGET
  results.push({
    code: "BRIDGE_HAS_SINGLE_FEATURE_TARGET",
    passed: !!bridge.feature_id && bridge.feature_id.length > 0,
    reason: !bridge.feature_id ? "Bridge has no feature target" : undefined,
  });

  // BUILD_SCOPE_IS_EXPLICIT
  results.push({
    code: "BUILD_SCOPE_IS_EXPLICIT",
    passed:
      !!bridge.build_scope.objective &&
      bridge.build_scope.included_capabilities.length > 0 &&
      !!bridge.build_scope.acceptance_boundary,
    reason:
      !bridge.build_scope.objective
        ? "Build scope objective is empty"
        : bridge.build_scope.included_capabilities.length === 0
          ? "No included capabilities defined"
          : !bridge.build_scope.acceptance_boundary
            ? "No acceptance boundary defined"
            : undefined,
  });

  // WRITE_SCOPE_IS_BOUNDED
  results.push({
    code: "WRITE_SCOPE_IS_BOUNDED",
    passed:
      !!bridge.write_scope.target_repo &&
      bridge.write_scope.allowed_repo_paths.length > 0,
    reason:
      !bridge.write_scope.target_repo
        ? "No target repo specified"
        : bridge.write_scope.allowed_repo_paths.length === 0
          ? "No allowed write paths specified"
          : undefined,
  });

  // NO_FORBIDDEN_PATHS_IN_WRITE_SCOPE
  const forbiddenOverlap = bridge.write_scope.allowed_repo_paths.filter(
    (allowed) =>
      bridge.write_scope.forbidden_repo_paths.some((forbidden) =>
        allowed.startsWith(forbidden)
      )
  );
  results.push({
    code: "NO_FORBIDDEN_PATHS_IN_WRITE_SCOPE",
    passed: forbiddenOverlap.length === 0,
    reason:
      forbiddenOverlap.length > 0
        ? `Allowed paths overlap with forbidden paths: ${forbiddenOverlap.join(", ")}`
        : undefined,
  });

  // ALL_REQUIRED_DEPENDENCIES_RESOLVED_OR_MARKED_BLOCKED
  const unresolvedDeps = bridge.dependencies.filter(
    (d) => d.status === "required"
  );
  results.push({
    code: "ALL_REQUIRED_DEPENDENCIES_RESOLVED_OR_MARKED_BLOCKED",
    passed: unresolvedDeps.length === 0,
    reason:
      unresolvedDeps.length > 0
        ? `Unresolved dependencies: ${unresolvedDeps.map((d) => d.feature_id).join(", ")}`
        : undefined,
  });

  // ALL_CRITICAL_RULES_ATTACHED
  const criticalRules = bridge.applied_rules.filter(
    (r) => r.severity === "critical" || r.severity === "error"
  );
  results.push({
    code: "ALL_CRITICAL_RULES_ATTACHED",
    passed: criticalRules.length > 0 || bridge.applied_rules.length > 0,
    reason:
      bridge.applied_rules.length === 0
        ? "No rules attached to bridge"
        : undefined,
  });

  // ALL_REQUIRED_TESTS_ATTACHED
  results.push({
    code: "ALL_REQUIRED_TESTS_ATTACHED",
    passed: bridge.required_tests.length > 0,
    reason:
      bridge.required_tests.length === 0
        ? "No required tests attached"
        : undefined,
  });

  // ALL_SELECTED_REUSE_ASSETS_EXIST
  const selectedIds = new Set(bridge.selected_reuse_assets);
  const candidateIds = new Set(
    bridge.reuse_candidates.map((c) => c.candidate_id)
  );
  const missingAssets = [...selectedIds].filter((id) => !candidateIds.has(id));
  results.push({
    code: "ALL_SELECTED_REUSE_ASSETS_EXIST",
    passed: missingAssets.length === 0,
    reason:
      missingAssets.length > 0
        ? `Selected assets not found in candidates: ${missingAssets.join(", ")}`
        : undefined,
  });

  // NO_TRIGGERED_HARD_VETOES
  const triggeredVetoes = bridge.hard_vetoes.filter((v) => v.triggered);
  results.push({
    code: "NO_TRIGGERED_HARD_VETOES",
    passed: triggeredVetoes.length === 0,
    reason:
      triggeredVetoes.length > 0
        ? `Triggered vetoes: ${triggeredVetoes.map((v) => v.code).join(", ")}`
        : undefined,
  });

  // SUCCESS_DEFINITION_PRESENT
  results.push({
    code: "SUCCESS_DEFINITION_PRESENT",
    passed:
      !!bridge.success_definition.user_visible_outcome &&
      !!bridge.success_definition.technical_outcome,
    reason:
      !bridge.success_definition.user_visible_outcome
        ? "No user-visible outcome defined"
        : !bridge.success_definition.technical_outcome
          ? "No technical outcome defined"
          : undefined,
  });

  return results;
}

// ─── Helpers ──────────────────────────────────────────────────────────

export function allRulesPassed(results: GateRuleResult[]): boolean {
  return results.every((r) => r.passed);
}

export function getFailedRules(results: GateRuleResult[]): GateRuleResult[] {
  return results.filter((r) => !r.passed);
}
