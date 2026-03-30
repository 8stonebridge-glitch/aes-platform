/**
 * Builder Dispatcher — orchestrates a complete application build.
 *
 * ALL P0-P7 optimizations are wired and active:
 *   P0: Feature classification (build class → timeouts, concurrency, file limits)
 *   P1: Two-pass build (plan → validate scope → execute only if plan passes)
 *   P2: Slim bridge contracts (reduced prompt tokens passed to builder context)
 *   P3: Shared context precompute (cached route/schema/component maps)
 *   P4: Feature-class timeouts (per-class timeout enforcement)
 *   P5: Parallel execution (semaphore-based concurrency by dependency level)
 *   P6: Preflight gates (fast checks before each build)
 *   P7: Layered validation (L1 scope → L2 tests → L3 integration)
 *
 * Primary path: AppBuilder (single workspace, atomic commit).
 * Fallback: parallel per-feature builds with full optimization pipeline.
 */
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { AppBuilder } from "../builder/app-builder.js";
import { compileBuilderPackage } from "../builder-artifact.js";
import { CodeBuilder } from "../builder/code-builder.js";
import { verifyBuild } from "../builder/build-verifier.js";
// P0-P7 optimization modules
import { classifyAllFeatures } from "../builder/feature-classifier.js";
import { validateChangePlan } from "../builder/two-pass-builder.js";
import { compileSlimContract, measureContractReduction } from "../builder/slim-contract.js";
import { precomputeContext, updateContextAfterBuild } from "../builder/context-precompute.js";
import { withTimeout } from "../builder/timeout-runner.js";
import { executeParallel } from "../builder/parallel-executor.js";
import { runPreflightAll } from "../builder/preflight.js";
import { validateLayer1, runValidationPipeline } from "../builder/layered-validator.js";
// Worktree isolation
import { createWorktreePool, createWorktree, mergeWorktree, cleanupWorktree, getIntegrationResult, } from "../builder/worktree-isolation.js";
export async function builderDispatcher(state) {
    const cb = getCallbacks();
    const store = getJobStore();
    cb?.onGate("building", "Building complete application...");
    const buildResults = { ...(state.buildResults || {}) };
    const fixTrailEntries = [...(state.fixTrailEntries || [])];
    const featureBuildOrder = state.featureBuildOrder || [];
    if (featureBuildOrder.length === 0) {
        cb?.onWarn("No features in build order — skipping build phase");
        return { currentGate: "building", buildResults, fixTrailEntries };
    }
    // ── P0: Classify all features ──
    const appSpec = state.appSpec;
    const features = appSpec?.features || [];
    const classConfigs = classifyAllFeatures(features);
    const classSummary = Array.from(classConfigs.entries())
        .map(([id, cfg]) => `${id}→${cfg.build_class}`)
        .join(", ");
    store.addLog(state.jobId, {
        gate: "building",
        message: `[P0] Feature classification: ${classSummary}`,
    });
    cb?.onStep(`[P0] Classified ${classConfigs.size} features: ${classSummary}`);
    // ── P6: Preflight all features ──
    const completedFeatures = new Set();
    const preflightResults = runPreflightAll(featureBuildOrder, state.featureBridges || {}, classConfigs, completedFeatures);
    if (preflightResults.blocked.length > 0) {
        cb?.onWarn(`[P6] Preflight blocked ${preflightResults.blocked.length} features: ${preflightResults.blocked.join(", ")}`);
        for (const r of preflightResults.results.filter(r => !r.passed)) {
            store.addLog(state.jobId, {
                gate: "building",
                message: `[P6] Preflight BLOCKED ${r.feature_id}: ${r.block_reason}`,
            });
        }
    }
    cb?.onStep(`[P6] Preflight: ${preflightResults.ready.length} ready, ${preflightResults.blocked.length} blocked`);
    store.addLog(state.jobId, {
        gate: "building",
        message: `Building ${featureBuildOrder.length} features (${preflightResults.ready.length} passed preflight)`,
    });
    // ── Primary path: AppBuilder ──
    const appBuilder = new AppBuilder();
    try {
        const result = await appBuilder.buildApp(state.jobId, state.appSpec, state.featureBridges, state.featureBuildOrder, cb, state.targetPath, state.reusableSourceFiles);
        result.run.workspace_path = result.workspace.path;
        buildResults["__app__"] = result.run;
        for (const [featureId, featureRun] of Object.entries(result.featureResults)) {
            buildResults[featureId] = featureRun;
        }
        store.update(state.jobId, {
            builderRuns: [result.run, ...Object.values(result.featureResults)],
            buildResults,
        });
        // ── P7: Run layered validation on AppBuilder results ──
        const pipeline = runValidationPipeline(buildResults, state.featureBridges || {}, classConfigs);
        buildResults["__validation_pipeline__"] = {
            summary: pipeline.summary,
            l1_details: Object.fromEntries(pipeline.l1Results),
            l2_details: Object.fromEntries(pipeline.l2Results),
            l3_details: pipeline.l3Result,
        };
        cb?.onStep(`[P7] Validation: L1 ${pipeline.summary.l1_passed}/${pipeline.summary.total_features}, L2 ${pipeline.summary.l2_passed}/${pipeline.summary.total_features}, L3 ${pipeline.summary.l3_passed ? "pass" : "fail"}`);
        const successCount = Object.values(result.featureResults).filter((r) => r.status === "build_succeeded").length;
        const failCount = Object.values(result.featureResults).filter((r) => r.status === "build_failed").length;
        const total = featureBuildOrder.length;
        const summary = `Application built: ${successCount}/${total} features succeeded${failCount > 0 ? `, ${failCount} failed` : ""}`;
        store.addLog(state.jobId, { gate: "building", message: summary });
        if (successCount === 0 && failCount > 0) {
            cb?.onFail(`All ${failCount} feature builds failed`);
            return {
                currentGate: "failed",
                buildResults,
                fixTrailEntries,
                errorMessage: `All ${failCount} feature builds failed`,
            };
        }
        cb?.onSuccess(summary);
        return { currentGate: "building", buildResults, fixTrailEntries };
    }
    catch (err) {
        cb?.onFail(`Application build failed: ${err.message}`);
        store.addLog(state.jobId, {
            gate: "building",
            message: `Application build FAILED: ${err.message}`,
        });
        cb?.onWarn("Falling back to parallel per-feature builds (P5)...");
        return await parallelPerFeatureFallback(state, buildResults, fixTrailEntries, classConfigs, preflightResults.ready);
    }
}
/**
 * Build one feature with all per-feature optimizations:
 *   P1: Generate plan → validate scope → reject if over budget
 *   P2: Compile slim contract and inject into builder context
 *   P3: Attach precomputed shared context
 *   P4: Timeout enforcement per build class
 *   P7: L1 validation immediately after build
 */
