import chalk from "chalk";
import {
  logHeader,
  logKeyValue,
  logFeatureStatus,
  logDivider,
  logSuccess,
  logFail,
  logWarn,
  logStep,
  logGate,
} from "../logger.js";
import { getJobStore } from "../../store.js";

/**
 * Replay a prior run from Postgres without re-executing anything.
 * Reconstructs and displays the full gate-by-gate trace.
 */
export async function replayCommand(jobId: string): Promise<void> {
  const store = getJobStore();

  // Try to load from Postgres
  const job = await store.loadFromPostgres(jobId);

  if (!job) {
    console.log(chalk.red(`Job ${jobId} not found in memory or Postgres.`));
    return;
  }

  logHeader(`Replay: ${job.jobId}`);
  logKeyValue("Request", job.rawRequest);
  logKeyValue("Created", job.createdAt);
  logDivider();

  // Gate 0 — Intent
  logGate("gate_0", "Intent Classification");
  if (job.intentBrief) {
    logKeyValue("App Class", job.intentBrief.inferred_app_class);
    logKeyValue("Risk", job.intentBrief.inferred_risk_class);
    logKeyValue("Platforms", (job.intentBrief.inferred_platforms || []).join(", "));
    if (job.intentBrief.inferred_integrations?.length > 0) {
      logKeyValue("Integrations", job.intentBrief.inferred_integrations.join(", "));
    }
    if (job.intentBrief.ambiguity_flags?.length > 0) {
      logWarn(`Ambiguity: ${job.intentBrief.ambiguity_flags.join(", ")}`);
    }
    logKeyValue("Confirmation", job.intentBrief.confirmation_status);
    logStep(job.intentBrief.confirmation_statement);
  } else {
    logFail("No intent brief recorded");
  }

  // Gate 1 — AppSpec
  if (job.appSpec) {
    console.log();
    logGate("gate_1", "AppSpec Decomposition");
    logKeyValue("Title", job.appSpec.title);
    logKeyValue("Features", `${job.appSpec.features?.length || 0}`);
    logKeyValue("Roles", `${job.appSpec.roles?.length || 0}`);
    logKeyValue("Confidence", `${((job.appSpec.confidence?.overall || 0) * 100).toFixed(0)}%`);

    if (job.appSpec.features) {
      console.log();
      for (const f of job.appSpec.features) {
        logFeatureStatus(f.feature_id, f.name, f.status || "proposed");
      }
    }

    // Validation results
    if (job.specValidationResults && job.specValidationResults.length > 0) {
      console.log();
      logGate("gate_1", "Validation Results");
      for (const r of job.specValidationResults) {
        if (r.passed) {
          logSuccess(r.code);
        } else {
          logFail(`${r.code}: ${r.reason || "failed"}`);
        }
      }
    }

    // Approval
    if (job.userApproved !== undefined) {
      console.log();
      logKeyValue("User Approved", job.userApproved ? chalk.green("Yes") : chalk.red("No"));
    }
  }

  // Gate 2 — Bridges
  if (job.featureBridges && Object.keys(job.featureBridges).length > 0) {
    console.log();
    logGate("gate_2", "Feature Bridges");

    for (const [fId, bridge] of Object.entries(job.featureBridges) as [string, any][]) {
      if (!bridge.bridge_id) continue;
      const reuse = bridge.selected_reuse_assets?.length || 0;
      const rules = bridge.applied_rules?.length || 0;
      const tests = bridge.required_tests?.length || 0;
      const conf = bridge.confidence?.overall
        ? `${(bridge.confidence.overall * 100).toFixed(0)}%`
        : "?";
      logFeatureStatus(fId, bridge.feature_name || fId, bridge.status);
      logStep(`${reuse} reuse, ${rules} rules, ${tests} tests, ${conf} confidence`);
    }
  }

  // Gate 3 — Vetoes
  if (job.vetoResults && job.vetoResults.length > 0) {
    console.log();
    logGate("gate_3", "Hard Vetoes");

    const triggered = job.vetoResults.filter((v: any) => v.triggered);
    const clean = job.vetoResults.filter((v: any) => !v.triggered);

    if (triggered.length > 0) {
      for (const v of triggered) {
        logFail(`${(v as any).code}: ${(v as any).reason}`);
      }
    }
    logKeyValue("Checked", `${job.vetoResults.length}`);
    logKeyValue("Triggered", `${triggered.length}`);
    logKeyValue("Clean", `${clean.length}`);
  }

  // Final status
  console.log();
  logDivider();
  logKeyValue("Final State", job.currentGate);
  if (job.errorMessage) {
    logKeyValue("Error", chalk.red(job.errorMessage));
  }
  if (job.deploymentUrl) {
    logKeyValue("Deployed", job.deploymentUrl);
  }

  // Logs summary
  const logs = await store.loadLogsFromPostgres(jobId);
  if (logs.length > 0) {
    console.log();
    logKeyValue("Log entries", `${logs.length}`);
    logStep(`Use ${chalk.cyan(`aes logs ${jobId}`)} to view full logs`);
  }
}
