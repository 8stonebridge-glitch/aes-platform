#!/usr/bin/env node

import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { statusCommand } from "./commands/status.js";
import { approveCommand } from "./commands/approve.js";
import { logsCommand } from "./commands/logs.js";
import { abortCommand } from "./commands/abort.js";
import { replayCommand } from "./commands/replay.js";
import { viewCommand, summaryCommand } from "./commands/view.js";
import { resumeCommand } from "./commands/resume.js";
import { exportCommand } from "./commands/export.js";
import { buildFeatureCommand } from "./commands/build-feature.js";
import { demoCommand } from "./commands/demo.js";
import { approveBuildCommand } from "./commands/approve-build.js";

const program = new Command();

program
  .name("aes")
  .description("AES v12 — Governed Software Factory")
  .version("12.0.0");

program
  .command("build")
  .description("Build a new app or add a feature")
  .argument("<intent>", "What you want to build (e.g., 'internal approval portal')")
  .option("--app <app-id>", "Target existing app (for feature additions)")
  .action(buildCommand);

program
  .command("status")
  .description("Show current job status")
  .argument("[job-id]", "Specific job ID (defaults to latest)")
  .action(statusCommand);

program
  .command("approve")
  .description("Approve the current app plan")
  .argument("<job-id>", "Job ID to approve")
  .action(approveCommand);

program
  .command("logs")
  .description("Show build logs for a job")
  .argument("<job-id>", "Job ID")
  .option("--gate <gate>", "Filter by gate (0-5)")
  .option("--feature <feature-id>", "Filter by feature")
  .action(logsCommand);

program
  .command("abort")
  .description("Abort a running job")
  .argument("<job-id>", "Job ID to abort")
  .action(abortCommand);

program
  .command("replay")
  .description("Replay a prior run from Postgres (no re-execution)")
  .argument("<job-id>", "Job ID to replay")
  .action(replayCommand);

program
  .command("view")
  .description("Show rich terminal summary for a job")
  .argument("<job-id>", "Job ID to view")
  .action(viewCommand);

program
  .command("summary")
  .description("Show table of all recent jobs")
  .action(summaryCommand);

program
  .command("resume")
  .description("Resume a job from its last durable checkpoint")
  .argument("<job-id>", "Job ID to resume")
  .action(resumeCommand);

program
  .command("export")
  .description("Export builder-ready artifact as JSON")
  .argument("<job-id>", "Job ID")
  .argument("[feature-id]", "Feature ID (required if multiple features)")
  .action(exportCommand);

program
  .command("build-feature")
  .description("Build a single feature from a completed pipeline run")
  .argument("<job-id>", "Job ID")
  .argument("<feature-id>", "Feature ID to build")
  .option("--approve-merge", "Approve merge (requires explicit human approval)")
  .action((jobId: string, featureId: string, opts: { approveMerge?: boolean }) => {
    return buildFeatureCommand(jobId, featureId, opts);
  });

program
  .command("approve-build")
  .description("Approve a built feature for merge")
  .argument("<job-id>", "Job ID")
  .argument("<feature-id>", "Feature ID to approve")
  .action((jobId: string, featureId: string) => {
    return approveBuildCommand(jobId, featureId);
  });

program
  .command("demo")
  .description("End-to-end demo: pipeline + first feature build")
  .action(demoCommand);

program.parse();
