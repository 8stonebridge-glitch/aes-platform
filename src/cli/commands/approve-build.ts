/**
 * aes approve-build <job-id> <feature-id>
 *
 * Approves a built feature for merge.
 * Requires: verification passed, build succeeded, no failed repo checks.
 */
import { getJobStore } from "../../store.js";
import { CURRENT_SCHEMA_VERSION } from "../../types/artifacts.js";

export async function approveBuildCommand(jobId: string, featureId: string) {
  const store = getJobStore();
  const job = await store.loadFromPostgres(jobId);

  if (!job) {
    console.error("Job not found.");
    return;
  }

  // Find the builder run for this feature
  const runs = job.builderRuns || [];
  const run = runs.find(r => r.feature_id === featureId && r.status === "build_succeeded");

  if (!run) {
    console.error(`No successful build found for feature ${featureId}`);
    const latestRun = runs.find(r => r.feature_id === featureId);
    if (latestRun) {
      console.error(`Latest build status: ${latestRun.status}`);
      if (latestRun.failure_reason) console.error(`Reason: ${latestRun.failure_reason}`);
    }
    return;
  }

  // Check verification passed
  if (!run.verification_passed) {
    console.error("Cannot approve: post-build verification did not pass.");
    if (run.scope_violations.length > 0) {
      console.error("Scope violations:");
      run.scope_violations.forEach(v => console.error(`  - ${v}`));
    }
    if (run.constraint_violations.length > 0) {
      console.error("Constraint violations:");
      run.constraint_violations.forEach(v => console.error(`  - ${v}`));
    }
    return;
  }

  // Check repo checks passed (if any were run and not skipped)
  const failedChecks = (run.check_results || []).filter(c => !c.passed && !c.skipped);
  if (failedChecks.length > 0) {
    console.error("Cannot approve: repo checks failed:");
    failedChecks.forEach(c => console.error(`  - ${c.check}: ${c.output.substring(0, 200)}`));
    return;
  }

  // Approve
  console.log(`\nApproving build for feature: ${run.feature_name}`);
  console.log(`  Run ID:    ${run.run_id}`);
  console.log(`  Branch:    ${run.branch}`);
  console.log(`  Files:     ${run.files_created.length} created, ${run.files_modified.length} modified`);
  console.log(`  Tests:     ${run.test_results.filter(t => t.passed).length}/${run.test_results.length} passed`);
  console.log(`  Checks:    ${(run.check_results || []).filter(c => c.passed || c.skipped).length}/${(run.check_results || []).length}`);
  console.log();

  // Persist approval
  const persistence = store.getPersistence();
  if (persistence) {
    try {
      await persistence.persistApproval({
        job_id: jobId,
        app_spec_id: run.run_id,
        approval_type: "build_merge_approval",
        approved: true,
        user_comment: `Approved build for ${run.feature_name}`,
        schema_version: CURRENT_SCHEMA_VERSION,
        created_at: new Date().toISOString(),
      });

      // Update builder run status
      await persistence.updateBuilderRunStatus(run.run_id, "build_approved", {
        completed_at: new Date().toISOString(),
      });

      console.log("Build APPROVED for merge.");
      console.log(`\nTo inspect the generated code:`);
      if (run.workspace_id) {
        console.log(`  cd ${run.workspace_id}`);
        console.log(`  git log --oneline`);
        console.log(`  git diff HEAD~1`);
      }
      console.log(`\nMerge is not yet automated. Review and merge manually.`);
    } catch (err: any) {
      console.error(`Failed to persist approval: ${err.message}`);
    }
  } else {
    // No persistence — just update in-memory
    run.status = "build_approved";
    console.log("Build APPROVED for merge (in-memory only, no persistence configured).");
    console.log(`\nMerge is not yet automated. Review and merge manually.`);
  }
}
