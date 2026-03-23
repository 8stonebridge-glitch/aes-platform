/**
 * aes build-feature <job-id> <feature-id>
 *
 * Builds a single feature from a completed pipeline run.
 * Consumes the BuilderPackage, runs the template builder, verifies output, persists results.
 */
import { getJobStore } from "../../store.js";
import { compileBuilderPackage } from "../../builder-artifact.js";
import { TemplateBuilder, hashPackage } from "../../builder/builder-engine.js";
import { verifyBuild } from "../../builder/build-verifier.js";

export async function buildFeatureCommand(jobId: string, featureId: string) {
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

  const builder = new TemplateBuilder();
  const run = await builder.build(jobId, pkg);

  // 5. Persist initial run record
  const persistence = store.getPersistence();
  if (persistence) {
    try {
      await persistence.persistBuilderRun(run);
      console.log(`Builder run persisted: ${run.run_id}`);
    } catch (err: any) {
      console.error(`Warning: Failed to persist builder run: ${err.message}`);
    }
  }

  // 6. Post-build verification
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
    for (const v of verification.scope_violations) console.error(`  [scope] ${v}`);
    for (const v of verification.constraint_violations) console.error(`  [constraint] ${v}`);
  } else {
    console.log(`Verification PASSED`);
  }

  // 7. Update run status in Postgres
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
      });
    } catch (err: any) {
      console.error(`Warning: Failed to update builder run: ${err.message}`);
    }

    // 8. Persist FixTrail entries if verification failed
    for (const entry of verification.fix_trail_entries) {
      try {
        await persistence.persistFixTrail(entry);
        console.log(`  FixTrail entry created: ${entry.error_code}`);
      } catch (err: any) {
        console.error(`Warning: Failed to persist FixTrail: ${err.message}`);
      }
    }
  }

  // 9. Print summary
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
  console.log(`Verification: ${run.verification_passed ? "PASSED" : "REJECTED"}`);
  if (run.failure_reason) console.log(`Failure:      ${run.failure_reason}`);
  console.log();

  if (run.files_created.length > 0) {
    console.log(`Files that would be created:`);
    for (const f of run.files_created) console.log(`  + ${f}`);
  }
  if (run.files_modified.length > 0) {
    console.log(`Files that would be modified:`);
    for (const f of run.files_modified) console.log(`  ~ ${f}`);
  }
}
