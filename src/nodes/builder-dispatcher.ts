/**
 * Builder Dispatcher — orchestrates feature builds for all features in build order.
 *
 * Iterates through `state.featureBuildOrder`, compiles a BuilderPackage for each
 * feature, generates code via CodeBuilder (LLM-first with template fallback),
 * verifies the output, and stores results.
 *
 * Error handling: if an individual feature fails, the failure is recorded and
 * the dispatcher continues to the next feature. The pipeline only fails entirely
 * if ALL features fail.
 */

import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
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

  cb?.onGate("building", "Starting feature builds...");
  store.addLog(state.jobId, {
    gate: "building",
    message: `Building ${(state.featureBuildOrder || []).length} features`,
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

  const codeBuilder = new CodeBuilder();
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < featureBuildOrder.length; i++) {
    const featureId = featureBuildOrder[i];

    // Look up feature details from AppSpec
    const appSpec = state.appSpec;
    const features = appSpec?.features || [];
    const feature = features.find((f: any) => f.feature_id === featureId);
    const featureName = feature?.name || featureId;

    cb?.onStep(`Building feature ${i + 1}/${featureBuildOrder.length}: ${featureName}`);
    cb?.onFeatureStatus(featureId, featureName, "building");

    // Construct a JobRecord-like object for compileBuilderPackage
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

    // Compile BuilderPackage from bridge
    let pkg: BuilderPackage | null = null;
    try {
      pkg = compileBuilderPackage(jobRecord, featureId);
    } catch (err: any) {
      cb?.onWarn(`Failed to compile builder package for ${featureName}: ${err.message}`);
    }

    if (!pkg) {
      cb?.onWarn(`Skipping ${featureName} — bridge not ready or blocked`);
      cb?.onFeatureStatus(featureId, featureName, "skipped");
      store.addLog(state.jobId, {
        gate: "building",
        message: `Skipped ${featureName}: bridge not ready`,
      });
      continue;
    }

    // Prepare LLM context from AppSpec
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
      // Build the feature
      const { run, workspace } = await codeBuilder.build(
        state.jobId,
        pkg,
        undefined, // repoUrl — not used in pipeline yet
        builderContext,
      );

      // Verify the build
      const verification = verifyBuild(state.jobId, pkg, run);
      run.verification_passed = verification.passed;
      run.scope_violations = verification.scope_violations;
      run.constraint_violations = verification.constraint_violations;
      fixTrailEntries.push(...verification.fix_trail_entries);

      // Store result
      buildResults[featureId] = run;

      if (run.status === "build_succeeded") {
        successCount++;
        cb?.onFeatureStatus(featureId, featureName, "built");
        cb?.onSuccess(`${featureName}: build succeeded (${run.files_created.length} files created)`);

        if (!verification.passed) {
          cb?.onWarn(
            `${featureName}: verification issues — ${verification.scope_violations.length} scope, ${verification.constraint_violations.length} constraint violations`,
          );
        }
      } else {
        failCount++;
        cb?.onFeatureStatus(featureId, featureName, "failed");
        cb?.onFail(`${featureName}: build failed — ${run.failure_reason}`);
      }

      // Cleanup workspace
      try {
        codeBuilder["workspaceManager"].cleanup(workspace);
      } catch {
        // Best-effort cleanup
      }

      store.addLog(state.jobId, {
        gate: "building",
        message: `${featureName}: ${run.status} (${run.duration_ms}ms, ${run.files_created.length} files)`,
      });
    } catch (err: any) {
      failCount++;
      cb?.onFeatureStatus(featureId, featureName, "failed");
      cb?.onFail(`${featureName}: unhandled build error — ${err.message}`);

      // Store a minimal failure record
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

      store.addLog(state.jobId, {
        gate: "building",
        message: `${featureName}: FAILED — ${err.message}`,
      });
    }
  }

  // Final summary
  const total = featureBuildOrder.length;
  const summary = `Build complete: ${successCount}/${total} succeeded, ${failCount} failed`;

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
