import chalk from "chalk";
import { logSuccess, logFail } from "../logger.js";
import { getJobStore } from "../../store.js";

export async function abortCommand(jobId: string): Promise<void> {
  const store = getJobStore();
  const job = store.get(jobId);

  if (!job) {
    logFail(`Job ${jobId} not found`);
    return;
  }

  if (job.currentGate === "complete" || job.currentGate === "failed") {
    logFail(`Job ${jobId} already finished (${job.currentGate})`);
    return;
  }

  store.update(jobId, {
    currentGate: "failed",
    errorMessage: "Aborted by user",
  });

  logSuccess(`Job ${jobId} aborted.`);
}
