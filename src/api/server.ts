import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { runGraph, type GraphCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

const app = express();
app.use(cors());
app.use(express.json());

// Active job streams (Server-Sent Events)
const jobStreams = new Map<string, express.Response[]>();

// Event buffer — stores events so clients connecting late get a full replay
const jobEventBuffer = new Map<string, { event: string; data: any }[]>();

function broadcastToJob(jobId: string, event: string, data: any) {
  // Buffer the event for late-connecting clients
  if (!jobEventBuffer.has(jobId)) jobEventBuffer.set(jobId, []);
  jobEventBuffer.get(jobId)!.push({ event, data });

  // Send to currently connected clients
  const clients = jobStreams.get(jobId) || [];
  for (const res of clients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
}

// ─── POST /api/build — Start a new build ───────────────────────────

app.post("/api/build", async (req, res) => {
  const { intent } = req.body;
  if (!intent || typeof intent !== "string") {
    res.status(400).json({ error: "intent is required" });
    return;
  }

  const jobId = `j-${randomUUID().slice(0, 8)}`;
  const requestId = `req-${randomUUID().slice(0, 8)}`;

  // Return immediately with job ID
  res.json({ jobId, requestId, status: "started" });

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
      // Wait for approval via the approve endpoint
      return new Promise((resolve) => {
        const store = getJobStore();
        const check = setInterval(() => {
          const job = store.get(jobId);
          if (job?.userApproved) {
            clearInterval(check);
            resolve(true);
          }
        }, 500);
        // Timeout after 5 minutes
        setTimeout(() => { clearInterval(check); resolve(false); }, 300000);
      });
    },
    onNeedsConfirmation: async (statement) => {
      broadcastToJob(jobId, "needs_confirmation", { statement });
      return new Promise((resolve) => {
        const store = getJobStore();
        const check = setInterval(() => {
          const job = store.get(jobId);
          if (job?.intentConfirmed) {
            clearInterval(check);
            resolve(true);
          }
        }, 500);
        setTimeout(() => { clearInterval(check); resolve(false); }, 300000);
      });
    },
  };

  try {
    const result = await runGraph(
      { jobId, requestId, rawRequest: intent, currentGate: "gate_0" },
      callbacks
    );
    broadcastToJob(jobId, "complete", {
      gate: result.currentGate,
      features: Object.keys(result.featureBridges || {}).length,
      error: result.errorMessage,
    });
  } catch (err: any) {
    broadcastToJob(jobId, "error", { message: err.message });
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

  store.update(jobId, { intentConfirmed: true });
  res.json({ confirmed: true });
});

// ─── POST /api/jobs/:id/approve — Approve app plan ────────────────

app.post("/api/jobs/:id/approve", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  store.update(jobId, { userApproved: true });
  res.json({ approved: true });
});

// ─── GET /api/jobs/:id — Get job status ────────────────────────────

app.get("/api/jobs/:id", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  res.json({
    jobId,
    currentGate: job.currentGate,
    intentConfirmed: job.intentConfirmed,
    userApproved: job.userApproved,
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

app.get("/api/jobs", (_req, res) => {
  const store = getJobStore();
  const jobs = store.list().map((j) => ({
    jobId: j.jobId,
    intent: j.rawRequest,
    currentGate: j.currentGate,
    features: Object.keys(j.featureBridges || {}).length,
    intentConfirmed: j.intentConfirmed,
    userApproved: j.userApproved,
    createdAt: j.createdAt,
  }));
  res.json(jobs);
});

// ─── GET /api/jobs/:id/logs — Get job logs ─────────────────────────

app.get("/api/jobs/:id/logs", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const logs = store.getLogs(jobId);
  res.json(logs || []);
});

// ─── Health check ──────────────────────────────────────────────────

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", version: "v12", math_layer: true });
});

// ─── Start server ──────────────────────────────────────────────────

const PORT = parseInt(process.env.AES_PORT || "3100");

export function startServer() {
  app.listen(PORT, () => {
    console.log(`AES Platform API running on http://localhost:${PORT}`);
    console.log(`  POST /api/build          — Start a build`);
    console.log(`  GET  /api/jobs/:id/stream — SSE stream`);
    console.log(`  POST /api/jobs/:id/confirm — Confirm intent`);
    console.log(`  POST /api/jobs/:id/approve — Approve plan`);
    console.log(`  GET  /api/jobs/:id        — Job status`);
    console.log(`  GET  /api/jobs            — List jobs`);
    console.log(`  GET  /api/jobs/:id/logs   — Job logs`);
  });
  return app;
}

export { app };
