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

function broadcastToJob(jobId: string, event: string, data: any) {
  // Buffer the event for late-connecting clients
  if (!jobEventBuffer.has(jobId)) jobEventBuffer.set(jobId, []);
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
  const { intent, targetPath, deployTarget, designMode } = req.body;
  if (!intent || typeof intent !== "string") {
    res.status(400).json({ error: "intent is required" });
    return;
  }

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
    deployTarget: deployTarget === "cloudflare" ? "cloudflare" : "local",
    features: [],
  });

  // Run the pipeline in background
  const callbacks: GraphCallbacks = {
    onGate: (gate, message) => {
      const store = getJobStore();
      store.update(jobId, { currentGate: gate });
      broadcastToJob(jobId, "gate", { gate, message });
    },
    onStep: (message) => broadcastToJob(jobId, "step", { message }),
    onSuccess: (message) => broadcastToJob(jobId, "success", { message }),
    onFail: (message) => broadcastToJob(jobId, "fail", { message }),
    onWarn: (message) => broadcastToJob(jobId, "warn", { message }),
    onPause: (message) => broadcastToJob(jobId, "pause", { message }),
    onFeatureStatus: (id, name, status) => broadcastToJob(jobId, "feature", { id, name, status }),
    onNeedsApproval: async (prompt, data) => {
      const store = getJobStore();
      store.update(jobId, { pendingAction: "approve" });
      broadcastToJob(jobId, "needs_approval", { prompt, data });
      // Wait for approval via the approve endpoint
      return new Promise((resolve) => {
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
      const store = getJobStore();
      store.update(jobId, { pendingAction: "confirm", confirmationStatement: statement });
      broadcastToJob(jobId, "needs_confirmation", { statement });
      return new Promise((resolve) => {
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
      { jobId, requestId, rawRequest: intent, currentGate: "gate_0", targetPath: resolvedTargetPath, deployTarget: deployTarget === "cloudflare" ? "cloudflare" : "local", designMode: designMode === "paper" ? "paper" : "auto" },
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

  store.update(jobId, { intentConfirmed: true, pendingAction: null, confirmationStatement: null });
  res.json({ confirmed: true });
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
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }

  store.update(jobId, { userApproved: true, pendingAction: null });
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
    pendingAction: job.pendingAction ?? null,
    confirmationStatement: job.confirmationStatement ?? null,
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
    targetPath: j.targetPath ?? null,
    deployTarget: j.deployTarget ?? "local",
    previewUrl: j.previewUrl ?? null,
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

app.get("/api/jobs/:id/features", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
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

app.get("/api/jobs/:id/audit", (req, res) => {
  const jobId = req.params.id;
  const store = getJobStore();
  const job = store.get(jobId);
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

app.get("/api/health", async (_req, res) => {
  const store = getJobStore();

  // Check Neo4j
  let neo4jStatus: "up" | "down" = "down";
  let neo4jDetail = "Not configured";
  try {
    const { getNeo4jService } = await import("../services/neo4j-service.js");
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (ok) {
      neo4jStatus = "up";
      neo4jDetail = "Connected";
    } else {
      neo4jDetail = "Connection failed";
    }
  } catch (err: any) {
    neo4jDetail = err.message || "Unavailable";
  }

  // Check LLM
  let llmStatus: "up" | "down" = "down";
  let llmDetail = "No API key configured (OPENAI_API_KEY)";
  try {
    const { isLLMAvailable } = await import("../llm/provider.js");
    if (isLLMAvailable()) {
      llmStatus = "up";
      llmDetail = `Model: ${process.env.AES_LLM_MODEL || "gpt-4o"}`;
    }
  } catch {}

  // Check Perplexity / Research API
  let researchStatus: "up" | "down" = "down";
  const researchUrl = process.env.AES_PERPLEXITY_URL ?? "http://localhost:3200";
  let researchDetail = `Unreachable (${researchUrl})`;
  const hasPerplexityKey = !!process.env.PERPLEXITY_API_KEY;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const r = await fetch(`${researchUrl}/health`, { signal: controller.signal }).catch(() => null);
    clearTimeout(timeout);
    if (r && r.ok) {
      researchStatus = "up";
      researchDetail = "MCP research server connected";
    } else if (hasPerplexityKey) {
      researchStatus = "up";
      researchDetail = "Direct Perplexity API (key configured)";
    }
  } catch {
    if (hasPerplexityKey) {
      researchStatus = "up";
      researchDetail = "Direct Perplexity API (key configured)";
    }
  }

  // Postgres persistence
  let postgresStatus: "up" | "down" = "down";
  let postgresDetail = "Not configured";
  if (store.hasPersistence()) {
    postgresStatus = "up";
    postgresDetail = "Write-through enabled";
  }

  const allUp = neo4jStatus === "up" && llmStatus === "up" && researchStatus === "up";
  const allDown = neo4jStatus === "down" && llmStatus === "down" && researchStatus === "down";

  res.json({
    status: allDown ? "degraded" : allUp ? "ok" : "partial",
    version: "v12",
    services: {
      neo4j: { status: neo4jStatus, detail: neo4jDetail },
      llm: { status: llmStatus, detail: llmDetail },
      research: { status: researchStatus, detail: researchDetail },
      postgres: { status: postgresStatus, detail: postgresDetail },
    },
    capabilities: {
      knowledge_graph: neo4jStatus === "up",
      llm_reasoning: llmStatus === "up",
      external_research: researchStatus === "up",
      durable_persistence: postgresStatus === "up",
    },
    message: allDown
      ? "All reasoning services are offline — pipeline will use fallback logic only"
      : allUp
        ? "All services operational"
        : `Degraded: ${[
            neo4jStatus === "down" ? "knowledge graph offline" : null,
            llmStatus === "down" ? "no LLM (keyword fallback)" : null,
            researchStatus === "down" ? "research API offline" : null,
          ].filter(Boolean).join(", ")}`,
  });
});

// ─── Start server ──────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || process.env.AES_PORT || "3100");

export function startServer() {
  app.listen(PORT, () => {
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
  });
  return app;
}

export { app };
