/**
 * aes demo
 *
 * End-to-end demo: runs the full pipeline for "internal approval portal",
 * then builds the first feature (request-submission).
 * Auto-confirms and auto-approves for demo purposes.
 */
import { randomUUID } from "node:crypto";
import { logGate, logStep, logSuccess, logFail, logPause, logHeader, logKeyValue, logFeatureStatus, logDivider, logWarn, } from "../logger.js";
import { runGraph } from "../../graph.js";
import { getJobStore } from "../../store.js";
import { compileBuilderPackage } from "../../builder-artifact.js";
import { CodeBuilder } from "../../builder/code-builder.js";
import { verifyBuild, createCheckFixTrailEntries } from "../../builder/build-verifier.js";
import { CheckRunner } from "../../builder/check-runner.js";
import { viewCommand } from "./view.js";
export async function demoCommand() {
    const intent = "internal approval portal for leave requests";
    const jobId = `j-${randomUUID().slice(0, 8)}`;
    const requestId = randomUUID();
    logHeader("AES v12 — End-to-End Demo");
    logKeyValue("Job", jobId);
    logKeyValue("Intent", intent);
    logDivider();
    try {
        // 1. Run full pipeline with auto-confirm and auto-approve
        logStep("Phase 1: Running governed pipeline (Gates 0-3)...");
        console.log();
        const result = await runGraph({
            jobId,
            requestId,
            rawRequest: intent,
            currentGate: "gate_0",
        }, {
            onGate: (gate, message) => logGate(gate, message),
            onStep: (message) => logStep(message),
            onSuccess: (message) => logSuccess(message),
            onFail: (message) => logFail(message),
            onWarn: (message) => logWarn(message),
            onPause: (message) => logPause(message),
            onFeatureStatus: (id, name, status) => logFeatureStatus(id, name, status),
            onNeedsApproval: async (_prompt, _data) => {
                logStep("[demo] Auto-approving plan");
                return true;
            },
            onNeedsConfirmation: async (_statement) => {
                logStep("[demo] Auto-confirming intent");
                return true;
            },
        });
        // Check pipeline completed through Gate 3
        if (result.errorMessage) {
            logFail(`Pipeline failed: ${result.errorMessage}`);
            return;
        }
        console.log();
        logSuccess("Pipeline complete through Gate 3");
        logDivider();
        // 2. Pick first feature in build order
        const store = getJobStore();
        const job = store.get(jobId);
        if (!job) {
            logFail("Job not found in store after pipeline run");
            return;
        }
        const buildOrder = job.featureBuildOrder || [];
        if (buildOrder.length === 0) {
            logFail("No features in build order");
            return;
        }
        const firstFeatureId = buildOrder[0];
        logStep(`Phase 2: Building first feature: ${firstFeatureId}`);
        console.log();
        // 3. Compile BuilderPackage
        const pkg = compileBuilderPackage(job, firstFeatureId);
        if (!pkg) {
            logFail("Cannot compile builder package for first feature. It may not be ready.");
            logStep("Attempting next feature in build order...");
            // Try subsequent features
            let builtFeatureId = null;
            for (let i = 1; i < buildOrder.length; i++) {
                const altPkg = compileBuilderPackage(job, buildOrder[i]);
                if (altPkg) {
                    builtFeatureId = buildOrder[i];
                    logStep(`Using feature: ${builtFeatureId}`);
                    await runBuildPhase(jobId, job, builtFeatureId, altPkg, store);
                    break;
                }
            }
            if (!builtFeatureId) {
                logFail("No features are ready for building (all may be blocked or missing vetoes)");
            }
        }
        else {
            await runBuildPhase(jobId, job, firstFeatureId, pkg, store);
        }
        // 4. Show full view
        console.log();
        logDivider();
        logStep("Phase 3: Full run summary");
        console.log();
        await viewCommand(jobId);
    }
    catch (err) {
        logFail(`Demo fatal error: ${err.message}`);
    }
}
async function runBuildPhase(jobId, job, featureId, pkg, store) {
    logKeyValue("Feature", pkg.feature_name);
    logKeyValue("Objective", pkg.objective);
    logKeyValue("Capabilities", String(pkg.included_capabilities.length));
    logKeyValue("Required tests", String(pkg.required_tests.length));
    console.log();
    // Run code builder
    const builder = new CodeBuilder();
    const { run, workspace, prSummary } = await builder.build(jobId, pkg);
    // Persist if possible
    const persistence = store.getPersistence();
    if (persistence) {
        try {
            await persistence.persistBuilderRun(run);
        }
        catch (err) {
            logWarn(`Could not persist builder run: ${err.message}`);
        }
    }
    // Run repo checks
    logStep("Running repo checks...");
    const checkRunner = new CheckRunner();
    const checkResults = await checkRunner.runAll(workspace.path);
    run.check_results = checkResults;
    for (const cr of checkResults) {
        if (cr.skipped) {
            logKeyValue(`  \u2298 ${cr.check}`, `skipped (${cr.skip_reason})`);
        }
        else if (cr.passed) {
            logKeyValue(`  \u2713 ${cr.check}`, `${cr.duration_ms}ms`);
        }
        else {
            logWarn(`  \u2717 ${cr.check}: FAILED ${cr.duration_ms}ms`);
        }
    }
    // Verify
    const verification = verifyBuild(jobId, pkg, run);
    run.scope_violations = verification.scope_violations;
    run.constraint_violations = verification.constraint_violations;
    run.verification_passed = verification.passed;
    if (!verification.passed) {
        run.status = "build_rejected";
        run.failure_reason = [
            ...verification.scope_violations,
            ...verification.constraint_violations,
        ].join("; ");
    }
    // Update persistence
    if (persistence) {
        try {
            await persistence.updateBuilderRunStatus(run.run_id, run.status, {
                files_created: run.files_created,
                files_modified: run.files_modified,
                scope_violations: run.scope_violations,
                constraint_violations: run.constraint_violations,
                verification_passed: run.verification_passed,
                failure_reason: run.failure_reason,
                completed_at: run.completed_at || undefined,
                duration_ms: run.duration_ms,
                workspace_id: run.workspace_id,
                branch: run.branch,
                base_commit: run.base_commit,
                final_commit: run.final_commit,
                diff_summary: run.diff_summary,
                pr_summary: run.pr_summary,
                check_results: run.check_results,
            });
        }
        catch (_err) {
            // Non-fatal
        }
        for (const entry of verification.fix_trail_entries) {
            try {
                await persistence.persistFixTrail(entry);
            }
            catch (_err) {
                // Non-fatal
            }
        }
        // Persist FixTrail entries for repo check failures
        const checkFixEntries = createCheckFixTrailEntries(jobId, run.run_id, pkg.bridge_id, run.check_results);
        for (const entry of checkFixEntries) {
            try {
                await persistence.persistFixTrail(entry);
            }
            catch (_err) {
                // Non-fatal
            }
        }
    }
    // Store builder run on job
    if (!job.builderRuns)
        job.builderRuns = [];
    job.builderRuns.push(run);
    store.update(jobId, { builderRuns: job.builderRuns });
    // Summary
    console.log();
    logKeyValue("Run ID", run.run_id);
    logKeyValue("Status", run.status);
    logKeyValue("Builder", run.builder_model);
    logKeyValue("Duration", `${run.duration_ms}ms`);
    logKeyValue("Files created", String(run.files_created.length));
    logKeyValue("Files modified", String(run.files_modified.length));
    logKeyValue("Tests", `${run.test_results.filter((t) => t.passed).length}/${run.test_results.length} passed`);
    logKeyValue("Verification", run.verification_passed ? "PASSED" : "REJECTED");
    if (run.verification_passed) {
        logSuccess("Feature build succeeded");
    }
    else {
        logFail(`Feature build rejected: ${run.failure_reason}`);
    }
    // Workspace info
    console.log();
    logKeyValue("Workspace", workspace.workspace_id);
    logKeyValue("Branch", workspace.branch);
    logKeyValue("Path", workspace.path);
    if (run.files_created.length > 0) {
        console.log();
        logStep("Files created:");
        for (const f of run.files_created) {
            console.log(`  + ${f}`);
        }
    }
    // PR Summary
    console.log();
    logStep("PR Summary:");
    console.log(prSummary);
}
