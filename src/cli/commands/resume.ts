import chalk from "chalk";
import { getJobStore } from "../../store.js";
import type { FeatureBridge } from "../../types/artifacts.js";

export async function resumeCommand(jobId: string): Promise<void> {
  const store = getJobStore();

  // Initialize persistence if needed
  if (!store.hasPersistence()) {
    const pgUrl = process.env.AES_POSTGRES_URL;
    if (pgUrl) {
      try {
        const { PersistenceLayer } = await import("../../persistence.js");
        const persistence = new PersistenceLayer(pgUrl);
        await persistence.initialize();
        store.setPersistence(persistence);
      } catch (err: any) {
        console.log(chalk.red(`Cannot connect to Postgres: ${err.message}`));
        return;
      }
    }
  }

  const job = await store.loadFromPostgres(jobId);

  if (!job) {
    console.log(chalk.red(`Job ${jobId} not found in Postgres.`));
    return;
  }

  if (job.durability !== "confirmed") {
    console.log(chalk.red(`Cannot resume: durability is "${job.durability}" (must be "confirmed").`));
    return;
  }

  // Check for blocked bridges
  const blockedBridges = Object.values(job.featureBridges || {})
    .filter((b: FeatureBridge) => b.status === "blocked");
  if (blockedBridges.length > 0) {
    console.log(chalk.red(`Cannot resume: ${blockedBridges.length} bridge(s) are blocked:`));
    for (const b of blockedBridges) {
      console.log(`  ${chalk.red("-")} ${(b as FeatureBridge).feature_name}: ${(b as FeatureBridge).blocked_reason}`);
    }
    return;
  }

  // Determine resume point
  const hasIntent = !!job.intentBrief;
  const hasSpec = !!job.appSpec;
  const hasApproval = job.userApproved;
  const hasBridges = Object.keys(job.featureBridges || {}).length > 0;
  const hasVetoes = (job.vetoResults || []).length > 0;

  let resumeGate: string;
  if (!hasIntent) {
    resumeGate = "gate_0";
  } else if (!hasSpec) {
    resumeGate = "gate_1_decompose";
  } else if (!hasApproval) {
    resumeGate = "gate_1_approve";
  } else if (!hasBridges) {
    resumeGate = "gate_2";
  } else if (!hasVetoes) {
    resumeGate = "gate_3";
  } else {
    console.log(chalk.green("Run is complete. Nothing to resume."));
    return;
  }

  console.log(chalk.cyan(`Resuming job ${jobId} from: ${chalk.bold(resumeGate)}`));
  console.log(chalk.gray("To re-run the graph from this point, use:"));
  console.log(chalk.gray(`  aes build --resume ${jobId}`));
  console.log();
  console.log(chalk.gray("Resume state:"));
  console.log(`  ${chalk.gray("Intent:")}    ${hasIntent ? chalk.green("present") : chalk.red("missing")}`);
  console.log(`  ${chalk.gray("AppSpec:")}   ${hasSpec ? chalk.green("present") : chalk.red("missing")}`);
  console.log(`  ${chalk.gray("Approved:")}  ${hasApproval ? chalk.green("yes") : chalk.red("no")}`);
  console.log(`  ${chalk.gray("Bridges:")}   ${hasBridges ? chalk.green(`${Object.keys(job.featureBridges || {}).length} compiled`) : chalk.red("none")}`);
  console.log(`  ${chalk.gray("Vetoes:")}    ${hasVetoes ? chalk.green(`${(job.vetoResults || []).length} checked`) : chalk.red("not run")}`);
}

/**
 * Determine the resume gate from a loaded job record.
 * Exported for testing and orchestration use.
 */
export function determineResumeGate(job: {
  intentBrief?: unknown;
  appSpec?: unknown;
  userApproved?: boolean;
  featureBridges?: Record<string, unknown>;
  vetoResults?: unknown[];
  durability?: string;
}): string | null {
  if (job.durability !== "confirmed") return null;

  const hasIntent = !!job.intentBrief;
  const hasSpec = !!job.appSpec;
  const hasApproval = job.userApproved;
  const hasBridges = Object.keys(job.featureBridges || {}).length > 0;
  const hasVetoes = (job.vetoResults || []).length > 0;

  // Check for blocked bridges
  const blockedBridges = Object.values(job.featureBridges || {})
    .filter((b: any) => b.status === "blocked");
  if (blockedBridges.length > 0) return "blocked";

  if (!hasIntent) return "gate_0";
  if (!hasSpec) return "gate_1_decompose";
  if (!hasApproval) return "gate_1_approve";
  if (!hasBridges) return "gate_2";
  if (!hasVetoes) return "gate_3";
  return "complete";
}
