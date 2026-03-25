#!/usr/bin/env node

/**
 * AES Agent for Paperclip
 *
 * This script bridges Paperclip's task system to the AES governed software factory.
 * When Paperclip assigns a task, this script:
 * 1. Reads the task description from Paperclip's API (or CLI args as fallback)
 * 2. Sends it to AES as a build intent via POST /api/build
 * 3. Subscribes to the SSE stream for real-time progress
 * 4. Auto-confirms intent and auto-approves the app plan
 * 5. Posts the deployment URL back to the Paperclip task on completion
 *
 * Environment variables (set by Paperclip's process adapter):
 *   PAPERCLIP_TASK_ID    — the task ID
 *   PAPERCLIP_WAKE_REASON — why the agent was woken (task_assigned, heartbeat, mentioned)
 *   PAPERCLIP_API_URL    — Paperclip's API URL
 *   PAPERCLIP_API_KEY    — auth token for Paperclip API
 *   PAPERCLIP_AGENT_ID   — the agent's ID
 *   PAPERCLIP_COMPANY_ID — the company ID
 *   PAPERCLIP_RUN_ID     — the current run ID
 *
 * AES-specific:
 *   AES_API_URL          — AES Platform API URL (default: http://localhost:3100)
 */

// ─── Configuration ──────────────────────────────────────────────────

const AES_API_URL = process.env.AES_API_URL || "http://localhost:3100";
const PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL;
const PAPERCLIP_API_KEY = process.env.PAPERCLIP_API_KEY;
const PAPERCLIP_TASK_ID = process.env.PAPERCLIP_TASK_ID;
const PAPERCLIP_WAKE_REASON = process.env.PAPERCLIP_WAKE_REASON;
const PAPERCLIP_RUN_ID = process.env.PAPERCLIP_RUN_ID;

// ─── Logging ────────────────────────────────────────────────────────

function log(message: string) {
  // Paperclip captures stdout as the run log
  console.log(`[AES] ${message}`);
}

function logGate(gate: string, message: string) {
  console.log(`[AES][${gate}] ${message}`);
}

// ─── Paperclip API helpers ──────────────────────────────────────────

async function getTaskContent(): Promise<string> {
  // If we have Paperclip API access, fetch the task details
  if (PAPERCLIP_API_URL && PAPERCLIP_API_KEY && PAPERCLIP_TASK_ID) {
    try {
      const response = await fetch(
        `${PAPERCLIP_API_URL}/api/issues/${PAPERCLIP_TASK_ID}`,
        { headers: { Authorization: `Bearer ${PAPERCLIP_API_KEY}` } }
      );
      if (response.ok) {
        const task = (await response.json()) as Record<string, any>;
        // Use the task title + description as the build intent
        const content = task.body || task.title || task.description;
        if (content) return content;
      }
    } catch (err) {
      log(`Warning: Could not fetch task from Paperclip: ${err}`);
    }
  }

  // Fallback: read from command line args (useful for standalone testing)
  const args = process.argv.slice(2);
  if (args.length > 0) return args.join(" ");

  throw new Error(
    "No task content available. Set PAPERCLIP_TASK_ID or pass intent as argument."
  );
}