async function buildSingleFeature(state, featureId, index, total, classConfig, sharedContext, existingBuildResults) {
    const cb = getCallbacks();
    const store = getJobStore();
    const codeBuilder = new CodeBuilder();
    const appSpec = state.appSpec;
    const features = appSpec?.features || [];
    const feature = features.find((f) => f.feature_id === featureId);
    const featureName = feature?.name || featureId;
    const fixTrail = [];
    cb?.onStep(`Building feature ${index + 1}/${total}: ${featureName} [${classConfig?.build_class || "crud"}]`);
    cb?.onFeatureStatus(featureId, featureName, "building");
    // Compile builder package
    const jobRecord = {
        jobId: state.jobId,
        requestId: state.requestId,
        rawRequest: state.rawRequest,
        currentGate: "building",
        createdAt: new Date().toISOString(),
        durability: "memory_only",
        appSpec: state.appSpec,
        userApproved: state.userApproved,
        featureBridges: state.featureBridges,
        featureBuildOrder: state.featureBuildOrder,
        featureBuildIndex: index,
        buildResults: existingBuildResults,
    };
    let pkg = null;
    try {
        pkg = compileBuilderPackage(jobRecord, featureId, state.reusableSourceFiles);
    }
    catch (err) {
        cb?.onWarn(`Failed to compile builder package for ${featureName}: ${err.message}`);
    }
    if (!pkg) {
        cb?.onWarn(`Skipping ${featureName} — bridge not ready or blocked`);
        cb?.onFeatureStatus(featureId, featureName, "skipped");
        return { featureId, featureName, run: null, success: false, fixTrail, skipped: true, skipReason: "bridge not ready" };
    }
    // ── P2: Compile slim contract and measure reduction ──
    const slimContract = compileSlimContract(pkg);
    try {
        const reduction = measureContractReduction(pkg);
        store.addLog(state.jobId, {
            gate: "building",
            message: `[P2] ${featureName}: contract ${reduction.full_chars}→${reduction.slim_chars} chars (${reduction.reduction_pct}% reduction)`,
        });
    }
    catch {
        // Non-critical
    }
    // ── P1: Two-pass build — validate plan against scope before executing ──
    if (classConfig) {
        const plan = generateQuickPlan(pkg, classConfig, featureName);
        const planValidation = validateChangePlan(plan, pkg, classConfig);
        if (!planValidation.valid) {
            cb?.onWarn(`[P1] ${featureName} plan rejected: ${planValidation.violations.join("; ")}`);
            store.addLog(state.jobId, {
                gate: "building",
                message: `[P1] Plan REJECTED ${featureName}: ${planValidation.violations.join("; ")}`,
            });
            cb?.onFeatureStatus(featureId, featureName, "failed");
            const failedRun = makeFailedRun(state.jobId, featureId, featureName, `Plan rejected: ${planValidation.violations[0]}`);
            return { featureId, featureName, run: failedRun, success: false, fixTrail };
        }
        if (planValidation.warnings.length > 0) {
            cb?.onStep(`[P1] ${featureName} plan warnings: ${planValidation.warnings.join("; ")}`);
        }
        cb?.onStep(`[P1] ${featureName} plan validated: ${plan.planned_files.length} files, ~${plan.estimated_lines} lines`);
    }
    // Build context with P2 slim contract and P3 precomputed context
    const builderContext = {};
    if (feature) {
        builderContext.feature = {
            name: feature.name,
            description: feature.description || feature.summary || "",
            summary: feature.summary,
            outcome: feature.outcome || "",
            actor_ids: feature.actor_ids,
            destructive_actions: feature.destructive_actions,
            audit_required: feature.audit_required,
        };
    }
    if (appSpec) {
        builderContext.appSpec = {
            title: appSpec.title || "",
            summary: appSpec.summary || "",
            roles: appSpec.roles,
            permissions: appSpec.permissions?.filter((p) => p.resource === featureId),
        };
    }
    // ── P2: Inject slim contract into builder context ──
    builderContext.slimContract = slimContract;
    // ── P3: Attach precomputed shared context ──
    if (sharedContext) {
        builderContext.precomputed = {
            route_map: sharedContext.route_map,
            schema_summary: sharedContext.schema_summary,
            components: sharedContext.components.map(c => c.name),
            existing_pages: sharedContext.existing_pages,
            shared_utils: sharedContext.shared_utils,
        };
    }
    // ── P4: Wrap build in class-appropriate timeout ──
    const timeoutMs = classConfig?.timeout_ms || 90_000;
    const buildStart = Date.now();
    try {
        const timeoutResult = await withTimeout(() => codeBuilder.build(state.jobId, pkg, undefined, builderContext), timeoutMs, `${featureName} build`);
        if (timeoutResult.timed_out) {
            cb?.onFeatureStatus(featureId, featureName, "failed");
            cb?.onFail(`[P4] ${featureName}: timed out after ${timeoutMs}ms [${classConfig?.build_class || "crud"}]`);
            store.addLog(state.jobId, {
                gate: "building",
                message: `[P4] ${featureName} TIMEOUT after ${timeoutMs}ms`,
            });
            return {
                featureId,
                featureName,
                run: makeFailedRun(state.jobId, featureId, featureName, `Timed out after ${timeoutMs}ms`),
                success: false,
                fixTrail,
            };
        }
        if (!timeoutResult.success || !timeoutResult.result) {
            cb?.onFeatureStatus(featureId, featureName, "failed");
            cb?.onFail(`${featureName}: build error — ${timeoutResult.error}`);
            return {
                featureId,
                featureName,
                run: makeFailedRun(state.jobId, featureId, featureName, timeoutResult.error || "Unknown error"),
                success: false,
                fixTrail,
            };
        }
        const { run, workspace } = timeoutResult.result;
        // Verify build
        const verification = verifyBuild(state.jobId, pkg, run);
        run.verification_passed = verification.passed;
        run.scope_violations = verification.scope_violations;
        run.constraint_violations = verification.constraint_violations;
        fixTrail.push(...verification.fix_trail_entries);
        // ── P7: L1 validation immediately after build ──
        const bridge = (state.featureBridges || {})[featureId];
        if (bridge && classConfig) {
            const l1 = validateLayer1(run, bridge, classConfig);
            run.l1_validation = l1;
            if (!l1.passed) {
                const failedChecks = l1.checks.filter(c => !c.passed).map(c => c.name);
                cb?.onWarn(`[P7] ${featureName} L1 failed: ${failedChecks.join(", ")}`);
                store.addLog(state.jobId, {
                    gate: "building",
                    message: `[P7] L1 FAIL ${featureName}: ${failedChecks.join(", ")}`,
                });
            }
            else {
                cb?.onStep(`[P7] ${featureName} L1 passed (${l1.duration_ms}ms)`);
            }
        }
        const success = run.status === "build_succeeded";
        if (success) {
            cb?.onFeatureStatus(featureId, featureName, "built");
            cb?.onSuccess(`${featureName}: built (${run.files_created.length} files, ${Date.now() - buildStart}ms)`);
        }
        else {
            cb?.onFeatureStatus(featureId, featureName, "failed");
            cb?.onFail(`${featureName}: build failed — ${run.failure_reason}`);
        }
        try {
            codeBuilder["workspaceManager"].cleanup(workspace);
        }
        catch {
            // Best-effort cleanup
        }
        return { featureId, featureName, run, workspace, success, fixTrail };
    }
    catch (err) {
        cb?.onFeatureStatus(featureId, featureName, "failed");
        cb?.onFail(`${featureName}: unhandled build error — ${err.message}`);
        return {
            featureId,
            featureName,
            run: makeFailedRun(state.jobId, featureId, featureName, err.message || String(err)),
            success: false,
            fixTrail,
        };
    }
}
// ─── P5: Parallel per-feature fallback ──────────────────────────────
/**
 * Parallel per-feature builds using P5 executeParallel.
 * Features are grouped by dependency level and run concurrently within each level.
 * All P0-P4, P6-P7 optimizations are applied per-feature via buildSingleFeature.
 */
