// In dev, Next.js rewrites /api/* → localhost:4100/api/* (no CORS issues)
// In prod, set NEXT_PUBLIC_AES_API_URL to the backend URL
const BASE = process.env.NEXT_PUBLIC_AES_API_URL ?? "";

export async function aesGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json();
}

export async function aesPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`POST ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

/* ── Typed API calls ── */

export interface HealthResponse {
  status: "ok" | "degraded";
  total_records: number | null;
  builder_sessions: number;
  pending_escalations: number;
  dependencies: { name: string; status: string; detail?: string }[];
}

export interface OrchestratorSnapshot {
  status: string;
  phase: string;
  app_id: string;
  features: OrchestratorFeature[];
  thinking?: string;
  started_at?: string;
}

export interface OrchestratorFeature {
  feature_id: string;
  name: string;
  stage: string;
  dependencies: string[];
  promotion_status?: string;
  confidence?: number;
}

export interface OrchestratorEvent {
  timestamp: string;
  type: string;
  message: string;
  feature_id?: string;
  phase?: string;
}

export interface AgentStatus {
  phase: string;
  app_id: string;
  feature_id: string;
  started_at: string;
  total_features: number;
  completed_features: number;
  failed_features: number;
  blocked_features: number;
  agents: Record<
    string,
    { state: string; current_task: string; feature_id: string; last_result: string }
  >;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  total_nodes: number;
  total_edges: number;
  mode: string;
  error?: string;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  properties?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

/** Raw response from POST /api/app/intake — a StoredRecord<AppSpec> */
export interface AppIntakeRawResult {
  internal_id: string;
  artifact_type: string;
  artifact_id: string;
  sequence_number: number;
  payload: {
    app_id: string;
    name: string;
    summary: string;
    promotion_status: string;
    feature_ids: string[];
    [key: string]: unknown;
  };
}

/** Simplified intake result for UI consumption */
export interface AppIntakeResult {
  app_id: string;
  status: string;
  name: string;
}

export interface AppStatus {
  app: {
    app_id: string;
    name: string;
    summary: string;
    status: string;
    feature_ids: string[];
  };
  features: {
    feature_id: string;
    name: string;
    feature_type: string;
    dependencies: string[];
    promotion_status: string;
  }[];
}

export interface BuildReplay {
  build_id: string;
  build?: { payload: { status: string; feature_id: string } };
  diff?: unknown;
  test_run?: unknown;
  validation?: unknown;
}

export const api = {
  health: () => aesGet<HealthResponse>("/api/health"),

  // Orchestrator
  orchestratorLive: () => aesGet<OrchestratorSnapshot>("/api/orchestrator/live"),
  orchestratorEvents: () => aesGet<OrchestratorEvent[]>("/api/orchestrator/events"),
  orchestratorAdvance: () => aesPost<OrchestratorSnapshot>("/api/orchestrator/advance"),

  // Agent status (thinking line)
  agentStatus: () => aesGet<AgentStatus>("/api/agent-status"),

  // Graph
  graphVisualize: (mode: "full" | "feature" = "full", limit = 220) =>
    aesGet<GraphData>(`/api/graph/visualize?mode=${mode}&limit=${limit}`),

  // App pipeline
  appIntake: async (name: string, description: string): Promise<AppIntakeResult> => {
    const raw = await aesPost<AppIntakeRawResult>("/api/app/intake", {
      name,
      description,
      requested_by: "operator-ui",
    });
    return {
      app_id: raw.payload.app_id,
      status: raw.payload.promotion_status ?? "DRAFT",
      name: raw.payload.name,
    };
  },
  appStatus: (appId: string) => aesGet<AppStatus>(`/api/app/${appId}/status`),
  appResearch: (appId: string, content: string) =>
    aesPost(`/api/app/${appId}/research`, { research_content: content }),
  appDecompose: (appId: string, features?: unknown[]) =>
    aesPost(`/api/app/${appId}/decompose`, { candidate_features: features ?? [] }),
  appVerify: (appId: string) =>
    aesPost(`/api/app/${appId}/verify`, { verification_content: "auto-verify", source: "operator-ui" }),
  appPromote: (appId: string) => aesPost(`/api/app/${appId}/promote`, {}),
  appSeed: (appId: string) => aesPost(`/api/app/${appId}/seed`, {}),
  appBuildProgram: (appId: string) =>
    aesPost(`/api/app/${appId}/build-program`, { requested_by: "operator-ui" }),

  /**
   * Run the full pipeline: intake → research → decompose → verify → promote.
   * Calls onProgress at each stage so the UI can update the thinking line.
   * Returns the app_id. Does NOT start the build program — that requires operator approval.
   */
  runPipeline: async (
    intent: string,
    onProgress: (stage: string, message: string) => void
  ): Promise<{ app_id: string; promoted: boolean; error?: string }> => {
    // 1. Intake
    onProgress("intake", "Submitting your intent...");
    const name = intent
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .slice(0, 4)
      .join("-");
    const intake = await api.appIntake(name, intent);
    const appId = intake.app_id;

    // 2. Research
    onProgress("research", "Researching patterns and requirements...");
    try {
      await api.appResearch(appId, intent);
    } catch (err) {
      // Research may fail if no research gateway — continue with what we have
      onProgress("research", "Research skipped (no gateway). Continuing...");
    }

    // 3. Decompose
    onProgress("decompose", "Breaking down into features...");
    await api.appDecompose(appId);

    // 4. Verify
    onProgress("verify", "Verifying feature specs...");
    try {
      await api.appVerify(appId);
    } catch (err) {
      onProgress("verify", "Verification skipped. Continuing...");
    }

    // 5. Promote
    onProgress("promote", "Evaluating promotion gates...");
    try {
      const result = await api.appPromote(appId) as Record<string, unknown>;
      const decision = (result as { decision?: string }).decision;
      if (decision === "PROMOTED") {
        onProgress("promoted", "Plan approved. Ready to build.");
        return { app_id: appId, promoted: true };
      } else {
        onProgress("blocked", `Promotion ${decision ?? "BLOCKED"}. Review needed.`);
        return { app_id: appId, promoted: false, error: `Promotion: ${decision}` };
      }
    } catch (err) {
      onProgress("blocked", "Promotion failed. Review needed.");
      return { app_id: appId, promoted: false, error: String(err) };
    }
  },

  // Builds
  buildReplay: (buildId: string) => aesGet<BuildReplay>(`/api/builds/${buildId}/replay`),
  buildPrepare: (featureId: string, intent: string) =>
    aesPost("/api/builds/prepare", { feature_id: featureId, intent }),
  buildAbort: (buildId: string) => aesPost(`/api/builds/${buildId}/abort-builder`, {}),
  buildRunValidators: (buildId: string) =>
    aesPost(`/api/builds/${buildId}/run-validators`, {}),

  // Governance
  pendingDecisions: () => aesGet("/api/governance/pending"),
  escalationApprove: (id: string, by: string, rationale: string) =>
    aesPost(`/api/governance/escalations/${id}/approve`, {
      decided_by: by,
      rationale,
    }),
  escalationReject: (id: string, by: string, rationale: string) =>
    aesPost(`/api/governance/escalations/${id}/reject`, {
      decided_by: by,
      rationale,
    }),

  // Features
  featureAudit: (featureId: string) => aesGet(`/api/features/${featureId}/audit`),

  // Attention
  attentionQueue: () => aesGet<AttentionQueue>("/api/attention-queue"),
};

/* ── LangGraph Orchestrator API ── */

const ORCH_BASE = process.env.NEXT_PUBLIC_AES_ORCHESTRATOR_URL ?? "";
// In dev, Next.js rewrites /orchestrator/* → localhost:3100/api/*
// In prod, ORCH_BASE points directly to the server, so use /api/* paths
const ORCH_PREFIX = ORCH_BASE ? "/api" : "/orchestrator";

export interface OrchestratorJobResponse {
  jobId: string;
  requestId: string;
  status: "started";
}

export interface OrchestratorJobStatus {
  jobId: string;
  currentGate: string;
  intentConfirmed: boolean;
  userApproved: boolean;
  targetPath: string | null;
  deployTarget: "local" | "cloudflare";
  previewUrl: string | null;
  features: string[];
  featureBridges: Record<string, unknown>;
  appSpec: {
    title: string;
    app_class: string;
    features: number;
    roles: number;
    confidence: number;
  } | null;
  vetoResults: unknown[];
  errorMessage: string | null;
}

export interface OrchestratorSSEEvent {
  type: string;
  data: Record<string, unknown>;
}

export const orchestrator = {
  /** Start a new build via the LangGraph orchestrator */
  startBuild: async (intent: string, targetPath?: string, deployTarget?: "local" | "cloudflare"): Promise<OrchestratorJobResponse> => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/build`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intent, targetPath: targetPath || undefined, deployTarget: deployTarget || "local" }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`POST /orchestrator/build → ${res.status}: ${text}`);
    }
    return res.json();
  },

  /** Get job status */
  jobStatus: async (jobId: string): Promise<OrchestratorJobStatus> => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/jobs/${jobId}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /orchestrator/jobs/${jobId} → ${res.status}`);
    return res.json();
  },

  /** List all jobs */
  listJobs: async () => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/jobs`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /orchestrator/jobs → ${res.status}`);
    return res.json() as Promise<{
      jobId: string;
      intent: string;
      currentGate: string;
      features: number;
      intentConfirmed: boolean;
      userApproved: boolean;
      targetPath: string | null;
      createdAt: string;
    }[]>;
  },

  /** Confirm intent (resolve ambiguity) */
  confirmIntent: async (jobId: string): Promise<void> => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/jobs/${jobId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`POST confirm → ${res.status}`);
  },

  /** Approve plan (human gate) */
  approvePlan: async (jobId: string): Promise<void> => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/jobs/${jobId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`POST approve → ${res.status}`);
  },

  /** Get SSE stream URL for a job — connect directly to orchestrator to avoid proxy buffering */
  streamUrl: (jobId: string) => {
    // SSE must bypass the Next.js rewrite proxy (it buffers responses)
    const directUrl = process.env.NEXT_PUBLIC_AES_ORCHESTRATOR_DIRECT_URL ?? "http://localhost:3100";
    return `${directUrl}/api/jobs/${jobId}/stream`;
  },

  /** Get job logs */
  jobLogs: async (jobId: string) => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/jobs/${jobId}/logs`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /orchestrator/jobs/${jobId}/logs → ${res.status}`);
    return res.json() as Promise<{ gate: string; message: string; timestamp: string }[]>;
  },

  /** Health check for orchestrator */
  health: async () => {
    const res = await fetch(`${ORCH_BASE}${ORCH_PREFIX}/health`, { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /orchestrator/health → ${res.status}`);
    return res.json() as Promise<{ status: string; version: string }>;
  },
};

export interface AttentionQueue {
  pending_escalations: AttentionItem[];
  blocked_builds: AttentionItem[];
  verified_restricted_write_backs: AttentionItem[];
  stale_bridges: AttentionItem[];
}

export interface AttentionItem {
  internal_id: string;
  artifact_type: string;
  artifact_id: string;
  sequence_number: number;
  payload: {
    status: string;
    build_id?: string;
    bridge_id?: string;
    feature_id?: string;
    started_at?: string;
    ended_at?: string;
    queued_at?: string;
    [key: string]: unknown;
  };
}
