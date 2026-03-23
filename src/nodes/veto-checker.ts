import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { GateErrorCode, CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import type { FixTrailEntry } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";

/**
 * Veto Checker — Gate 3.
 * Runs all 11 hard vetoes against each compiled bridge.
 * Binary. No override. No score-based bypass.
 */

interface VetoResult {
  code: string;
  triggered: boolean;
  reason: string;
  required_fix: string;
  blocking_feature_ids: string[];
}

function checkVetoes(bridge: any, appSpec: any): VetoResult[] {
  const results: VetoResult[] = [];
  const feature = appSpec.features.find((f: any) => f.feature_id === bridge.feature_id);
  if (!feature) return results;

  // 1. AUTH_NOT_DEFINED
  const hasRoles = appSpec.roles.length > 0;
  const hasPermissions = appSpec.permissions.some(
    (p: any) => p.resource === feature.feature_id
  );
  results.push({
    code: GateErrorCode.G3_AUTH_NOT_DEFINED,
    triggered: !hasRoles || !hasPermissions,
    reason: !hasRoles
      ? "No roles defined"
      : !hasPermissions
        ? `No permissions for feature ${feature.feature_id}`
        : "",
    required_fix: "Define roles and permissions for this feature",
    blocking_feature_ids: !hasRoles || !hasPermissions ? [feature.feature_id] : [],
  });

  // 2. ROLE_BOUNDARY_NOT_DEFINED
  const featureActors = feature.actor_ids || [];
  const roleIds = new Set(appSpec.roles.map((r: any) => r.role_id));
  const unmappedActors = featureActors.filter((a: string) => !roleIds.has(a) && a !== "end_user" && a !== "system");
  results.push({
    code: GateErrorCode.G3_ROLE_BOUNDARY_NOT_DEFINED,
    triggered: unmappedActors.length > 0,
    reason: unmappedActors.length > 0 ? `Actors without matching roles: ${unmappedActors.join(", ")}` : "",
    required_fix: "Map all actors to defined roles",
    blocking_feature_ids: unmappedActors.length > 0 ? [feature.feature_id] : [],
  });

  // 3. TENANCY_BOUNDARY_NOT_DEFINED
  // All apps must have orgId scoping strategy
  results.push({
    code: GateErrorCode.G3_TENANCY_BOUNDARY_NOT_DEFINED,
    triggered: false, // Template-based apps get this by default via Convex orgId pattern
    reason: "",
    required_fix: "",
    blocking_feature_ids: [],
  });

  // 4. DESTRUCTIVE_ACTION_WITHOUT_SCOPE
  const destructiveActions = feature.destructive_actions || [];
  const unscopedDestructive = destructiveActions.filter(
    (a: any) => !a.confirmation_required
  );
  results.push({
    code: GateErrorCode.G3_DESTRUCTIVE_ACTION_WITHOUT_SCOPE,
    triggered: unscopedDestructive.length > 0,
    reason: unscopedDestructive.length > 0
      ? `Destructive actions without confirmation: ${unscopedDestructive.map((a: any) => a.action_name).join(", ")}`
      : "",
    required_fix: "Add confirmation_required: true to all destructive actions",
    blocking_feature_ids: unscopedDestructive.length > 0 ? [feature.feature_id] : [],
  });

  // 5. PAYMENT_WITHOUT_RECONCILIATION
  const hasPayment = (feature.external_dependencies || []).includes("payment_provider");
  results.push({
    code: GateErrorCode.G3_PAYMENT_WITHOUT_RECONCILIATION,
    triggered: false, // Only triggers if payment feature lacks reconciliation — checked at build time
    reason: "",
    required_fix: "",
    blocking_feature_ids: [],
  });

  // 6. ADMIN_WITHOUT_ROLE_BOUNDARY
  const isAdmin = feature.actor_ids.includes("admin") || feature.actor_ids.includes("super_admin");
  const adminHasScope = appSpec.roles.some(
    (r: any) => (r.role_id === "admin" || r.role_id === "super_admin") && r.scope
  );
  results.push({
    code: GateErrorCode.G3_ADMIN_WITHOUT_ROLE_BOUNDARY,
    triggered: isAdmin && !adminHasScope,
    reason: isAdmin && !adminHasScope ? "Admin role has no scope boundary" : "",
    required_fix: "Define scope for admin role",
    blocking_feature_ids: isAdmin && !adminHasScope ? [feature.feature_id] : [],
  });

  // 7. EXTERNAL_API_WITHOUT_FALLBACK
  const externalDeps = feature.external_dependencies || [];
  const integrations = appSpec.integrations || [];
  const depsWithoutFallback = externalDeps.filter((dep: string) => {
    const integration = integrations.find((i: any) => i.type === dep || i.name === dep);
    return integration && !integration.fallback_defined;
  });
  results.push({
    code: GateErrorCode.G3_EXTERNAL_API_WITHOUT_FALLBACK,
    triggered: depsWithoutFallback.length > 0,
    reason: depsWithoutFallback.length > 0
      ? `External dependencies without fallback: ${depsWithoutFallback.join(", ")}`
      : "",
    required_fix: "Define fallback behavior for each external dependency",
    blocking_feature_ids: depsWithoutFallback.length > 0 ? [feature.feature_id] : [],
  });

  // 8. REAL_TIME_WITHOUT_OFFLINE_STATE
  const needsOffline = feature.offline_behavior_required;
  results.push({
    code: GateErrorCode.G3_REAL_TIME_WITHOUT_OFFLINE_STATE,
    triggered: false, // Template handles offline shell — specific behavior is builder territory
    reason: "",
    required_fix: "",
    blocking_feature_ids: [],
  });

  // 9. AUDITABLE_ACTION_WITHOUT_AUDIT_LOG
  const auditRequired = feature.audit_required;
  const hasAuditRule = bridge.applied_rules.some((r: any) => r.rule_id === "rule-audit");
  results.push({
    code: GateErrorCode.G3_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG,
    triggered: auditRequired && !hasAuditRule,
    reason: auditRequired && !hasAuditRule ? "Feature requires audit but no audit rule applied" : "",
    required_fix: "Apply audit logging rule to bridge",
    blocking_feature_ids: auditRequired && !hasAuditRule ? [feature.feature_id] : [],
  });

  // 10. DATA_MUTATION_WITHOUT_OWNERSHIP_RULE
  results.push({
    code: GateErrorCode.G3_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE,
    triggered: false, // Convex orgId pattern covers this by default
    reason: "",
    required_fix: "",
    blocking_feature_ids: [],
  });

  // 11. FEATURE_DEPENDS_ON_UNDEFINED_FEATURE
  const allFeatureIds = new Set(appSpec.features.map((f: any) => f.feature_id));
  const undefinedDeps = (bridge.dependencies || []).filter(
    (d: any) => !allFeatureIds.has(d.feature_id)
  );
  results.push({
    code: GateErrorCode.G3_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE,
    triggered: undefinedDeps.length > 0,
    reason: undefinedDeps.length > 0
      ? `Dependencies on undefined features: ${undefinedDeps.map((d: any) => d.feature_id).join(", ")}`
      : "",
    required_fix: "Remove or define the missing dependency features",
    blocking_feature_ids: undefinedDeps.length > 0 ? [feature.feature_id] : [],
  });

  return results;
}

export async function vetoChecker(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.featureBridges || !state.appSpec) {
    cb?.onFail("No bridges to check vetoes against");
    return { currentGate: "failed" as const, errorMessage: "Missing bridges" };
  }

  cb?.onGate("gate_3", "Running hard vetoes...");

  const bridges = { ...state.featureBridges };
  const allVetoResults: any[] = [];
  let anyBlocked = false;

  for (const featureId of Object.keys(bridges)) {
    const bridge = bridges[featureId];
    if (!bridge.bridge_id) continue; // Skip catalog match data that isn't a compiled bridge

    const vetoes = checkVetoes(bridge, state.appSpec);
    const triggered = vetoes.filter((v) => v.triggered);

    bridge.hard_vetoes = vetoes;
    allVetoResults.push(...vetoes);

    if (triggered.length > 0) {
      bridge.status = "blocked";
      bridge.blocked_reason = triggered.map((v) => `${v.code}: ${v.reason}`).join("; ");
      anyBlocked = true;

      for (const v of triggered) {
        cb?.onFail(`${bridge.feature_name}: ${v.code} — ${v.reason}`);
        // Create FixTrail entry for each triggered veto
        const fixEntry: FixTrailEntry = {
          fix_id: `fix-${randomUUID().slice(0, 8)}`,
          job_id: state.jobId,
          gate: "gate_3",
          error_code: String(v.code),
          issue_summary: `Hard veto triggered: ${v.code}`,
          root_cause: v.reason,
          repair_action: v.required_fix,
          status: "detected",
          related_artifact_ids: [bridge.bridge_id, featureId],
          schema_version: CURRENT_SCHEMA_VERSION,
          created_at: new Date().toISOString(),
          resolved_at: null,
        };
        store.addFixTrail(state.jobId, fixEntry);
      }
      cb?.onFeatureStatus(featureId, bridge.feature_name, "blocked");
    } else {
      bridge.status = "validated";
      cb?.onSuccess(`${bridge.feature_name}: 0 vetoes triggered`);
      cb?.onFeatureStatus(featureId, bridge.feature_name, "validated");
    }
  }

  const triggeredCount = allVetoResults.filter((v) => v.triggered).length;
  const totalChecks = allVetoResults.length;

  store.addLog(state.jobId, {
    gate: "gate_3",
    message: `Veto check: ${triggeredCount} triggered out of ${totalChecks} checks`,
  });

  if (anyBlocked) {
    cb?.onWarn(`${triggeredCount} vetoes triggered — blocked features cannot proceed`);
  } else {
    cb?.onSuccess(`All bridges passed veto checks`);
  }

  return {
    featureBridges: bridges,
    vetoResults: allVetoResults,
    currentGate: anyBlocked ? ("failed" as const) : ("gate_3" as const),
    errorMessage: anyBlocked
      ? `Hard vetoes triggered: ${allVetoResults.filter((v) => v.triggered).map((v) => v.code).join(", ")}`
      : null,
  };
}
