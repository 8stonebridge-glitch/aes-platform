import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { runGraph, type GraphCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { getLLMSemaphoreStats, resetLLMSemaphore } from "../llm/provider.js";
import { CANARY_DEFINITIONS } from "../canary-definitions.js";
import { resumeCompileGate } from "../nodes/deployment-handler.js";

const app = express();
app.use(cors());
app.use(express.json());

// ─── API key authentication middleware ─────────────────────────────
const AES_API_KEY = process.env.AES_API_KEY;

function apiKeyAuth(req: express.Request, res: express.Response, next: express.NextFunction): void {
  // Skip auth if no API key is configured (local development)
  if (!AES_API_KEY) {
    next();
    return;
  }

  // Allow health check without auth
  if (req.method === "GET" && req.path === "/api/health") {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  const apiKeyHeader = req.headers["x-api-key"] as string | undefined;

  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : apiKeyHeader;

  if (token === AES_API_KEY) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}

app.use(apiKeyAuth);

async function ensurePersistenceIfConfigured() {
  const store = getJobStore();
  if (store.hasPersistence()) return;
  const pgUrl = process.env.AES_POSTGRES_URL;
  if (!pgUrl) return;
  try {
    const { PersistenceLayer } = await import("../persistence.js");
    const persistence = new PersistenceLayer(pgUrl);
    await persistence.initialize();
    store.setPersistence(persistence);
  } catch (err: any) {
    console.error("[server] Failed to initialize Postgres persistence:", err?.message || err);
  }
}

// Active job streams (Server-Sent Events)
const jobStreams = new Map<string, express.Response[]>();

// Event buffer — stores events so clients connecting late get a full replay
const jobEventBuffer = new Map<string, { event: string; data: any }[]>();
const MAX_EVENT_BUFFERS = 200;
const APPROVAL_SIGNAL_APPROVED = "__approval_signal__:approved";
const APPROVAL_SIGNAL_REJECTED = "__approval_signal__:rejected";

function evictEventBuffers(): void {
  if (jobEventBuffer.size <= MAX_EVENT_BUFFERS) return;
  const keys = [...jobEventBuffer.keys()];
  const toRemove = keys.slice(0, keys.length - MAX_EVENT_BUFFERS);
  for (const k of toRemove) {
    jobEventBuffer.delete(k);
    jobStreams.delete(k);
  }
}

// ─── Convex sync — push status updates to Convex for real-time UI ───
const CONVEX_SITE_URL = process.env.AES_CONVEX_SITE_URL || "";

async function pushToConvex(path: string, body: any) {
  if (!CONVEX_SITE_URL) return;
  try {
    await fetch(`${CONVEX_SITE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Convex sync is best-effort — don't block the pipeline
  }
}

function syncJobToConvex(jobId: string) {
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) return;
  pushToConvex("/push-status", {
    jobId,
    intent: job.rawRequest,
    currentGate: job.currentGate,
    intentConfirmed: job.intentConfirmed,
    userApproved: job.userApproved,
    autonomous: job.autonomous,
    targetPath: job.targetPath,
    deployTarget: job.deployTarget,
    previewUrl: job.previewUrl,
    features: Object.keys(job.featureBridges || {}),
    featureBridges: job.featureBridges,
    appSpec: job.appSpec ? {
      title: job.appSpec.title,
      app_class: job.appSpec.app_class,
      features: job.appSpec.features?.length,
      roles: job.appSpec.roles?.length,
      confidence: job.appSpec.confidence,
    } : null,
    vetoResults: job.vetoResults,
    errorMessage: job.errorMessage,
  });
}

async function readApprovalSignal(jobId: string): Promise<boolean | null> {
  const store = getJobStore();
  if (!store.hasPersistence()) return null;

  try {
    const logs = await store.loadLogsFromPostgres(jobId);
    for (let i = logs.length - 1; i >= 0; i--) {
      const message = logs[i]?.message;
      if (message === APPROVAL_SIGNAL_APPROVED) return true;
      if (message === APPROVAL_SIGNAL_REJECTED) return false;
    }
  } catch {
    // Cross-instance approval polling is best-effort.
  }

  return null;
}

function broadcastToJob(jobId: string, event: string, data: any) {
  const store = getJobStore();

  if (event === "gate" && typeof data?.gate === "string") {
    store.update(jobId, { currentGate: data.gate });
  } else if (event === "complete") {
    store.update(jobId, {
      currentGate: data?.error ? "failed" : "complete",
      previewUrl: data?.previewUrl || null,
      errorMessage: data?.error || null,
    });
  } else if (event === "error" || event === "fail") {
    store.update(jobId, {
      currentGate: "failed",
      errorMessage: data?.message || "Pipeline failed",
    });
  }

  // Buffer the event for late-connecting clients
  if (!jobEventBuffer.has(jobId)) { evictEventBuffers(); jobEventBuffer.set(jobId, []); }
  jobEventBuffer.get(jobId)!.push({ event, data });

  // Send to currently connected clients
  const clients = jobStreams.get(jobId) || [];
  for (const res of clients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // Push log entry to Convex
  pushToConvex("/push-log", {
    jobId,
    gate: event,
    message: data.message || data.gate || JSON.stringify(data),
    timestamp: new Date().toISOString(),
  });

  // Sync full job state to Convex on gate transitions and completion
  if (["gate", "complete", "error", "fail", "needs_approval", "needs_confirmation"].includes(event)) {
    syncJobToConvex(jobId);
  }
}

// ─── POST /api/build — Start a new build ───────────────────────────

app.post("/api/build", async (req, res) => {
  const { intent, targetPath, deployTarget, designMode, autonomous } = req.body;
  if (!intent || typeof intent !== "string") {
    res.status(400).json({ error: "intent is required" });
    return;
  }

  const resolvedDeployTarget =
    deployTarget === "cloudflare"
      ? "cloudflare"
      : deployTarget === "vercel"
        ? "vercel"
        : "local";
  const autonomousMode = autonomous === true;

  const jobId = `j-${randomUUID().slice(0, 8)}`;
  const requestId = `req-${randomUUID().slice(0, 8)}`;
  const resolvedTargetPath = typeof targetPath === "string" && targetPath.trim() ? targetPath.trim() : null;

  // Return immediately with job ID
  res.json({ jobId, requestId, status: "started" });

  // Sync initial state to Convex
  pushToConvex("/push-status", {
    jobId,
    intent,
    currentGate: "gate_0",
    intentConfirmed: false,
    userApproved: false,
    targetPath: resolvedTargetPath,
    deployTarget: resolvedDeployTarget,
    autonomous: autonomousMode,
    features: [],
  });

  // Run the pipeline in background
  const callbacks: GraphCallbacks = {
    onGate: (gate, message) => broadcastToJob(jobId, "gate", { gate, message }),
    onStep: (message) => broadcastToJob(jobId, "step", { message }),
    onSuccess: (message) => broadcastToJob(jobId, "success", { message }),
    onFail: (message) => broadcastToJob(jobId, "fail", { message }),
    onWarn: (message) => broadcastToJob(jobId, "warn", { message }),
    onPause: (message) => broadcastToJob(jobId, "pause", { message }),
    onFeatureStatus: (id, name, status) => broadcastToJob(jobId, "feature", { id, name, status }),
    onNeedsApproval: async (prompt, data) => {
      broadcastToJob(jobId, "needs_approval", { prompt, data });
      return new Promise((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(value);
        };

        const poll = async () => {
          if (settled) return;

          const store = getJobStore();
          const job = store.get(jobId);
          if (job?.userApproved === true) {
            settle(true);
            return;
          } else if (job?.userApproved === false || job?.errorMessage) {
            settle(false);
            return;
          }

          const persistedSignal = await readApprovalSignal(jobId);
          if (persistedSignal !== null) {
            settle(persistedSignal);
            return;
          }

          setTimeout(() => { void poll(); }, 500);
        };

        const timeout = setTimeout(() => settle(false), 300000);
        void poll();
      });
    },
    onNeedsConfirmation: async (statement, questions) => {
      broadcastToJob(jobId, "needs_confirmation", { statement, questions: questions ?? [] });
      return new Promise((resolve) => {
        const store = getJobStore();
        const check = setInterval(() => {
          const job = store.get(jobId);
          if (job?.intentConfirmed === true) {
            clearInterval(check);
            resolve(true);
          } else if (job?.intentConfirmed === false || job?.errorMessage) {
            clearInterval(check);
            resolve(false);
          }
        }, 500);
        setTimeout(() => { clearInterval(check); resolve(false); }, 300000);
      });
    },
  };

  try {
    const result = await runGraph(
      {
        jobId,
        requestId,
        rawRequest: intent,
        currentGate: "gate_0",
        targetPath: resolvedTargetPath,
        deployTarget: resolvedDeployTarget,
        autonomous: autonomousMode,
        designMode: designMode === "paper" ? "paper" : "auto",
      },
      callbacks
    );
    broadcastToJob(jobId, "complete", {
      gate: result.currentGate,
      features: Object.keys(result.featureBridges || {}).length,
      error: result.errorMessage,
      previewUrl: result.previewUrl || null,
    });
    // Final sync to Convex with complete state
    syncJobToConvex(jobId);

    // Push pipeline outcome to Hermes for behavioral analysis
    // Prefer internal Railway URL for container-to-container communication
    const hermesUrl = process.env.HERMES_INTERNAL_URL || process.env.HERMES_URL || process.env.NEXT_PUBLIC_HERMES_URL;
    if (hermesUrl) {
      const store = getJobStore();
      const job = store.get(jobId);
      fetch(`${hermesUrl}/pipeline-outcome`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          success: !result.errorMessage && result.currentGate !== "failed",
          gate_reached: result.currentGate,
          error_message: result.errorMessage || null,
          app_class: result.intentBrief?.inferred_app_class || result.appSpec?.app_class || "unknown",
          risk_class: result.intentBrief?.inferred_risk_class || "unknown",
          ambiguity_flags: result.intentBrief?.ambiguity_flags || [],
          intent_confirmed: !!result.intentConfirmed,
          user_approved: !!result.userApproved,
          feature_count: Object.keys(result.featureBridges || {}).length,
        }),
      }).catch(() => {}); // best-effort
    }
  } catch (err: any) {
    broadcastToJob(jobId, "error", { message: err.message });
    syncJobToConvex(jobId);
  }
});

// ─── GET /api/jobs/:id/stream — SSE stream for real-time updates ───

app.get("/api/jobs/:id/stream", (req, res) => {
  const jobId = req.params.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  if (!jobStreams.has(jobId)) jobStreams.set(jobId, []);
  jobStreams.get(jobId)!.push(res);

  // Send initial connected event
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  // Replay any buffered events the client missed
  const buffered = jobEventBuffer.get(jobId) || [];
  for (const { event, data } of buffered) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  req.on("close", () => {
    const clients = jobStreams.get(jobId) || [];
    jobStreams.set(jobId, clients.filter((c) => c !== res));
  });
});

// ─── POST /api/jobs/:id/confirm — Confirm intent ──────────────────

app.post("/api/jobs/:id/confirm", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const clarification = req.body?.clarification as string | undefined;
  store.update(jobId, {
    intentConfirmed: true,
    clarification: clarification || undefined,
  });
  res.json({ confirmed: true, hasClarification: !!clarification });
});

// ─── GET /api/jobs/:id/design-brief — Get the design brief + Claude prompt ──

app.get("/api/jobs/:id/design-brief", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  if (!job.designBrief) {
    res.status(404).json({ error: "No design brief available — job may not be in paper design mode" });
    return;
  }
  res.json({
    brief: job.designBrief,
    claude_prompt: job.designBrief.claude_prompt,
    status: job.designEvidence ? "evidence_received" : "waiting_for_evidence",
  });
});

// ─── POST /api/jobs/:id/design-evidence — Submit design evidence ────

app.post("/api/jobs/:id/design-evidence", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const evidence = req.body;
  if (!evidence || !evidence.screens) {
    res.status(400).json({ error: "Invalid design evidence — must include screens array" });
    return;
  }

  // Store the evidence — the designer node is polling for this
  store.update(jobId, { designEvidence: evidence });
  broadcastToJob(jobId, "design_evidence_received", {
    screens: evidence.screens?.length || 0,
    components: evidence.components?.length || 0,
  });

  res.json({
    received: true,
    screens: evidence.screens?.length || 0,
    components: evidence.components?.length || 0,
    message: "Design evidence received — pipeline will resume automatically",
  });
});

// ─── POST /api/jobs/:id/approve — Approve app plan ────────────────

app.post("/api/jobs/:id/approve", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job && !store.hasPersistence()) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  if (job) {
    store.update(jobId, { userApproved: true });
  }
  store.addLog(jobId, { gate: "gate_1", message: APPROVAL_SIGNAL_APPROVED });
  res.json({ approved: true });
});

// ─── GET /api/jobs/:id — Get job status ────────────────────────────

app.get("/api/jobs/:id", async (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId) || await store.loadFromPostgres(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    jobId,
    currentGate: job.currentGate,
    intentConfirmed: job.intentConfirmed,
    userApproved: job.userApproved,
    autonomous: job.autonomous ?? false,
    targetPath: job.targetPath ?? null,
    deployTarget: job.deployTarget ?? "local",
    previewUrl: job.previewUrl ?? null,
    features: Object.keys(job.featureBridges || {}),
    featureBridges: job.featureBridges,
    appSpec: job.appSpec ? {
      title: job.appSpec.title,
      app_class: job.appSpec.app_class,
      features: job.appSpec.features?.length,
      roles: job.appSpec.roles?.length,
      confidence: job.appSpec.confidence,
    } : null,
    vetoResults: job.vetoResults,
    errorMessage: job.errorMessage,
  });
});

// ─── GET /api/jobs — List all jobs ─────────────────────────────────

app.get("/api/jobs", async (_req, res) => {
  const store = getJobStore();
  let jobs = store.list();

  // If memory is empty, fall back to persisted snapshots
  if (jobs.length === 0 && store.hasPersistence()) {
    const pgJobs = await store.listFromPostgres();
    const hydrated = pgJobs.map((j) => ({
      jobId: j.job_id,
      intent: j.raw_request,
      currentGate: j.current_gate || "unknown",
      features: 0,
      intentConfirmed: undefined,
      userApproved: undefined,
      autonomous: j.autonomous ?? false,
      targetPath: null,
      deployTarget: (j.deploy_target as any) || "local",
      previewUrl: j.preview_url || null,
      createdAt: j.created_at,
    }));
    return res.json(hydrated);
  }

  const response = jobs.map((j) => ({
    jobId: j.jobId,
    intent: j.rawRequest,
    currentGate: j.currentGate,
    features: Object.keys(j.featureBridges || {}).length,
    intentConfirmed: j.intentConfirmed,
    userApproved: j.userApproved,
    autonomous: j.autonomous ?? false,
    targetPath: j.targetPath ?? null,
    deployTarget: j.deployTarget ?? "local",
    previewUrl: j.previewUrl ?? null,
    createdAt: j.createdAt,
  }));
  res.json(response);
});

// ─── GET /api/jobs/:id/logs — Get job logs ─────────────────────────

app.get("/api/jobs/:id/logs", async (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  if (!store.get(jobId)) {
    await store.loadFromPostgres(jobId);
  }
  const logs = store.getLogs(jobId);
  res.json(logs || []);
});

// ─── GET /api/attention-queue — Attention items from live job data ──

interface AttentionItem {
  internal_id: string;
  artifact_type: string;
  artifact_id: string;
  sequence_number: number;
  payload: {
    status: string;
    build_id?: string;
    feature_id?: string;
    started_at?: string;
    queued_at?: string;
  };
}

app.get("/api/attention-queue", (_req, res) => {
  const store = getJobStore();
  const jobs = store.list();
  let seq = 0;

  const blocked_builds: AttentionItem[] = [];
  const pending_escalations: AttentionItem[] = [];
  const stale_bridges: AttentionItem[] = [];
  const verified_restricted_write_backs: AttentionItem[] = [];

  for (const job of jobs) {
    // Blocked builds: jobs with errorMessage or currentGate "failed"
    if (job.errorMessage || job.currentGate === "failed") {
      blocked_builds.push({
        internal_id: `attn-${++seq}`,
        artifact_type: "build",
        artifact_id: job.jobId,
        sequence_number: seq,
        payload: {
          status: job.errorMessage ? "error" : "failed",
          build_id: job.jobId,
          started_at: job.createdAt,
        },
      });
    }

    // Pending escalations: jobs needing approval (userApproved undefined, appSpec exists)
    if (job.appSpec && job.userApproved === undefined) {
      pending_escalations.push({
        internal_id: `attn-${++seq}`,
        artifact_type: "escalation",
        artifact_id: job.jobId,
        sequence_number: seq,
        payload: {
          status: "pending_approval",
          build_id: job.jobId,
          queued_at: job.createdAt,
        },
      });
    }
  }

  res.json({
    blocked_builds,
    pending_escalations,
    stale_bridges,
    verified_restricted_write_backs,
  });
});

// ─── GET /api/jobs/:id/features — Full feature list with bridges ───

app.get("/api/jobs/:id/features", async (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId) || await store.loadFromPostgres(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  const features = (job.appSpec?.features || []).map((f: any) => ({
    ...f,
    bridge: job.featureBridges?.[f.feature_id] ?? null,
  }));

  res.json({ jobId, features });
});

// ─── GET /api/jobs/:id/audit — Full audit trail ────────────────────

app.get("/api/jobs/:id/audit", async (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId) || await store.loadFromPostgres(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    jobId,
    logs: store.getLogs(jobId),
    fixTrailEntries: job.fixTrailEntries || [],
    builderRuns: job.builderRuns || [],
  });
});

// ─── POST /api/governance/escalations/:id/approve — Approve escalation ─

app.post("/api/governance/escalations/:id/approve", (req, res) => {
  const escalationJobId = req.params.id;
  const { decided_by, rationale } = req.body || {};
  const store = getJobStore();
  const job = store.get(escalationJobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  store.update(escalationJobId, { userApproved: true });
  store.addLog(escalationJobId, {
    gate: "governance",
    message: `Escalation approved by ${decided_by || "operator"}: ${rationale || "no rationale"}`,
    schema_version: 1,
  });

  res.json({ approved: true, jobId: escalationJobId, decided_by, rationale });
});

// ─── POST /api/governance/escalations/:id/reject — Reject escalation ──

app.post("/api/governance/escalations/:id/reject", (req, res) => {
  const escalationJobId = req.params.id;
  const { decided_by, rationale } = req.body || {};
  const store = getJobStore();
  const job = store.get(escalationJobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  store.update(escalationJobId, {
    userApproved: false,
    errorMessage: `Escalation rejected by ${decided_by || "operator"}: ${rationale || "no rationale"}`,
  });
  store.addLog(escalationJobId, {
    gate: "governance",
    message: `Escalation rejected by ${decided_by || "operator"}: ${rationale || "no rationale"}`,
    schema_version: 1,
  });

  res.json({ rejected: true, jobId: escalationJobId, decided_by, rationale });
});

// ─── GET /api/governance/pending — Jobs needing human input ────────

app.get("/api/governance/pending", (_req, res) => {
  const store = getJobStore();
  const jobs = store.list();

  const pending = jobs
    .filter((j) => {
      // Needs confirmation: intentConfirmed is not set but intentBrief exists
      const needsConfirm = j.intentBrief && !j.intentConfirmed;
      // Needs approval: appSpec exists but userApproved is not set
      const needsApproval = j.appSpec && j.userApproved === undefined;
      return needsConfirm || needsApproval;
    })
    .map((j) => ({
      jobId: j.jobId,
      intent: j.rawRequest,
      currentGate: j.currentGate,
      needsConfirmation: !!(j.intentBrief && !j.intentConfirmed),
      needsApproval: !!(j.appSpec && j.userApproved === undefined),
      createdAt: j.createdAt,
    }));

  res.json(pending);
});

// ─── POST /api/self-audit — Analyze pipeline failure patterns ────────

app.get("/api/self-audit", async (_req, res) => {
  try {
    const { getNeo4jService } = await import("../services/neo4j-service.js");
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();

    if (!ok) {
      return res.json({ suggestions: [], error: "Neo4j unavailable" });
    }

    // Query failure distributions
    const outcomeQuery = `
      MATCH (o:PipelineOutcome)
      WITH count(o) AS total,
           count(CASE WHEN o.success = true THEN 1 END) AS successes,
           count(CASE WHEN o.success = false THEN 1 END) AS failures
      RETURN total, successes, failures
    `;
    const totals = await neo4j.runCypher(outcomeQuery);
    const total = Number(totals[0]?.total ?? 0);
    const successes = Number(totals[0]?.successes ?? 0);
    const failures = Number(totals[0]?.failures ?? 0);

    if (total === 0) {
      // Fall back to in-memory job data if Neo4j has no records
      const store = getJobStore();
      const allJobs = store.list();
      if (allJobs.length === 0) {
        return res.json({ suggestions: [], message: "No pipeline runs recorded yet" });
      }
      const memTotal = allJobs.length;
      const memSuccesses = allJobs.filter((j: any) => j.currentGate === "complete").length;
      const memFailures = allJobs.filter((j: any) => j.currentGate === "failed").length;
      const memRate = memTotal > 0 ? ((memSuccesses / memTotal) * 100).toFixed(1) : "0";
      const memGateBreakdown = allJobs
        .filter((j: any) => j.currentGate === "failed")
        .reduce((acc: any, j: any) => {
          const gate = j.errorMessage?.includes("veto") ? "gate_3" : "unknown";
          acc[gate] = (acc[gate] || 0) + 1;
          return acc;
        }, {});
      return res.json({
        total_runs: memTotal,
        success_rate: `${memRate}%`,
        failures: memFailures,
        gate_breakdown: Object.entries(memGateBreakdown).map(([gate, cnt]) => ({ gate, category: "unknown", count: cnt })),
        suggestions: memFailures > 0 ? [{
          id: "sug-mem-1",
          severity: "medium",
          title: "Failure data from in-memory only (Neo4j has no PipelineOutcome records)",
          detail: `${memFailures}/${memTotal} jobs failed. Pipeline outcome persistence was just fixed — future runs will write to Neo4j.`,
          evidence: `In-memory: ${memSuccesses} success, ${memFailures} failed`,
        }] : [],
        source: "in-memory-fallback",
      });
    }

    // Gate failure breakdown
    const gateQuery = `
      MATCH (o:PipelineOutcome)
      WHERE o.success = false
      RETURN o.gate_reached AS gate, o.failure_category AS category, count(*) AS cnt
      ORDER BY cnt DESC
    `;
    const gateBreakdown = await neo4j.runCypher(gateQuery);

    // Ambiguity analysis
    const ambiguityQuery = `
      MATCH (o:PipelineOutcome)
      WHERE size(o.ambiguity_flags) > 0
      RETURN o.ambiguity_flags AS flags, o.success AS success, o.had_clarification AS clarified, count(*) AS cnt
      ORDER BY cnt DESC
    `;
    const ambiguityData = await neo4j.runCypher(ambiguityQuery);

    // App class success rates
    const classQuery = `
      MATCH (o:PipelineOutcome)
      RETURN o.app_class AS app_class,
             count(*) AS total,
             count(CASE WHEN o.success = true THEN 1 END) AS successes
      ORDER BY total DESC
    `;
    const classData = await neo4j.runCypher(classQuery);

    // Generate suggestions
    const suggestions: { id: string; severity: string; title: string; detail: string; evidence: string }[] = [];
    let sugId = 0;

    // 1. Overall success rate
    const successRate = total > 0 ? (successes / total) * 100 : 0;
    if (successRate < 50 && total >= 3) {
      suggestions.push({
        id: `sug-${++sugId}`,
        severity: "critical",
        title: "Pipeline success rate is below 50%",
        detail: `Only ${successes}/${total} runs succeeded (${successRate.toFixed(0)}%). Review common failure patterns and consider adding guardrails or better defaults.`,
        evidence: `${total} total runs, ${failures} failures`,
      });
    }

    // 2. Gate-specific failures
    for (const row of gateBreakdown) {
      const gate = row.gate;
      const category = row.category;
      const cnt = Number(row.cnt);
      const pct = ((cnt / total) * 100).toFixed(0);

      if (category === "confirmation_timeout" && cnt >= 2) {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "high",
          title: "Users frequently time out at intent confirmation",
          detail: `${cnt} runs (${pct}%) timed out waiting for confirmation. Consider: longer timeout, auto-confirm for low-risk, or better clarification prompts.`,
          evidence: `${cnt}x at ${gate}, category: ${category}`,
        });
      }
      if (category === "ambiguity" && cnt >= 2) {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "high",
          title: "Ambiguous intents are causing pipeline failures",
          detail: `${cnt} runs (${pct}%) failed due to ambiguity. The system should ask clarifying questions instead of failing. Check that the clarification loop is working.`,
          evidence: `${cnt}x at ${gate}, category: ${category}`,
        });
      }
      if (category === "veto_triggered" && cnt >= 2) {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "medium",
          title: "Veto checks are frequently blocking builds",
          detail: `${cnt} runs (${pct}%) were blocked by veto checks. Review veto rules — some may be too strict or need better defaults.`,
          evidence: `${cnt}x at ${gate}, category: ${category}`,
        });
      }
      if (category === "spec_validation" && cnt >= 2) {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "medium",
          title: "Spec validation failures are common",
          detail: `${cnt} runs (${pct}%) failed spec validation. The decomposer may need better defaults or the validator rules may be too strict.`,
          evidence: `${cnt}x at ${gate}, category: ${category}`,
        });
      }
    }

    // 3. App class with 0% success
    for (const row of classData) {
      const cls = row.app_class;
      const clsTotal = Number(row.total);
      const clsSuccesses = Number(row.successes);
      if (clsTotal >= 2 && clsSuccesses === 0 && cls !== "unknown") {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "high",
          title: `No successful builds for "${cls.replace(/_/g, " ")}" apps`,
          detail: `${clsTotal} attempts, 0 successes. This app class may need additional templates, better keyword matching, or domain-specific decomposition rules.`,
          evidence: `${clsTotal} runs for ${cls}, 0% success`,
        });
      }
    }

    // 4. Ambiguity without clarification
    for (const row of ambiguityData) {
      if (!row.clarified && !row.success && Number(row.cnt) >= 2) {
        suggestions.push({
          id: `sug-${++sugId}`,
          severity: "medium",
          title: "Ambiguous intents failing without clarification attempt",
          detail: `${Number(row.cnt)} ambiguous runs failed without asking the user for clarification. Ensure the clarification loop is active.`,
          evidence: `flags: ${JSON.stringify(row.flags)}, ${Number(row.cnt)} occurrences`,
        });
      }
    }

    // Push suggestions to Hermes if available
    // Prefer internal Railway URL for container-to-container communication
    const hermesUrl = process.env.HERMES_INTERNAL_URL || process.env.HERMES_URL || process.env.NEXT_PUBLIC_HERMES_URL;
    if (hermesUrl && suggestions.length > 0) {
      fetch(`${hermesUrl}/suggestions/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "aes-self-audit", suggestions }),
      }).catch(() => {}); // best-effort
    }

    res.json({
      total_runs: total,
      success_rate: `${successRate.toFixed(1)}%`,
      failures,
      gate_breakdown: gateBreakdown.map((r: any) => ({ gate: r.gate, category: r.category, count: Number(r.cnt) })),
      suggestions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Health check ──────────────────────────────────────────────────

// ─── Graph Visualize — returns nodes + edges for the operator UI ────

app.get("/api/graph/visualize", async (req, res) => {
  const mode = (req.query.mode as string) || "full";
  const limit = Math.min(parseInt(req.query.limit as string) || 220, 500);

  try {
    const { getNeo4jService } = await import("../services/neo4j-service.js");
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();

    if (!ok) {
      return res.json({
        nodes: [],
        edges: [],
        total_nodes: 0,
        total_edges: 0,
        mode,
        error: "Cannot connect to Neo4j",
      });
    }

    // Strategy: fetch connected pairs first so every returned node has edges,
    // then backfill isolated high-value nodes only if there's room.

    const allowedLabels = mode === "feature"
      ? "n:LearnedFeature OR n:LearnedApp OR n:CatalogEntry"
      : "n:LearnedApp OR n:LearnedFeature OR n:LearnedDataModel OR n:DataModel OR n:LearnedIntegration OR n:LearnedPattern OR n:CatalogEntry OR n:LearnedUserFlow OR n:LearnedComponentGroup OR n:LearnedApiDomain OR n:LearnedPageSection OR n:LearnedStatePattern OR n:LearnedDesignSystem OR n:LearnedFormPattern OR n:LearnedCorrection OR n:LearnedFeedback OR n:LearnedResearch OR n:ResearchHub OR n:BuildHistory";

    // Step 1: Fetch connected pairs — both ends of every relationship
    const connectedQuery = `
      MATCH (a)-[r]->(b)
      WHERE (${allowedLabels.replace(/\bn\b/g, "a")})
        AND (${allowedLabels.replace(/\bn\b/g, "b")})
      WITH a, r, b
      ORDER BY
        CASE WHEN labels(a)[0] = 'LearnedApp' THEN 0
             WHEN labels(a)[0] = 'CatalogEntry' THEN 1
             ELSE 2 END
      LIMIT ${limit * 2}
      WITH collect(DISTINCT a) + collect(DISTINCT b) AS allNodes,
           collect({ source: elementId(a), target: elementId(b), type: type(r) }) AS allEdges
      UNWIND allNodes AS n
      WITH collect(DISTINCT n) AS nodes, allEdges
      RETURN
        [n IN nodes | {
          id: elementId(n),
          type: labels(n)[0],
          label: coalesce(n.name, n.feature_id, n.id),
          props: properties(n)
        }][..${limit}] AS nodes,
        allEdges AS edges
    `;

    const connResult = await neo4j.runCypher(connectedQuery);
    const rawNodes: any[] = connResult[0]?.nodes || [];
    const rawEdges: any[] = connResult[0]?.edges || [];

    const nodeIds = new Set<string>();
    const nodes = rawNodes.map((n: any) => {
      const id = String(n.id);
      nodeIds.add(id);
      return {
        id,
        label: n.label || "unknown",
        type: n.type || "Unknown",
        properties: n.props || {},
      };
    });

    // Filter edges to only those whose both ends are in the returned node set
    const edges = rawEdges
      .map((e: any) => ({
        source: String(e.source),
        target: String(e.target),
        type: e.type || "RELATED",
      }))
      .filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

    // Get totals
    const countResult = await neo4j.runCypher("MATCH (n) RETURN count(n) AS cnt");
    const edgeCountResult = await neo4j.runCypher("MATCH ()-[r]->() RETURN count(r) AS cnt");
    const totalNodes = countResult[0]?.cnt?.toNumber?.() || Number(countResult[0]?.cnt) || 0;
    const totalEdges = edgeCountResult[0]?.cnt?.toNumber?.() || Number(edgeCountResult[0]?.cnt) || 0;

    res.json({
      nodes,
      edges,
      total_nodes: totalNodes,
      total_edges: totalEdges,
      mode,
    });
  } catch (err: any) {
    res.json({
      nodes: [],
      edges: [],
      total_nodes: 0,
      total_edges: 0,
      mode,
      error: err.message,
    });
  }
});

// Build fingerprint — changes on every deploy so Hermes can detect stale containers
const BUILD_ID = `b-${Date.now().toString(36)}`;
const BOOT_TIME = new Date().toISOString();
const COMMIT_SHA = resolveCommitSha();
const COMMIT_SHORT = COMMIT_SHA ? COMMIT_SHA.slice(0, 7) : null;

app.get("/api/health", (_req, res) => {
  const sem = getLLMSemaphoreStats();
  res.json({
    status: "ok",
    version: "v15",
    build_id: BUILD_ID,
    commit_sha: COMMIT_SHA,
    commit_short: COMMIT_SHORT,
    booted_at: BOOT_TIME,
    math_layer: true,
    llm_slots: { active: sem.activeSlots, max: sem.maxSlots, queued: sem.queueLength },
  });
});

function resolveCommitSha(): string | null {
  const envCandidates = [
    process.env.AES_GIT_COMMIT_SHA,
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.GIT_COMMIT,
    process.env.COMMIT_SHA,
    process.env.SOURCE_COMMIT,
  ];

  for (const candidate of envCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  try {
    const sha = execSync("git rev-parse HEAD", {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
    return sha.length > 0 ? sha : null;
  } catch {
    return null;
  }
}

// ─── Debug / admin endpoints ──────────────────────────────────────

app.get("/api/debug/semaphore", apiKeyAuth, (_req, res) => {
  res.json(getLLMSemaphoreStats());
});

app.post("/api/debug/semaphore/reset", apiKeyAuth, (_req, res) => {
  resetLLMSemaphore();
  res.json({ reset: true, stats: getLLMSemaphoreStats() });
});

app.get("/api/debug/neo4j", async (_req, res) => {
  try {
    const { getNeo4jService } = await import("../services/neo4j-service.js");
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (!ok) {
      return res.json({ connected: false, error: "Connection failed" });
    }

    // Test write
    const testId = `probe-${Date.now()}`;
    const writeResult = await neo4j.runCypher(
      `CREATE (p:Probe {id: $id, ts: $ts}) RETURN p.id AS id`,
      { id: testId, ts: new Date().toISOString() }
    );

    // Test read-back
    const readResult = await neo4j.runCypher(
      `MATCH (p:Probe {id: $id}) RETURN p.id AS id, p.ts AS ts`,
      { id: testId }
    );

    // Count all PipelineOutcome nodes
    const outcomeCount = await neo4j.runCypher(
      `MATCH (o:PipelineOutcome) RETURN count(o) AS cnt`
    );

    // List recent outcomes
    const recentOutcomes = await neo4j.runCypher(
      `MATCH (o:PipelineOutcome) RETURN o.job_id AS job, o.success AS success, o.gate_reached AS gate ORDER BY o.created_at DESC LIMIT 5`
    );

    // Cleanup
    await neo4j.runCypher(`MATCH (p:Probe {id: $id}) DELETE p`, { id: testId });

    res.json({
      connected: true,
      url: process.env.AES_NEO4J_URL || "default",
      write_test: { wrote: writeResult.length > 0, read_back: readResult.length > 0 },
      pipeline_outcomes: outcomeCount[0]?.cnt ?? 0,
      recent_outcomes: recentOutcomes,
      test_id: testId,
    });
  } catch (err: any) {
    res.json({ connected: false, error: err.message });
  }
});

// ─── Start server ──────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || process.env.AES_PORT || "3100");

async function initializePersistenceOnBoot(): Promise<void> {
  const store = getJobStore();
  if (store.hasPersistence()) return;

  const pgUrl = process.env.AES_POSTGRES_URL;
  if (!pgUrl) return;

  try {
    const { PersistenceLayer } = await import("../persistence.js");
    const persistence = new PersistenceLayer(pgUrl);
    await persistence.initialize();
    store.setPersistence(persistence);
    console.log("[persistence] Initialized AES Postgres schema");
  } catch (err: any) {
    console.warn(`[persistence] Bootstrap failed: ${err?.message || String(err)}`);
  }
}

// ─── Canary builds — fixed intents for quality signal tracking ─────

// GET /api/canary — list all canary definitions
app.get("/api/canary", (_req, res) => {
  res.json({
    canaries: Object.values(CANARY_DEFINITIONS),
    count: Object.keys(CANARY_DEFINITIONS).length,
  });
});

// GET /api/canary/:slug — get a specific canary definition
app.get("/api/canary/:slug", (req, res) => {
  const canary = CANARY_DEFINITIONS[req.params.slug];
  if (!canary) {
    res.status(404).json({ error: `Unknown canary: ${req.params.slug}` });
    return;
  }
  res.json(canary);
});

// POST /api/canary/:slug/run — trigger a canary build (submits to /api/build with autonomous=true)
app.post("/api/canary/:slug/run", async (req, res) => {
  const canary = CANARY_DEFINITIONS[req.params.slug];
  if (!canary) {
    res.status(404).json({ error: `Unknown canary: ${req.params.slug}` });
    return;
  }

  const jobId = `canary-${canary.slug}-${randomUUID().substring(0, 8)}`;
  const store = getJobStore();

  const requestId = `canary-${randomUUID().slice(0, 8)}`;

  // Sync initial state to Convex
  pushToConvex("/push-status", {
    jobId,
    intent: canary.description,
    currentGate: "gate_0",
    intentConfirmed: false,
    userApproved: false,
    targetPath: null,
    deployTarget: "vercel",
    autonomous: true,
    features: [],
  });

  // Run the pipeline in background
  const callbacks: GraphCallbacks = {
    onGate: (gate, message) => broadcastToJob(jobId, "gate", { gate, message }),
    onStep: (message) => broadcastToJob(jobId, "step", { message }),
    onSuccess: (message) => broadcastToJob(jobId, "success", { message }),
    onFail: (message) => broadcastToJob(jobId, "fail", { message }),
    onWarn: (message) => broadcastToJob(jobId, "warn", { message }),
    onPause: (message) => broadcastToJob(jobId, "pause", { message }),
    onFeatureStatus: (id, name, status) => broadcastToJob(jobId, "feature", { id, name, status }),
    onNeedsApproval: async () => true, // auto-approve for canary builds
    onNeedsConfirmation: async () => true, // auto-confirm for canary builds
  };

  // Fire-and-forget — the canary runs asynchronously
  void (async () => {
    try {
      const result = await runGraph(
        {
          jobId,
          requestId,
          rawRequest: canary.description,
          currentGate: "gate_0",
          deployTarget: "vercel",
          autonomous: true,
        },
        callbacks
      );
      broadcastToJob(jobId, "complete", {
        gate: result.currentGate,
        features: Object.keys(result.featureBridges || {}).length,
        error: result.errorMessage,
        previewUrl: result.previewUrl || null,
        canary: canary.slug,
      });

      // Push canary outcome to Hermes
      const hermesUrl = process.env.HERMES_INTERNAL_URL || process.env.HERMES_URL || process.env.NEXT_PUBLIC_HERMES_URL;
      if (hermesUrl) {
        fetch(`${hermesUrl}/pipeline-outcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            job_id: jobId,
            success: !result.errorMessage && result.currentGate !== "failed",
            gate_reached: result.currentGate,
            error_message: result.errorMessage || null,
            app_class: "canary",
            risk_class: "low",
            ambiguity_flags: [],
            intent_confirmed: true,
            user_approved: true,
            feature_count: Object.keys(result.featureBridges || {}).length,
          }),
        }).catch(() => {});
      }
    } catch (err: any) {
      broadcastToJob(jobId, "error", { message: err.message, canary: canary.slug });
    }
  })();

  res.status(202).json({
    jobId,
    canary: canary.slug,
    message: `Canary build "${canary.title}" started`,
    stream: `/api/jobs/${jobId}/stream`,
  });
});

// GET /api/canary/:slug/results — get recent results for a specific canary
app.get("/api/canary/:slug/results", (req, res) => {
  const canary = CANARY_DEFINITIONS[req.params.slug];
  if (!canary) {
    res.status(404).json({ error: `Unknown canary: ${req.params.slug}` });
    return;
  }

  const store = getJobStore();
  const allJobs = store.list();
  const canaryJobs = allJobs
    .filter((j) => j.jobId.startsWith(`canary-${canary.slug}-`))
    .slice(0, 20)
    .map((j) => ({
      jobId: j.jobId,
      gate: j.currentGate,
      error: j.errorMessage || null,
      previewUrl: j.previewUrl || null,
      createdAt: j.createdAt,
    }));

  const total = canaryJobs.length;
  const successes = canaryJobs.filter((j) => j.gate === "complete" && !j.error).length;

  res.json({
    canary: canary.slug,
    total,
    successes,
    successRate: total > 0 ? Math.round((successes / total) * 100) : 0,
    jobs: canaryJobs,
  });
});

// ─── Checkpoints & resume ─────────────────────────────────────────────

app.get("/api/jobs/:id/checkpoints", async (req, res) => {
  await ensurePersistenceIfConfigured();
  const store = getJobStore();
  const checkpoints = await store.listCheckpoints(req.params.id, 50);
  res.json({ jobId: req.params.id, checkpoints });
});

app.get("/api/jobs/:id/checkpoints/latest", async (req, res) => {
  await ensurePersistenceIfConfigured();
  const store = getJobStore();
  const checkpoint = await store.latestCheckpoint(req.params.id);
  if (!checkpoint) {
    res.status(404).json({ error: "No checkpoints found" });
    return;
  }
  res.json(checkpoint);
});

app.post("/api/jobs/:id/resume/compile", async (req, res) => {
  await ensurePersistenceIfConfigured();
  const store = getJobStore();
  const checkpoint = await store.latestCheckpoint(req.params.id);
  if (!checkpoint) {
    res.status(404).json({ error: "No checkpoint for job" });
    return;
  }
  if (checkpoint.gate !== "compile_gate") {
    res.status(400).json({ error: `Latest checkpoint is ${checkpoint.gate}, not compile_gate` });
    return;
  }
  if (checkpoint.resume_eligible === false) {
    res.status(409).json({ error: "Checkpoint marked as not resume-eligible", reason: checkpoint.resume_reason });
    return;
  }
  const workspacePath = checkpoint.workspace_path;
  if (!workspacePath || !existsSync(workspacePath)) {
    res.status(410).json({ error: "Workspace no longer exists for checkpoint", workspacePath });
    return;
  }

  try {
    const result = await resumeCompileGate(req.params.id, workspacePath);
    res.json({ jobId: req.params.id, workspacePath, result });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Resume failed" });
  }
});

export function startServer() {
  void initializePersistenceOnBoot();

  // Bind to :: (IPv6 + IPv4) for Railway private networking compatibility
  app.listen(PORT, "::", () => {
    console.log(`AES Platform API running on http://localhost:${PORT}`);
    console.log(`  POST /api/build                          — Start a build`);
    console.log(`  GET  /api/jobs/:id/stream                — SSE stream`);
    console.log(`  POST /api/jobs/:id/confirm               — Confirm intent`);
    console.log(`  POST /api/jobs/:id/approve               — Approve plan`);
    console.log(`  GET  /api/jobs/:id                       — Job status`);
    console.log(`  GET  /api/jobs                           — List jobs`);
    console.log(`  GET  /api/jobs/:id/logs                  — Job logs`);
    console.log(`  GET  /api/jobs/:id/features              — Feature list with bridges`);
    console.log(`  GET  /api/jobs/:id/audit                 — Full audit trail`);
    console.log(`  GET  /api/attention-queue                — Attention queue`);
    console.log(`  GET  /api/governance/pending              — Pending governance items`);
    console.log(`  POST /api/governance/escalations/:id/approve — Approve escalation`);
    console.log(`  POST /api/governance/escalations/:id/reject  — Reject escalation`);
    console.log(`  GET  /api/self-audit                     — Self-audit failure patterns`);
    console.log(`  GET  /api/canary                         — List canary definitions`);
    console.log(`  POST /api/canary/:slug/run               — Trigger canary build`);
    console.log(`  GET  /api/canary/:slug/results           — Canary success rate`);
    console.log(`  GET  /api/jobs/:id/checkpoints           — List checkpoints`);
    console.log(`  GET  /api/jobs/:id/checkpoints/latest    — Latest checkpoint`);
    console.log(`  POST /api/jobs/:id/resume/compile        — Resume from compile gate`);
  });
  return app;
}

export { app };
