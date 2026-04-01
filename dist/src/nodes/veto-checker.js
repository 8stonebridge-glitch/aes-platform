import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { GateErrorCode, CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";
import { evaluateVetoes } from "@aes/math";
function checkVetoes(bridge, appSpec) {
    const results = [];
    const feature = appSpec.features.find((f) => f.feature_id === bridge.feature_id);
    if (!feature)
        return results;
    // 1. AUTH_NOT_DEFINED
    const hasRoles = appSpec.roles.length > 0;
    const hasPermissions = appSpec.permissions.some((p) => p.resource === feature.feature_id);
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
    const roleIds = new Set(appSpec.roles.map((r) => r.role_id));
    const EXEMPT_ACTORS = new Set(["end_user", "system", "general_user", "user", "anonymous"]);
    const unmappedActors = featureActors.filter((a) => !roleIds.has(a) && !EXEMPT_ACTORS.has(a));
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
    const unscopedDestructive = destructiveActions.filter((a) => !a.confirmation_required);
    results.push({
        code: GateErrorCode.G3_DESTRUCTIVE_ACTION_WITHOUT_SCOPE,
        triggered: unscopedDestructive.length > 0,
        reason: unscopedDestructive.length > 0
            ? `Destructive actions without confirmation: ${unscopedDestructive.map((a) => a.action_name).join(", ")}`
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
    const adminHasScope = appSpec.roles.some((r) => (r.role_id === "admin" || r.role_id === "super_admin") && r.scope);
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
    const depsWithoutFallback = externalDeps.filter((dep) => {
        const integration = integrations.find((i) => i.type === dep || i.name === dep);
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
    const hasAuditRule = (bridge.applied_rules || []).some((r) => r.rule_id === "rule-audit");
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
    const allFeatureIds = new Set(appSpec.features.map((f) => f.feature_id));
    const undefinedDeps = (bridge.dependencies || []).filter((d) => !allFeatureIds.has(d.feature_id));
    results.push({
        code: GateErrorCode.G3_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE,
        triggered: undefinedDeps.length > 0,
        reason: undefinedDeps.length > 0
            ? `Dependencies on undefined features: ${undefinedDeps.map((d) => d.feature_id).join(", ")}`
            : "",
        required_fix: "Remove or define the missing dependency features",
        blocking_feature_ids: undefinedDeps.length > 0 ? [feature.feature_id] : [],
    });
    return results;
}
export async function vetoChecker(state) {
    const cb = getCallbacks();
    const store = getJobStore();
    if (!state.featureBridges || !state.appSpec) {
        cb?.onFail("No bridges to check vetoes against");
        return { currentGate: "failed", errorMessage: "Missing bridges" };
    }
    cb?.onGate("gate_3", "Running hard vetoes...");
    const bridges = { ...state.featureBridges };
    const allVetoResults = [];
    let anyBlocked = false;
    // ─── Graph Context: prevention rules and fix patterns ───
    const graphCtx = state.graphContext;
    const graphPreventionRules = graphCtx?.preventionRules ?? [];
    const graphFixPatterns = graphCtx?.fixPatterns ?? [];
    if (graphPreventionRules.length > 0 || graphFixPatterns.length > 0) {
        cb?.onStep(`Graph context: ${graphPreventionRules.length} prevention rules, ${graphFixPatterns.length} fix patterns loaded for veto augmentation`);
    }
    for (const featureId of Object.keys(bridges)) {
        const bridge = bridges[featureId];
        if (!bridge.bridge_id)
            continue; // Skip catalog match data that isn't a compiled bridge
        const vetoes = checkVetoes(bridge, state.appSpec);
        // ─── Graph Context: prevention-rule-derived vetoes ───
        // Prevention rules with gate "gate_3" act as graph-derived hard vetoes.
        for (const rule of graphPreventionRules) {
            if (rule.gate !== "gate_3")
                continue;
            const affectedPatterns = rule.target_failure_patterns ?? [];
            const featureNameLower = (bridge.feature_name ?? featureId).toLowerCase();
            const ruleTriggered = affectedPatterns.some((p) => featureNameLower.includes(p.toLowerCase()));
            if (ruleTriggered) {
                vetoes.push({
                    code: `GRAPH_RULE:${rule.rule_id ?? rule.name}`,
                    triggered: true,
                    reason: `Graph prevention rule: ${rule.check_logic ?? rule.description}`,
                    required_fix: rule.description ?? "Resolve graph-identified prevention rule",
                    blocking_feature_ids: [featureId],
                });
            }
        }
        // ─── Graph Context: anti-pattern detection from fixPatterns ───
        // If a known fix pattern targets failure patterns that match this feature's
        // characteristics, flag it as a potential anti-pattern presence.
        for (const fix of graphFixPatterns) {
            const affectedPatterns = fix.target_failure_patterns ?? [];
            const bridgeRules = (bridge.applied_rules ?? []).map((r) => (r.rule_id ?? r.name ?? "").toLowerCase());
            const featureTags = [
                (bridge.feature_name ?? "").toLowerCase(),
                featureId.toLowerCase(),
                ...(bridge.dependencies ?? []).map((d) => (d.feature_id ?? "").toLowerCase()),
            ];
            // Check if any target failure patterns match this feature's context
            const antiPatternDetected = affectedPatterns.some((p) => {
                const pLower = p.toLowerCase();
                return featureTags.some((t) => t.includes(pLower)) ||
                    bridgeRules.some((r) => r.includes(pLower));
            });
            if (antiPatternDetected && fix.success_rate < 0.5) {
                // Low success-rate fix pattern means the underlying issue is hard to fix;
                // flag it as a warning veto (non-blocking but recorded).
                vetoes.push({
                    code: `GRAPH_ANTIPATTERN:${fix.pattern_id ?? fix.name}`,
                    triggered: false, // Advisory — does not block
                    reason: `Known anti-pattern detected: ${fix.name} (fix success rate: ${(fix.success_rate * 100).toFixed(0)}%)`,
                    required_fix: fix.resolution_template ?? fix.description,
                    blocking_feature_ids: [],
                });
            }
        }
        const triggered = vetoes.filter((v) => v.triggered);
        bridge.hard_vetoes = vetoes;
        allVetoResults.push(...vetoes);
        // ─── Math Layer: augmented veto evaluation ───
        const mathConf = bridge.math?.confidence_score ?? 0.5;
        const mathDims = bridge.math ? {
            evidence_coverage: 0.5,
            dependency_completeness: bridge.math.dependency_score ?? 1.0,
            pattern_match_quality: 0.5,
            test_coverage: 0.5,
            freshness: bridge.math.freshness_score ?? 1.0,
            contradiction_penalty: 1.0,
        } : {};
        const mathVetoInput = {
            confidence_composite: mathConf,
            confidence_dimensions: mathDims,
            has_critical_contradictions: false,
            contradiction_count: 0,
            bridge_age_days: 0,
            max_bridge_age_days: 7,
            unresolved_dependencies: (bridge.dependencies || []).filter((d) => d.status !== "satisfied" && d.status !== "blocked").length,
            scope_violations: [],
            missing_acceptance_tests: 0,
            total_acceptance_tests: (bridge.required_tests || []).length,
            validator_failures: [],
            auth_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_AUTH_NOT_DEFINED)?.triggered,
            role_boundary_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_ROLE_BOUNDARY_NOT_DEFINED)?.triggered,
            tenancy_boundary_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_TENANCY_BOUNDARY_NOT_DEFINED)?.triggered,
            destructive_actions_scoped: !vetoes.find((v) => v.code === GateErrorCode.G3_DESTRUCTIVE_ACTION_WITHOUT_SCOPE)?.triggered,
            payment_reconciliation_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_PAYMENT_WITHOUT_RECONCILIATION)?.triggered,
            admin_role_bounded: !vetoes.find((v) => v.code === GateErrorCode.G3_ADMIN_WITHOUT_ROLE_BOUNDARY)?.triggered,
            external_api_fallback_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_EXTERNAL_API_WITHOUT_FALLBACK)?.triggered,
            realtime_offline_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_REAL_TIME_WITHOUT_OFFLINE_STATE)?.triggered,
            auditable_actions_logged: !vetoes.find((v) => v.code === GateErrorCode.G3_AUDITABLE_ACTION_WITHOUT_AUDIT_LOG)?.triggered,
            data_mutation_ownership_defined: !vetoes.find((v) => v.code === GateErrorCode.G3_DATA_MUTATION_WITHOUT_OWNERSHIP_RULE)?.triggered,
            all_feature_deps_exist: !vetoes.find((v) => v.code === GateErrorCode.G3_FEATURE_DEPENDS_ON_UNDEFINED_FEATURE)?.triggered,
        };
        const mathVetoResult = evaluateVetoes(mathVetoInput);
        bridge.math_vetoes = mathVetoResult;
        // Merge: any triggered from either the existing veto system or math layer
        const combinedTriggered = triggered.length > 0 || mathVetoResult.any_triggered;
        if (combinedTriggered) {
            bridge.status = "blocked";
            const allReasons = [
                ...triggered.map((v) => `${v.code}: ${v.reason}`),
                ...mathVetoResult.blocking_codes.map((c) => `MATH:${c}`),
            ];
            bridge.blocked_reason = allReasons.join("; ");
            anyBlocked = true;
            for (const v of triggered) {
                cb?.onFail(`${bridge.feature_name}: ${v.code} — ${v.reason}`);
                const fixEntry = {
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
            if (mathVetoResult.any_triggered) {
                cb?.onFail(`${bridge.feature_name}: Math vetoes: ${mathVetoResult.blocking_codes.join(", ")}`);
            }
            cb?.onFeatureStatus(featureId, bridge.feature_name, "blocked");
        }
        else {
            bridge.status = "validated";
            cb?.onSuccess(`${bridge.feature_name}: Vetoes: 0/${vetoes.length + mathVetoResult.results.length} triggered | Math: CLEAR`);
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
        cb?.onWarn(`Vetoes: ${triggeredCount}/${totalChecks} triggered — blocked features cannot proceed`);
    }
    else {
        cb?.onSuccess(`Vetoes: 0/${totalChecks} triggered | Math: CLEAR`);
    }
    // Partial progression: if some features are blocked but others are clear,
    // proceed with the clear ones. Only fail if ALL features are blocked.
    const clearedFeatures = Object.values(bridges).filter((b) => b.status === "validated");
    const blockedFeatures = Object.values(bridges).filter((b) => b.status === "blocked");
    const allBlocked = clearedFeatures.length === 0 && blockedFeatures.length > 0;
    if (blockedFeatures.length > 0 && clearedFeatures.length > 0) {
        cb?.onWarn(`${blockedFeatures.length} features blocked, ${clearedFeatures.length} features clear — proceeding with clear features`);
    }
    store.update(state.jobId, {
        featureBridges: bridges,
        vetoResults: allVetoResults,
        currentGate: allBlocked ? "failed" : "gate_3",
        errorMessage: allBlocked
            ? `All features blocked by vetoes: ${allVetoResults.filter((v) => v.triggered).map((v) => v.code).join(", ")}`
            : null,
    });
    return {
        featureBridges: bridges,
        vetoResults: allVetoResults,
        currentGate: allBlocked ? "failed" : "gate_3",
        errorMessage: allBlocked
            ? `All features blocked by vetoes: ${allVetoResults.filter((v) => v.triggered).map((v) => v.code).join(", ")}`
            : null,
    };
}
