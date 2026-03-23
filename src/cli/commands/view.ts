import chalk from "chalk";
import { getJobStore } from "../../store.js";
import { CURRENT_SCHEMA_VERSION } from "../../types/artifacts.js";
import type { FeatureBridge, VetoResult, FixTrailEntry } from "../../types/artifacts.js";

function box(title: string): string {
  const inner = `  AES Run Viewer -- ${title}  `;
  const width = inner.length;
  const top = chalk.cyan(`+${"=".repeat(width)}+`);
  const mid = chalk.cyan(`|`) + chalk.bold.white(inner) + chalk.cyan(`|`);
  const bot = chalk.cyan(`+${"=".repeat(width)}+`);
  return `${top}\n${mid}\n${bot}`;
}

export async function viewCommand(jobId: string): Promise<void> {
  const store = getJobStore();

  let job = store.get(jobId);
  if (!job) {
    job = (await store.loadFromPostgres(jobId)) || undefined;
  }
  if (!job) {
    console.log(chalk.red(`Job ${jobId} not found.`));
    return;
  }

  console.log();
  console.log(box(job.jobId));
  console.log();

  // ─── INTENT ──────────────────────────────────────────────
  console.log(chalk.bold.white("INTENT"));
  console.log(`  ${chalk.gray("Raw request:")}    ${job.rawRequest || "N/A"}`);
  if (job.intentBrief) {
    const ib = job.intentBrief;
    console.log(`  ${chalk.gray("App class:")}      ${ib.inferred_app_class}`);
    console.log(`  ${chalk.gray("Risk class:")}     ${ib.inferred_risk_class}`);
    console.log(`  ${chalk.gray("Platforms:")}      ${(ib.inferred_platforms || []).join(", ")}`);
    console.log(`  ${chalk.gray("Confirmation:")}   ${ib.confirmation_status}`);
  }
  console.log();

  // ─── APP SPEC ────────────────────────────────────────────
  if (job.appSpec) {
    const spec = job.appSpec;
    console.log(chalk.bold.white("APP SPEC"));
    console.log(`  ${chalk.gray("Title:")}          ${spec.title}`);
    console.log(`  ${chalk.gray("Features:")}       ${spec.features?.length || 0}`);
    console.log(`  ${chalk.gray("Roles:")}          ${spec.roles?.length || 0} (${(spec.roles || []).map((r: any) => r.name).join(", ")})`);
    console.log(`  ${chalk.gray("Entities:")}       ${(spec.domain_entities || []).length}`);
    console.log(`  ${chalk.gray("Workflows:")}      ${(spec.workflows || []).length}`);
    console.log(`  ${chalk.gray("Integrations:")}   ${(spec.integrations || []).length}`);
    console.log(`  ${chalk.gray("Confidence:")}     ${spec.confidence?.overall ?? "N/A"}`);
    console.log();
  }

  // ─── GATE 1 — VALIDATION ─────────────────────────────────
  if (job.specValidationResults && job.specValidationResults.length > 0) {
    const results = job.specValidationResults;
    const passed = results.filter((r) => r.passed);
    const failed = results.filter((r) => !r.passed);

    console.log(chalk.bold.white(`GATE 1 -- VALIDATION (${passed.length}/${results.length} passed)`));
    for (const r of results) {
      if (r.passed) {
        console.log(`  ${chalk.green("+")} ${r.code}`);
      } else {
        console.log(`  ${chalk.red("x")} ${r.code}: ${chalk.red(r.reason || "failed")}`);
      }
    }
    console.log();
  }

  // ─── GATE 2 — BRIDGES ────────────────────────────────────
  if (job.featureBridges && Object.keys(job.featureBridges).length > 0) {
    const bridges = Object.values(job.featureBridges) as FeatureBridge[];
    const compiled = bridges.filter((b) => b.bridge_id);
    console.log(chalk.bold.white(`GATE 2 -- BRIDGES (${compiled.length} compiled)`));
    for (const b of compiled) {
      const reuseCount = b.selected_reuse_assets?.length || 0;
      const conf = b.confidence?.overall ? (b.confidence.overall * 100).toFixed(0) + "%" : "?";
      const statusIcon = b.status === "blocked" ? chalk.red("x") : chalk.green("+");
      const line = `  ${statusIcon} ${b.feature_name.padEnd(25)} confidence: ${conf}  reuse: ${reuseCount} asset${reuseCount !== 1 ? "s" : ""}`;
      if (b.status === "blocked") {
        console.log(chalk.red(line));
        console.log(chalk.red(`    blocked: ${b.blocked_reason}`));
      } else {
        console.log(line);
      }
    }
    console.log();
  }

  // ─── GATE 3 — VETOES ─────────────────────────────────────
  if (job.vetoResults && job.vetoResults.length > 0) {
    const triggered = job.vetoResults.filter((v: VetoResult) => v.triggered);
    console.log(chalk.bold.white("GATE 3 -- VETOES"));
    if (triggered.length === 0) {
      console.log(`  ${chalk.green("+")} All bridges passed (0 vetoes triggered)`);
    } else {
      for (const v of triggered) {
        console.log(`  ${chalk.red("x")} ${v.code}: ${chalk.red(v.reason)}`);
      }
      console.log(`  ${chalk.red(`${triggered.length} veto(es) triggered`)}`);
    }
    console.log();
  }

  // ─── FIXTRAIL ────────────────────────────────────────────
  const fixes = job.fixTrailEntries || [];
  console.log(chalk.bold.white(`FIXTRAIL (${fixes.length} ${fixes.length === 1 ? "entry" : "entries"})`));
  if (fixes.length > 0) {
    for (const f of fixes) {
      const statusColor =
        f.status === "repaired" ? chalk.green :
        f.status === "detected" ? chalk.yellow :
        f.status === "escalated" ? chalk.red :
        chalk.gray;
      console.log(`  ${statusColor(f.status.padEnd(12))} ${f.gate} ${f.error_code}: ${f.issue_summary}`);
    }
  }
  console.log();

  // ─── FOOTER ──────────────────────────────────────────────
  console.log(`${chalk.gray("DURABILITY:")} ${job.durability || "memory_only"}`);
  console.log(`${chalk.gray("SCHEMA VERSION:")} ${CURRENT_SCHEMA_VERSION}`);
  if (job.errorMessage) {
    console.log(`${chalk.gray("ERROR:")} ${chalk.red(job.errorMessage)}`);
  }
}

