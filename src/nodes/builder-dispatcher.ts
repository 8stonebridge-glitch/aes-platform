/**
 * Builder Dispatcher — orchestrates a complete application build.
 *
 * Uses AppBuilder to produce a single workspace containing the entire app:
 * - Scaffolds the base project (package.json, tsconfig, Next.js config, etc.)
 * - Generates app-level files (layout, sidebar, dashboard, unified schema)
 * - Builds each feature into the shared workspace
 * - Commits everything as one atomic git commit
 *
 * Falls back to per-feature builds if AppBuilder encounters a fatal error.
 */

import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { AppBuilder } from "../builder/app-builder.js";
import { compileBuilderPackage, type BuilderPackage } from "../builder-artifact.js";
import { CodeBuilder, type BuilderContext } from "../builder/code-builder.js";
import { verifyBuild } from "../builder/build-verifier.js";
import type { FixTrailEntry, BuilderRunRecord } from "../types/artifacts.js";
import type { JobRecord } from "../store.js";

export async function builderDispatcher(
  state: AESStateType,
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  cb?.onGate("building", "Building complete application...");
  store.addLog(state.jobId, {
    gate: "building",
    message: `Building complete application with ${(state.featureBuildOrder || []).length} features`,
  });

  const buildResults: Record<string, any> = { ...(state.buildResults || {}) };
  const fixTrailEntries: FixTrailEntry[] = [...(state.fixTrailEntries || [])];

  const featureBuildOrder = state.featureBuildOrder || [];
  if (featureBuildOrder.length === 0) {
    cb?.onWarn("No features in build order — skipping build phase");
    return {
      currentGate: "building" as any,
      buildResults,
      fixTrailEntries,
    };
  }

  const appBuilder = new AppBuilder();

  try {
    const result = await appBuilder.buildApp(
      state.jobId,
      state.appSpec,
      state.featureBridges,
      state.featureBuildOrder,
      cb,
    );

    // Store the app-level build as a special entry
    buildResults["__app__"] = result.run;

    // Store per-feature results
    for (const [featureId, featureRun] of Object.entries(result.featureResults)) {
      buildResults[featureId] = featureRun;
    }

    const successCount = Object.values(result.featureResults).filter(
      (r) => r.status === "build_succeeded",
    ).length;
    const failCount = Object.values(result.featureResults).filter(
      (r) => r.status === "build_failed",
    ).length;
    const total = featureBuildOrder.length;

    const summary = `Application built: ${successCount}/${total} features succeeded${failCount > 0 ? `, ${failCount} failed` : ""}`;

    store.addLog(state.jobId, { gate: "building", message: summary });

    if (successCount === 0 && failCount > 0) {
      cb?.onFail(`All ${failCount} feature builds failed`);
      return {
        currentGate: "failed" as any,
        buildResults,
        fixTrailEntries,
        errorMessage: `All ${failCount} feature builds failed`,
      };
    }

    cb?.onSuccess(summary);

    return {
      currentGate: "building" as any,
      buildResults,
      fixTrailEntries,
    };
  } catch (err: any) {
    cb?.onFail(`Application build failed: ${err.message}`);
    store.addLog(state.jobId, {
      gate: "building",
      message: `Application build FAILED: ${err.message}`,
    });

    // Fall back to per-feature builds
    cb?.onWarn("Falling back to per-feature builds...");
    return await perFeatureFallback(state, buildResults, fixTrailEntries);
  }
}

/**
 * Fallback: build features individually (original behavior).
 * Used when AppBuilder encounters a fatal error.
 */
async function perFeatureFallback(
  state: AESStateType,
  buildResults: Record<string, any>,
  fixTrailEntries: FixTrailEntry[],
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();
  const codeBuilder = new CodeBuilder();
  const featureBuildOrder = state.featureBuildOrder || [];

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < featureBuildOrder.length; i++) {
    const featureId = featureBuildOrder[i];

    const appSpec = state.appSpec;
    const features = appSpec?.features || [];
    const feature = features.find((f: any) => f.feature_id === featureId);
    const featureName = feature?.name || featureId;

    cb?.onStep(`Building feature ${i + 1}/${featureBuildOrder.length}: ${featureName}`);
    cb?.onFeatureStatus(featureId, featureName, "building");

    const jobRecord: JobRecord = {
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
      featureBuildIndex: i,
      buildResults,
    };

    let pkg: BuilderPackage | null = null;
    try {
      pkg = compileBuilderPackage(jobRecord, featureId);
    } catch (err: any) {
      cb?.onWarn(`Failed to compile builder package for ${featureName}: ${err.message}`);
    }

    if (!pkg) {
      cb?.onWarn(`Skipping ${featureName} — bridge not ready or blocked`);
      cb?.onFeatureStatus(featureId, featureName, "skipped");
      continue;
    }

    const builderContext: BuilderContext = {};
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
        permissions: appSpec.permissions?.filter(
          (p: any) => p.resource === featureId,
        ),
      };
    }

    try {
      const { run, workspace } = await codeBuilder.build(
        state.jobId,
        pkg,
        undefined,
        builderContext,
      );

      const verification = verifyBuild(state.jobId, pkg, run);
      run.verification_passed = verification.passed;
      run.scope_violations = verification.scope_violations;
      run.constraint_violations = verification.constraint_violations;
      fixTrailEntries.push(...verification.fix_trail_entries);

      buildResults[featureId] = run;

      if (run.status === "build_succeeded") {
        successCount++;
        cb?.onFeatureStatus(featureId, featureName, "built");
        cb?.onSuccess(`${featureName}: build succeeded (${run.files_created.length} files created)`);
      } else {
        failCount++;
        cb?.onFeatureStatus(featureId, featureName, "failed");
        cb?.onFail(`${featureName}: build failed — ${run.failure_reason}`);
      }

      try {
        codeBuilder["workspaceManager"].cleanup(workspace);
      } catch {
        // Best-effort cleanup
      }
    } catch (err: any) {
      failCount++;
      cb?.onFeatureStatus(featureId, featureName, "failed");
      cb?.onFail(`${featureName}: unhandled build error — ${err.message}`);

      buildResults[featureId] = {
        run_id: `br-error-${featureId}`,
        job_id: state.jobId,
        feature_id: featureId,
        feature_name: featureName,
        status: "build_failed",
        failure_reason: err.message || String(err),
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
  }

  const total = featureBuildOrder.length;
  const summary = `Build complete (fallback): ${successCount}/${total} succeeded, ${failCount} failed`;

  store.addLog(state.jobId, { gate: "building", message: summary });

  if (successCount === 0 && failCount > 0) {
    cb?.onFail(`All ${failCount} feature builds failed`);
    return {
      currentGate: "failed" as any,
      buildResults,
      fixTrailEntries,
      errorMessage: `All ${failCount} feature builds failed`,
    };
  }

  cb?.onSuccess(summary);

  return {
    currentGate: "building" as any,
    buildResults,
    fixTrailEntries,
  };
}
