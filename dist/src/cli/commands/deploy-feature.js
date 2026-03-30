/**
 * aes deploy-feature <job-id> <feature-id>
 *
 * Full end-to-end: scaffold repo -> build feature -> run checks -> validate framework -> prepare deploy.
 * This is the governed delivery path for one feature.
 */
import { getJobStore } from "../../store.js";
import { compileBuilderPackage } from "../../builder-artifact.js";
import { CodeBuilder } from "../../builder/code-builder.js";
import { CheckRunner } from "../../builder/check-runner.js";
import { verifyBuild } from "../../builder/build-verifier.js";
import { RepoScaffolder } from "../../deploy/repo-scaffolder.js";
import { FrameworkValidator } from "../../deploy/framework-validator.js";
import { DeployManager } from "../../deploy/deploy-manager.js";
export async function deployFeatureCommand(jobId, featureId) {
    const store = getJobStore();
    // 1. Load job
    console.log(`\n=== AES Governed Deployment ===\n`);
    console.log(`Loading job ${jobId}...`);
    const job = await store.loadFromPostgres(jobId);
    if (!job) {
        console.error("Job not found.");
        return;
    }
    // 2. Compile BuilderPackage
    console.log(`Compiling builder package for: ${featureId}...`);
    const pkg = compileBuilderPackage(job, featureId);
    if (!pkg) {
        console.error("Cannot compile builder package. Feature may not be ready.");
        return;
    }
    // 3. Check bridge is not blocked
    const bridge = job.featureBridges?.[featureId];
    if (bridge?.status === "blocked") {
        console.error(`Feature ${featureId} is blocked: ${bridge.blocked_reason}`);
        return;
    }
    const appSlug = (job.appSpec?.title || "aes-app").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    console.log(`\n--- Step 1: Scaffold Target Repo ---\n`);
    // 4. Build with real code in isolated workspace
    const builder = new CodeBuilder();
    const { run, workspace, prSummary } = await builder.build(jobId, pkg);
    // 5. Scaffold the base repo structure FIRST, then the feature code is already there
    const scaffolder = new RepoScaffolder();
    scaffolder.scaffold(workspace.path, {
        app_name: job.appSpec?.title || "AES App",
        app_slug: appSlug,
    });
    // Re-commit with scaffold
    const { execSync } = await import("node:child_process");
    execSync("git add -A", { cwd: workspace.path, stdio: "pipe" });
    try {
        execSync(`git commit -m "[AES] scaffold: ${appSlug} base project"`, { cwd: workspace.path, stdio: "pipe" });
    }
    catch { /* nothing new to commit */ }
    console.log(`  Workspace: ${workspace.path}`);
    console.log(`  Branch:    ${workspace.branch}`);
    console.log(`  App:       ${appSlug}`);
    console.log(`\n--- Step 2: Generate Feature Code ---\n`);
    console.log(`  Feature:      ${pkg.feature_name}`);
    console.log(`  Capabilities: ${pkg.included_capabilities.length}`);
    console.log(`  Files created: ${run.files_created.length}`);
    console.log(`  Files modified: ${run.files_modified.length}`);
    console.log(`\n--- Step 3: Run Repo Checks ---\n`);
    // 6. Run repo checks
    const checkRunner = new CheckRunner();
    const checkResults = await checkRunner.runAll(workspace.path);
    run.check_results = checkResults;
    for (const check of checkResults) {
        if (check.skipped) {
            console.log(`  * ${check.check.padEnd(12)} skipped (${check.skip_reason})`);
        }
        else if (check.passed) {
            console.log(`  + ${check.check.padEnd(12)} passed  ${check.duration_ms}ms`);
        }
        else {
            console.log(`  - ${check.check.padEnd(12)} FAILED  ${check.duration_ms}ms`);
            // Show first 3 lines of output
            const lines = check.output.split("\n").slice(0, 3);
            lines.forEach(l => console.log(`    ${l}`));
        }
    }
    console.log(`\n--- Step 4: Framework Validation ---\n`);
    // 7. Framework validation
    const frameworkValidator = new FrameworkValidator();
    const frameworkResults = frameworkValidator.validateAll(workspace.path);
    for (const result of frameworkResults) {
        if (result.passed) {
            console.log(`  + ${result.check.padEnd(20)} ${result.detail}`);
        }
        else {
            console.log(`  - ${result.check.padEnd(20)} ${result.detail}`);
        }
    }
    const frameworkPassed = frameworkResults.every(r => r.passed);
    console.log(`\n--- Step 5: Post-Build Verification ---\n`);
    // 8. Post-build verification
    const verification = verifyBuild(jobId, pkg, run);
    run.scope_violations = verification.scope_violations;
    run.constraint_violations = verification.constraint_violations;
    run.verification_passed = verification.passed;
    if (verification.passed) {
        console.log(`  + Scope: clean`);
        console.log(`  + Constraints: met`);
        console.log(`  + Tests: ${run.test_results.filter(t => t.passed).length}/${run.test_results.length} passed`);
    }
    else {
        for (const v of verification.scope_violations)
            console.log(`  - [scope] ${v}`);
        for (const v of verification.constraint_violations)
            console.log(`  - [constraint] ${v}`);
    }
    console.log(`\n--- Step 6: Prepare Deployment ---\n`);
    // 9. Prepare deploy
    const deployManager = new DeployManager();
    const deployResult = await deployManager.prepareDeploy(workspace, {});
    for (const step of deployResult.steps_completed) {
        console.log(`  + ${step}`);
    }
    // 10. Persist everything
    const persistence = store.getPersistence();
    if (persistence) {
        try {
            await persistence.persistBuilderRun(run);
            for (const entry of verification.fix_trail_entries) {
                await persistence.persistFixTrail(entry);
            }
            // Persist framework validation as logs
            for (const result of frameworkResults) {
                await persistence.persistLog(jobId, {
                    timestamp: new Date().toISOString(),
                    gate: "framework_validation",
                    message: `${result.check}: ${result.passed ? "PASS" : "FAIL"} -- ${result.detail}`,
                    level: result.passed ? "info" : "error",
                    error_code: result.passed ? undefined : `FV_${result.check.toUpperCase()}`,
                });
            }
        }
        catch (err) {
            console.error(`Warning: persistence error: ${err.message}`);
        }
    }
    // 11. Summary
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  DEPLOYMENT SUMMARY`);
    console.log(`${"=".repeat(60)}\n`);
    console.log(`  Job:           ${jobId}`);
    console.log(`  Feature:       ${pkg.feature_name}`);
    console.log(`  Builder:       ${run.builder_model}`);
    console.log(`  Status:        ${run.status}`);
    console.log(`  Duration:      ${run.duration_ms}ms`);
    console.log(`  Workspace:     ${workspace.path}`);
    console.log(`  Branch:        ${workspace.branch}`);
    console.log();
    console.log(`  Files created:  ${run.files_created.length}`);
    console.log(`  Files modified: ${run.files_modified.length}`);
    console.log(`  Tests:          ${run.test_results.filter(t => t.passed).length}/${run.test_results.length} passed`);
    console.log(`  Checks:         ${checkResults.filter(c => c.passed || c.skipped).length}/${checkResults.length}`);
    console.log(`  Framework:      ${frameworkPassed ? "PASSED" : "FAILED"}`);
    console.log(`  Verification:   ${verification.passed ? "PASSED" : "REJECTED"}`);
    console.log(`  Deploy ready:   ${deployResult.success ? "YES" : "NO"}`);
    console.log();
    if (run.files_created.length > 0) {
        console.log(`  Files created:`);
        for (const f of run.files_created)
            console.log(`    + ${f}`);
        console.log();
    }
    // 12. Show what to do next
    console.log(`  NEXT STEPS:`);
    console.log(`  1. Inspect generated code: cd ${workspace.path}`);
    console.log(`  2. Review the diff: cd ${workspace.path} && git log --oneline && git diff HEAD~2`);
    console.log(`  3. Approve the build: aes approve-build ${jobId} ${featureId}`);
    if (deployResult.success) {
        console.log(`  4. To deploy manually:`);
        console.log(`     cd ${workspace.path}`);
        console.log(`     npm install`);
        console.log(`     npx vercel --yes`);
        console.log(`     npx vercel env pull .env.local`);
        console.log(`     npx convex deploy`);
        console.log(`     npx vercel deploy --prod`);
    }
    // 13. Show remaining blockers
    const blockers = [];
    if (!verification.passed)
        blockers.push("Post-build verification failed");
    if (!frameworkPassed)
        blockers.push("Framework validation failed");
    const failedChecks = checkResults.filter(c => !c.passed && !c.skipped);
    if (failedChecks.length > 0)
        blockers.push(`${failedChecks.length} repo check(s) failed`);
    if (!process.env.VERCEL_TOKEN)
        blockers.push("VERCEL_TOKEN not set — cannot auto-deploy");
    // Clerk works in keyless mode — no keys needed for dev/preview
    if (!process.env.NEXT_PUBLIC_CONVEX_URL)
        blockers.push("Convex URL not set — backend will not work");
    if (blockers.length > 0) {
        console.log(`\n  REMAINING BLOCKERS:`);
        for (const b of blockers)
            console.log(`    ! ${b}`);
    }
    else {
        console.log(`\n  + No blockers — ready for deployment`);
    }
    console.log();
    // Return the PR summary
    console.log(`\n--- PR Summary ---\n`);
    console.log(prSummary);
}
