/**
 * aes build-feature <job-id> <feature-id>
 *
 * Builds a single feature from a completed pipeline run.
 * Consumes the BuilderPackage, runs the code builder, verifies output, persists results.
 */
import { getJobStore } from "../../store.js";
import { compileBuilderPackage } from "../../builder-artifact.js";
import { CodeBuilder } from "../../builder/code-builder.js";
import { verifyBuild, createCheckFixTrailEntries } from "../../builder/build-verifier.js";
import { CheckRunner } from "../../builder/check-runner.js";
export async function buildFeatureCommand(jobId, featureId, options) {
    const store = getJobStore();
    // 1. Load job from Postgres
    console.log(`Loading job ${jobId}...`);
    const job = await store.loadFromPostgres(jobId);
    if (!job) {
        console.error("Job not found. Run 'aes summary' to see available jobs.");
        return;
    }
    // 2. Compile BuilderPackage
    console.log(`Compiling builder package for feature: ${featureId}...`);
    const pkg = compileBuilderPackage(job, featureId);
    if (!pkg) {
        console.error("Cannot compile builder package. Feature may not be ready (not approved, blocked, or missing).");
        return;
    }
    // 3. Check bridge is not blocked
    const bridge = job.featureBridges?.[featureId];
    if (bridge?.status === "blocked") {
        console.error(`Feature ${featureId} is blocked: ${bridge.blocked_reason}`);
        return;
    }
    // 4. Run builder
    console.log(`Building feature: ${pkg.feature_name}...`);
    console.log(`  Objective: ${pkg.objective}`);
    console.log(`  Capabilities: ${pkg.included_capabilities.length}`);
    console.log(`  Reuse assets: ${pkg.reuse_assets.length}`);
    console.log(`  Required tests: ${pkg.required_tests.length}`);
    console.log();
    const builder = new CodeBuilder();
    const { run, workspace, prSummary } = await builder.build(jobId, pkg);
    // 5. Persist initial run record
    const persistence = store.getPersistence();
    if (persistence) {
        try {
            await persistence.persistBuilderRun(run);
            console.log(`Builder run persisted: ${run.run_id}`);
        }
        catch (err) {
            console.error(`Warning: Failed to persist builder run: ${err.message}`);
        }
    }
    // 6. Run repo-level checks
    console.log(`Running repo checks...`);
    const checkRunner = new CheckRunner();
    const checkResults = await checkRunner.runAll(workspace.path);
    run.check_results = checkResults;
    // Display check results
    console.log();
    console.log(`=== Repo Checks ===`);
    for (const cr of checkResults) {
        if (cr.skipped) {
            console.log(`  \u2298 ${cr.check.padEnd(12)} skipped (${cr.skip_reason})`);
        }
        else if (cr.passed) {
            console.log(`  \u2713 ${cr.check.padEnd(12)} ${cr.duration_ms}ms`);
        }
        else {
            console.log(`  \u2717 ${cr.check.padEnd(12)} FAILED ${cr.duration_ms}ms`);
            console.log(`    ${cr.output.substring(0, 200)}`);
        }
    }
    console.log();
    // 7. Post-build verification
    console.log(`Verifying build output...`);
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
        console.error(`Build REJECTED:`);
        for (const v of verification.scope_violations)
            console.error(`  [scope] ${v}`);
        for (const v of verification.constraint_violations)
            console.error(`  [constraint] ${v}`);
    }
    else {
        console.log(`Verification PASSED`);
    }
    // 8. Update run status in Postgres
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
        catch (err) {
            console.error(`Warning: Failed to update builder run: ${err.message}`);
        }
        // 9. Persist FixTrail entries for verification failures
        for (const entry of verification.fix_trail_entries) {
            try {
                await persistence.persistFixTrail(entry);
                console.log(`  FixTrail entry created: ${entry.error_code}`);
            }
            catch (err) {
                console.error(`Warning: Failed to persist FixTrail: ${err.message}`);
            }
        }
        // 10. Persist FixTrail entries for repo check failures
        const checkFixEntries = createCheckFixTrailEntries(jobId, run.run_id, pkg.bridge_id, run.check_results);
        for (const entry of checkFixEntries) {
            try {
                await persistence.persistFixTrail(entry);
                console.log(`  FixTrail entry created: ${entry.error_code}`);
            }
            catch (err) {
                console.error(`Warning: Failed to persist FixTrail: ${err.message}`);
            }
        }
    }
    // 11. Print summary
    console.log();
    console.log(`=== Build Summary ===`);
    console.log(`Run ID:       ${run.run_id}`);
    console.log(`Status:       ${run.status}`);
    console.log(`Feature:      ${run.feature_name}`);
    console.log(`Builder:      ${run.builder_model}`);
    console.log(`Duration:     ${run.duration_ms}ms`);
    console.log(`Files created: ${run.files_created.length}`);
    console.log(`Files modified: ${run.files_modified.length}`);
    console.log(`Tests:        ${run.test_results.filter(t => t.passed).length}/${run.test_results.length} passed`);
    console.log(`Checks:       ${run.check_results.filter(c => c.passed || c.skipped).length}/${run.check_results.length} OK`);
    console.log(`Verification: ${run.verification_passed ? "PASSED" : "REJECTED"}`);
    if (run.failure_reason)
        console.log(`Failure:      ${run.failure_reason}`);
    console.log();
    // 10. Show workspace info
    console.log(`=== Workspace ===`);
    console.log(`Workspace ID: ${workspace.workspace_id}`);
    console.log(`Branch:       ${workspace.branch}`);
    console.log(`Path:         ${workspace.path}`);
    console.log(`Base commit:  ${workspace.base_commit}`);
    if (run.final_commit)
        console.log(`Final commit: ${run.final_commit}`);
    console.log();
    if (run.files_created.length > 0) {
        console.log(`Files created:`);
        for (const f of run.files_created)
            console.log(`  + ${f}`);
    }
    if (run.files_modified.length > 0) {
        console.log(`Files modified:`);
        for (const f of run.files_modified)
            console.log(`  ~ ${f}`);
    }
    // 11. Show PR summary
    console.log();
    console.log(`=== PR Summary ===`);
    console.log(prSummary);
    // 12. Merge gate
    if (options?.approveMerge) {
        console.log();
        console.log(`--approve-merge flag set. Merge approval recorded.`);
        console.log(`Note: Actual merge to main requires external CI/CD integration.`);
    }
    else {
        console.log();
        console.log(`To approve merge, re-run with --approve-merge flag.`);
        console.log(`Inspect generated code at: ${workspace.path}`);
    }
}
