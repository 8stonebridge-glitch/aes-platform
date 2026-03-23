import chalk from "chalk";
import {
  logHeader,
  logKeyValue,
  logFeatureStatus,
  logDivider,
} from "../logger.js";
import { getJobStore } from "../../store.js";

export async function statusCommand(jobId?: string): Promise<void> {
  const store = getJobStore();

  // Try memory first, then Postgres
  let job = jobId ? store.get(jobId) : store.getLatest();
  if (!job && jobId) {
    job = await store.loadFromPostgres(jobId) || undefined;
  }

  if (!job) {
    // List available jobs from Postgres
    const pgJobs = await store.listFromPostgres();
    if (pgJobs.length > 0) {
      console.log(chalk.gray("No active in-memory job. Recent persisted jobs:"));
      for (const j of pgJobs.slice(0, 5)) {
        console.log(`  ${chalk.cyan(j.job_id)} — ${j.raw_request} (${j.created_at})`);
      }
      console.log(chalk.gray(`\nUse: aes status <job-id> or aes replay <job-id>`));
    } else {
      console.log(chalk.gray("No jobs found."));
    }
    return;
  }

  logHeader(`Job: ${job.jobId}`);
  logKeyValue("Status", job.currentGate);
  logKeyValue("Durability", job.durability || "memory_only");
  logKeyValue("Request", job.rawRequest);
  logKeyValue("Created", new Date(job.createdAt).toLocaleString());

  if (job.intentBrief) {
    logKeyValue("App Class", job.intentBrief.inferred_app_class);
    logKeyValue("Risk", job.intentBrief.inferred_risk_class);
    logKeyValue("Confirmed", job.intentConfirmed ? "Yes" : "No");
  }

  if (job.appSpec) {
    logKeyValue("App", job.appSpec.title);
    logKeyValue("Features", `${job.appSpec.features?.length || 0}`);
    logKeyValue("User Approved", job.userApproved ? "Yes" : "No");
  }

  if (job.featureBuildOrder && job.featureBuildOrder.length > 0) {
    console.log();
    logDivider();
    console.log(chalk.bold("  Features:"));
    for (const fId of job.featureBuildOrder) {
      const bridge = job.featureBridges?.[fId];
      const result = job.buildResults?.[fId] as Record<string, unknown> | undefined;
      const status = (result?.status as string) || bridge?.status || "pending";
      const name = bridge?.feature_name || fId;
      logFeatureStatus(fId, name, status);
    }
  }

  if (job.deploymentUrl) {
    console.log();
    logKeyValue("Deployed", job.deploymentUrl);
  }

  if (job.errorMessage) {
    console.log();
    logKeyValue("Error", chalk.red(job.errorMessage));
  }
}