export async function summaryCommand(): Promise<void> {
  const store = getJobStore();

  // Try in-memory first, then Postgres
  let jobs = store.list();

  // Also load from Postgres
  const pgJobs = await store.listFromPostgres();

  // Merge: in-memory jobs take priority, add Postgres-only jobs
  const seenIds = new Set(jobs.map((j) => j.jobId));
  for (const pj of pgJobs) {
    if (!seenIds.has(pj.job_id)) {
      // Load full job for status
      const loaded = await store.loadFromPostgres(pj.job_id);
      if (loaded) {
        jobs.push(loaded);
      }
    }
  }

  if (jobs.length === 0) {
    console.log(chalk.gray("No jobs found."));
    return;
  }

  // Table header
  const hdr = [
    "JOB ID".padEnd(16),
    "APP CLASS".padEnd(30),
    "STATUS".padEnd(14),
    "DURABILITY".padEnd(12),
    "CREATED",
  ].join("");
  console.log(chalk.bold.white(hdr));
  console.log(chalk.gray("-".repeat(90)));

  // Sort by createdAt descending
  jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  for (const job of jobs.slice(0, 20)) {
    const appClass = job.intentBrief?.inferred_app_class || "unknown";
    const gate = job.currentGate || "unknown";
    const durability = job.durability || "memory_only";
    const created = job.createdAt
      ? new Date(job.createdAt).toISOString().replace("T", " ").slice(0, 19)
      : "unknown";

    const statusColor =
      gate.includes("fail") ? chalk.red :
      gate === "gate_3" ? chalk.green :
      chalk.yellow;

    console.log([
      chalk.cyan(job.jobId.slice(0, 14).padEnd(16)),
      appClass.slice(0, 28).padEnd(30),
      statusColor(gate.padEnd(14)),
      durability.padEnd(12),
      created,
    ].join(""));
  }
}
