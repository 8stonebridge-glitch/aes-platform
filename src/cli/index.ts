#!/usr/bin/env node

import { Command } from "commander";
import { buildCommand } from "./commands/build.js";
import { statusCommand } from "./commands/status.js";
import { approveCommand } from "./commands/approve.js";
import { logsCommand } from "./commands/logs.js";
import { abortCommand } from "./commands/abort.js";

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

program.parse();