async function parallelPerFeatureFallback(state, buildResults, fixTrailEntries, classConfigs, readyFeatures) {
    const cb = getCallbacks();
    const store = getJobStore();
    const featureBuildOrder = state.featureBuildOrder || [];
    const appSpec = state.appSpec;
    const features = appSpec?.features || [];
    const bridges = state.featureBridges || {};
    // ── P3: Precompute shared context once (if any workspace exists) ──
    let sharedContext = null;
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    // Build the set of features that are ready (passed preflight)
    const readySet = new Set(readyFeatures);
    // Mark skipped features immediately
    for (const fid of featureBuildOrder) {
        if (!readySet.has(fid)) {
            const feat = features.find((f) => f.feature_id === fid);
            const fname = feat?.name || fid;
            cb?.onWarn(`Skipping ${fname} — failed preflight`);
            cb?.onFeatureStatus(fid, fname, "skipped");
            skippedCount++;
        }
    }
    // ── Worktree isolation: create pool for isolated parallel builds ──
    let worktreePool = null;
    try {
        worktreePool = createWorktreePool(state.jobId);
        cb?.onStep(`[Isolation] Worktree pool created at ${worktreePool.base_repo_path}`);
        store.addLog(state.jobId, {
            gate: "building",
            message: `[Isolation] Worktree pool created for job ${state.jobId}`,
        });
    }
    catch (err) {
        cb?.onWarn(`[Isolation] Worktree pool failed: ${err.message} — using standard workspaces`);
    }
    // ── P5: Build dependency graph and create parallel tasks ──
    const concurrencyTierMap = {};
    for (const fid of readyFeatures) {
        const cfg = classConfigs.get(fid);
        if (!cfg) {
            concurrencyTierMap[fid] = "medium";
            continue;
        }
        // Map class concurrency limits to tiers
        if (cfg.max_concurrency >= 5)
            concurrencyTierMap[fid] = "high";
        else if (cfg.max_concurrency >= 3)
            concurrencyTierMap[fid] = "medium";
        else
            concurrencyTierMap[fid] = "low";
    }
    // Extract dependencies from bridges
    const featureDeps = {};
    for (const fid of readyFeatures) {
        const bridge = bridges[fid];
        if (bridge?.dependencies) {
            featureDeps[fid] = bridge.dependencies
                .filter((d) => d.status === "required")
                .map((d) => d.feature_id)
                .filter((depId) => readySet.has(depId)); // Only deps in our build set
        }
        else {
            featureDeps[fid] = [];
        }
    }
    const tasks = readyFeatures.map((fid, idx) => ({
        feature_id: fid,
        feature_name: features.find((f) => f.feature_id === fid)?.name || fid,
        concurrency_tier: concurrencyTierMap[fid] || "medium",
        dependencies: featureDeps[fid] || [],
        execute: async () => {
            const start = Date.now();
            const featureName = features.find((f) => f.feature_id === fid)?.name || fid;
            // ── Worktree isolation: create isolated worktree for this feature ──
            let worktree = null;
            if (worktreePool) {
                try {
                    worktree = createWorktree(worktreePool, fid, featureName);
                    cb?.onStep(`[Isolation] Worktree created for ${featureName}: ${worktree.branch}`);
                }
                catch (err) {
                    cb?.onWarn(`[Isolation] Worktree failed for ${featureName}: ${err.message}`);
                }
            }
            const result = await buildSingleFeature(state, fid, idx, readyFeatures.length, classConfigs.get(fid), sharedContext, buildResults);
            // Store results
            if (result.run) {
                buildResults[fid] = result.run;
                // Attach worktree info to the build result
                if (worktree) {
                    result.run.worktree_id = worktree.worktree_id;
                    result.run.worktree_branch = worktree.branch;
                    result.run.worktree_path = worktree.worktree_path;
                }
            }
            fixTrailEntries.push(...result.fixTrail);
            // ── Worktree isolation: merge successful builds back to integration ──
            if (result.success && worktreePool && worktree) {
                const mergeResult = mergeWorktree(worktreePool, fid, `[AES] feat(${fid}): ${featureName}`);
                if (mergeResult.merged) {
                    cb?.onStep(`[Isolation] ${featureName} merged to integration branch`);
                }
                else if (mergeResult.conflicts.length > 0) {
                    cb?.onWarn(`[Isolation] ${featureName} merge conflicts: ${mergeResult.conflicts.join(", ")}`);
                    store.addLog(state.jobId, {
                        gate: "building",
                        message: `[Isolation] Merge conflict for ${featureName}: ${mergeResult.conflicts.join(", ")}`,
                    });
                }
            }
            // ── Worktree isolation: cleanup worktree after build ──
            if (worktreePool && worktree) {
                try {
                    cleanupWorktree(worktreePool, fid);
                }
                catch {
                    // Best effort
                }
            }
            // ── P3: Update shared context after successful build ──
            if (result.success && result.run?.files_created?.length > 0) {
                try {
                    const contextPath = worktreePool?.base_repo_path || result.workspace?.path;
                    if (!sharedContext && contextPath) {
                        sharedContext = precomputeContext(contextPath);
                        store.addLog(state.jobId, {
                            gate: "building",
                            message: `[P3] Precomputed context: ${Object.keys(sharedContext.route_map).length} routes, ${sharedContext.schema_tables.length} tables, ${sharedContext.components.length} components`,
                        });
                    }
                    else if (sharedContext && contextPath) {
                        sharedContext = updateContextAfterBuild(sharedContext, result.run.files_created, contextPath);
                    }
                }
                catch {
                    // Non-critical
                }
            }
            return {
                feature_id: fid,
                success: result.success && !result.skipped,
                duration_ms: Date.now() - start,
                error: result.skipped ? result.skipReason : (result.run?.failure_reason || undefined),
                result: result.run,
            };
        },
    }));
    // Log execution plan
    const isolatedFeatures = readyFeatures.filter(fid => classConfigs.get(fid)?.requires_isolation);
    const parallelFeatures = readyFeatures.filter(fid => !classConfigs.get(fid)?.requires_isolation);
    store.addLog(state.jobId, {
        gate: "building",
        message: `[P5] Parallel execution plan: ${parallelFeatures.length} parallel, ${isolatedFeatures.length} isolated, worktree=${worktreePool ? "yes" : "no"}, deps: ${Object.entries(featureDeps).filter(([, d]) => d.length > 0).map(([id, d]) => `${id}←[${d.join(",")}]`).join("; ") || "none"}`,
    });
    cb?.onStep(`[P5] Executing ${tasks.length} features in parallel with dependency-ordered levels${worktreePool ? " (worktree-isolated)" : ""}`);
    // ── P5: Execute in parallel with semaphore ──
    const parallelResults = await executeParallel(tasks, (featureId, status) => {
        const fname = features.find((f) => f.feature_id === featureId)?.name || featureId;
        cb?.onFeatureStatus(featureId, fname, status);
    });
    // Tally results
    for (const pr of parallelResults) {
        if (pr.success) {
            successCount++;
        }
        else {
            failCount++;
        }
    }
    // ── Worktree isolation: store integration result and cleanup ──
    if (worktreePool) {
        try {
            const integration = getIntegrationResult(worktreePool);
            buildResults["__integration__"] = {
                path: integration.path,
                branch: integration.branch,
                merged_features: integration.merged_features,
                commit: integration.commit,
            };
            store.addLog(state.jobId, {
                gate: "building",
                message: `[Isolation] Integration: ${integration.merged_features.length} features merged to ${integration.branch}`,
            });
        }
        catch (err) {
            store.addLog(state.jobId, {
                gate: "building",
                message: `[Isolation] Integration result error: ${err.message}`,
            });
        }
        // Don't clean up pool yet — deployment handler may need the base repo
        // Pool cleanup happens after deployment or on error
    }
    // ── P7: L3 cross-feature validation ──
    if (successCount > 0) {
        try {
            const pipeline = runValidationPipeline(buildResults, state.featureBridges || {}, classConfigs);
            buildResults["__validation_pipeline__"] = {
                summary: pipeline.summary,
                l1_details: Object.fromEntries(pipeline.l1Results),
                l2_details: Object.fromEntries(pipeline.l2Results),
                l3_details: pipeline.l3Result,
            };
            cb?.onStep(`[P7] L3 cross-feature: ${pipeline.summary.l3_passed ? "PASS" : "FAIL"}`);
            store.addLog(state.jobId, {
                gate: "building",
                message: `[P7] Validation pipeline: L1 ${pipeline.summary.l1_passed}/${pipeline.summary.total_features}, L2 ${pipeline.summary.l2_passed}/${pipeline.summary.total_features}, L3 ${pipeline.summary.l3_passed ? "pass" : "fail"}`,
            });
        }
        catch (err) {
            store.addLog(state.jobId, {
                gate: "building",
                message: `[P7] Validation pipeline error: ${err.message}`,
            });
        }
    }
    const total = featureBuildOrder.length;
    const summary = `Build complete (parallel): ${successCount}/${total} succeeded, ${failCount} failed, ${skippedCount} skipped`;
    store.addLog(state.jobId, { gate: "building", message: summary });
    if (successCount === 0 && failCount > 0) {
        cb?.onFail(`All ${failCount} feature builds failed`);
        return {
            currentGate: "failed",
            buildResults,
            fixTrailEntries,
            errorMessage: `All ${failCount} feature builds failed`,
        };
    }
    cb?.onSuccess(summary);
    return {
        currentGate: "building",
        buildResults,
        fixTrailEntries,
    };
}
// ─── P1: Quick plan generator (heuristic, no LLM call) ─────────────
/**
 * Generate a quick change plan from the builder package scope.
 * This is a heuristic plan used for scope validation before the real build.
 * A full LLM-generated plan can replace this when wired to the LLM layer.
 */