async function postComment(message: string): Promise<void> {
  if (!PAPERCLIP_API_URL || !PAPERCLIP_API_KEY || !PAPERCLIP_TASK_ID) return;

  try {
    await fetch(
      `${PAPERCLIP_API_URL}/api/issues/${PAPERCLIP_TASK_ID}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAPERCLIP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body: message }),
      }
    );
  } catch (err) {
    log(`Warning: Could not post comment to Paperclip: ${err}`);
  }
}

// ─── AES API helpers ────────────────────────────────────────────────

async function startBuild(intent: string): Promise<string> {
  log(`Starting build: "${intent}"`);

  const response = await fetch(`${AES_API_URL}/api/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AES build start failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as Record<string, any>;
  return data.jobId;
}

async function confirmIntent(jobId: string): Promise<void> {
  const response = await fetch(`${AES_API_URL}/api/jobs/${jobId}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    log(`Warning: Confirm request failed (${response.status})`);
  }
}

async function approvePlan(jobId: string): Promise<void> {
  const response = await fetch(`${AES_API_URL}/api/jobs/${jobId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    log(`Warning: Approve request failed (${response.status})`);
  }
}

async function getJobStatus(
  jobId: string
): Promise<Record<string, any> | null> {
  try {
    const response = await fetch(`${AES_API_URL}/api/jobs/${jobId}`);
    if (response.ok) {
      return (await response.json()) as Record<string, any>;
    }
  } catch {
    // Ignore — status check is best-effort
  }
  return null;
}

// ─── SSE stream reader ──────────────────────────────────────────────

/**
 * Subscribes to the AES job SSE stream and processes events.
 * Node.js does not have a native EventSource, so we use fetch with
 * a streaming body reader and manually parse the SSE protocol.
 *
 * The AES API sends named events:
 *   event: gate|step|success|fail|warn|pause|feature
 *   event: needs_confirmation|needs_approval
 *   event: complete|error
 */
async function streamProgress(jobId: string): Promise<string | null> {
  const response = await fetch(`${AES_API_URL}/api/jobs/${jobId}/stream`, {
    headers: { Accept: "text/event-stream" },
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE connection failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let deploymentUrl: string | null = null;
  let buffer = "";

  // Track current SSE event name (default is "message")
  let currentEvent = "message";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || ""; // keep incomplete line in buffer

    for (const line of lines) {
      // SSE protocol: "event: <name>" sets the event type
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      // SSE protocol: "data: <json>" carries the payload
      if (!line.startsWith("data: ")) {
        // Empty line resets event type, or it's a comment/other line
        if (line.trim() === "") currentEvent = "message";
        continue;
      }

      let data: Record<string, any>;
      try {
        data = JSON.parse(line.slice(6));
      } catch {
        continue; // Not valid JSON — skip
      }

      switch (currentEvent) {
        case "connected":
          log(`Connected to job stream: ${data.jobId}`);
          break;

        case "gate":
          logGate(data.gate, data.message);
          break;

        case "step":
          log(data.message);
          break;

        case "success":
          log(`✓ ${data.message}`);
          break;

        case "fail":
          log(`✗ ${data.message}`);
          break;

        case "warn":
          log(`⚠ ${data.message}`);
          break;

        case "pause":
          log(`⏸ ${data.message}`);
          break;

        case "feature":
          log(`Feature: ${data.name} → ${data.status}`);
          break;

        case "needs_confirmation":
          // Auto-confirm — the Paperclip task description IS the confirmed intent
          log("Intent classification complete. Auto-confirming...");
          if (data.statement) log(`  Statement: ${data.statement}`);
          await confirmIntent(jobId);
          log("Intent confirmed.");
          break;

        case "needs_approval":
          // Auto-approve the app plan
          log("App plan ready. Auto-approving...");
          if (data.data?.title) log(`  App: ${data.data.title}`);
          if (data.data?.features)
            log(`  Features: ${data.data.features.length || data.data.features}`);
          if (data.prompt) log(`  ${data.prompt}`);
          await approvePlan(jobId);
          log("Plan approved.");
          break;

        case "complete":
          log("Build complete!");
          if (data.features) log(`  Features built: ${data.features}`);
          if (data.error) log(`  Note: ${data.error}`);
          // The complete event may not include deploymentUrl directly.
          // Fetch the full job status to get it.
          const status = await getJobStatus(jobId);
          if (status?.deploymentUrl) {
            deploymentUrl = status.deploymentUrl;
          }
          // Release the reader — we're done
          reader.cancel();
          return deploymentUrl;

        case "error":
          throw new Error(data.message || "Build failed");

        default:
          // Unknown event type — log it for debugging
          log(`[${currentEvent}] ${JSON.stringify(data)}`);
      }

      // Reset event type after processing data line
      currentEvent = "message";
    }
  }

  // Stream ended without a complete event — check job status as fallback
  const finalStatus = await getJobStatus(jobId);
  if (finalStatus?.deploymentUrl) {
    deploymentUrl = finalStatus.deploymentUrl;
  }

  return deploymentUrl;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  try {
    log("AES Engineer agent starting...");
    log(`Wake reason: ${PAPERCLIP_WAKE_REASON || "manual"}`);
    if (PAPERCLIP_RUN_ID) log(`Paperclip run: ${PAPERCLIP_RUN_ID}`);
    log(`AES API: ${AES_API_URL}`);

    // 1. Get the task content
    const intent = await getTaskContent();
    log(`Intent: "${intent}"`);

    // 2. Start the AES build
    const jobId = await startBuild(intent);
    log(`Job ID: ${jobId}`);

    // 3. Stream progress (handles confirmation + approval gates automatically)
    const deploymentUrl = await streamProgress(jobId);

    // 4. Report result
    if (deploymentUrl) {
      log("");
      log("=== BUILD COMPLETE ===");
      log(`Deployment URL: ${deploymentUrl}`);
      await postComment(
        [
          "✅ **Build complete!**",
          "",
          `Deployment: ${deploymentUrl}`,
          `Run ID: \`${jobId}\``,
        ].join("\n")
      );
    } else {
      log("");
      log("=== BUILD COMPLETE (no deployment URL) ===");
      log(
        "Build succeeded but no deployment URL returned. Check GITHUB_TOKEN and VERCEL_TOKEN configuration."
      );
      await postComment(
        [
          "✅ **Build complete!**",
          "",
          "No deployment URL — check GITHUB_TOKEN and VERCEL_TOKEN configuration.",
          `Run ID: \`${jobId}\``,
        ].join("\n")
      );
    }

    process.exit(0);
  } catch (err: any) {
    log("");
    log("=== BUILD FAILED ===");
    log(`Error: ${err.message}`);
    await postComment(`❌ **Build failed**\n\nError: ${err.message}`);
    process.exit(1);
  }
}

main();
