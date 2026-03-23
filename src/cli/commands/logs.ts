import chalk from "chalk";
import { logHeader, logDivider } from "../logger.js";
import { getJobStore } from "../../store.js";

export async function logsCommand(
  jobId: string,
  options: { gate?: string; feature?: string }
): Promise<void> {
  const store = getJobStore();

  // Try memory first, then Postgres
  let logs = store.getLogs(jobId);
  if (!logs || logs.length === 0) {
    logs = await store.loadLogsFromPostgres(jobId);
  }

  if (!logs || logs.length === 0) {
    console.log(chalk.gray(`No logs found for ${jobId}.`));
    return;
  }

  let filtered = logs;

  if (options.gate) {
    filtered = filtered.filter((l: any) => l.gate === `gate_${options.gate}`);
  }

  if (options.feature) {
    filtered = filtered.filter((l: any) => (l.featureId || l.feature_id) === options.feature);
  }

  logHeader(`Logs for ${jobId}`);

  for (const entry of filtered) {
    const time = new Date(entry.timestamp).toLocaleTimeString();
    const gate = entry.gate ? chalk.cyan(`[${entry.gate}]`) : "";
    const feature = entry.feature_id
      ? chalk.magenta(`(${entry.feature_id})`)
      : "";
    console.log(`  ${chalk.gray(time)} ${gate} ${feature} ${entry.message}`);
  }

  logDivider();
  console.log(chalk.gray(`  ${filtered.length} log entries`));
}