function generateQuickPlan(pkg, classConfig, featureName) {
    const slug = featureName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const planned = [];
    // Estimate files based on capabilities
    const hasUI = pkg.included_capabilities.some(c => /page|ui|view|dashboard|form|display|layout/i.test(c));
    const hasData = pkg.included_capabilities.some(c => /create|read|update|delete|crud|list|query|mutation/i.test(c));
    const hasAuth = pkg.included_capabilities.some(c => /auth|permission|role|access/i.test(c));
    if (hasData) {
        planned.push({ path: `convex/${slug}/schema.ts`, action: "create", estimated_lines: 30, purpose: "Data schema" }, { path: `convex/${slug}/queries.ts`, action: "create", estimated_lines: 60, purpose: "Query functions" }, { path: `convex/${slug}/mutations.ts`, action: "create", estimated_lines: 80, purpose: "Mutation functions" });
    }
    if (hasUI) {
        planned.push({ path: `src/app/${slug}/page.tsx`, action: "create", estimated_lines: 120, purpose: "Main page" }, { path: `src/components/${slug}/list.tsx`, action: "create", estimated_lines: 80, purpose: "List component" }, { path: `src/components/${slug}/form.tsx`, action: "create", estimated_lines: 100, purpose: "Form component" });
    }
    if (hasAuth) {
        planned.push({ path: `src/lib/${slug}-permissions.ts`, action: "create", estimated_lines: 40, purpose: "Permission checks" });
    }
    // Always include a test
    planned.push({ path: `__tests__/${slug}.test.ts`, action: "create", estimated_lines: 50, purpose: "Feature tests" });
    const estimatedLines = planned.reduce((sum, f) => sum + f.estimated_lines, 0);
    return {
        feature_id: pkg.feature_id,
        planned_files: planned,
        estimated_lines: estimatedLines,
        touches_shared: false,
        touches_schema: hasData,
        touches_config: false,
        rationale: `Heuristic plan for ${featureName} [${classConfig.build_class}]: ${planned.length} files, ~${estimatedLines} lines`,
    };
}
// ─── Utility ────────────────────────────────────────────────────────
function makeFailedRun(jobId, featureId, featureName, reason) {
    return {
        run_id: `br-fail-${featureId}`,
        job_id: jobId,
        feature_id: featureId,
        feature_name: featureName,
        status: "build_failed",
        failure_reason: reason,
        files_created: [],
        files_modified: [],
        files_deleted: [],
        test_results: [],
        check_results: [],
        scope_violations: [],
        constraint_violations: [],
        verification_passed: false,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
    };
}
