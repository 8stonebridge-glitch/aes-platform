"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  api,
  orchestrator,
  type HealthResponse,
  type OrchestratorSnapshot,
  type OrchestratorEvent,
  type AgentStatus,
  type OrchestratorSSEEvent,
  type OrchestratorJobStatus,
} from "./api";

/* ── Poll hook ── */
function usePoll<T>(
  fetcher: () => Promise<T>,
  intervalMs: number,
  enabled = true
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const run = async () => {
      try {
        const d = await fetcher();
        if (alive) {
          setData(d);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    };
    run();
    const id = setInterval(run, intervalMs);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [fetcher, intervalMs, enabled]);

  return { data, error };
}

/* ── Health ── */
export function useHealth() {
  const fetcher = useCallback(() => api.health(), []);
  return usePoll<HealthResponse>(fetcher, 15_000);
}

/* ── Orchestrator snapshot (live pipeline state) ── */
export function useOrchestrator(enabled = true) {
  const fetcher = useCallback(() => api.orchestratorLive(), []);
  return usePoll<OrchestratorSnapshot>(fetcher, 2_000, enabled);
}

/* ── Orchestrator events (activity log) ── */
export function useOrchestratorEvents(enabled = true) {
  const fetcher = useCallback(() => api.orchestratorEvents(), []);
  return usePoll<OrchestratorEvent[]>(fetcher, 3_000, enabled);
}

/* ── Agent status (thinking line) ── */
export function useAgentStatus(enabled = true) {
  const fetcher = useCallback(() => api.agentStatus(), []);
  return usePoll<AgentStatus>(fetcher, 1_500, enabled);
}

/* ── Thinking line text generator ── */
const THINKING_MESSAGES: Record<string, (ctx: AgentStatus) => string> = {
  idle: () => "Waiting for your input...",
  researching: (ctx) =>
    `Looking into ${ctx.app_id || "your app"} to understand what needs building...`,
  decomposing: (ctx) =>
    `Breaking ${ctx.app_id || "your app"} into features and figuring out the build order...`,
  matching_donors: (ctx) =>
    ctx.feature_id
      ? `Finding the best open-source patterns for ${ctx.feature_id}...`
      : "Searching the knowledge graph for relevant patterns...",
  promoting: (ctx) =>
    ctx.feature_id
      ? `Checking if ${ctx.feature_id} has everything it needs to build safely...`
      : "Running promotion gates on the feature plan...",
  building: (ctx) => {
    const done = ctx.completed_features ?? 0;
    const total = ctx.total_features ?? 0;
    const feat = ctx.feature_id || "a feature";
    if (total > 0)
      return `Building ${feat} now (${done}/${total} complete)...`;
    return `Building ${feat}...`;
  },
  verifying: (ctx) =>
    ctx.feature_id
      ? `Checking ${ctx.feature_id} against the spec and running validators...`
      : "Running post-build verification...",
  blocked: (ctx) =>
    ctx.feature_id
      ? `${ctx.feature_id} is blocked — I need your input to continue.`
      : "Something is blocked. Check the attention queue.",
  failed: (ctx) =>
    ctx.feature_id
      ? `${ctx.feature_id} failed. Looking at what went wrong...`
      : "A build step failed. Reviewing the error...",
  complete: (ctx) => {
    const total = ctx.total_features ?? 0;
    const failed = ctx.failed_features ?? 0;
    if (failed > 0)
      return `Done — ${total - failed} features built, ${failed} need attention.`;
    return `All ${total} features built and verified. Everything passed.`;
  },
};

export function useThinkingText(agentStatus: AgentStatus | null): string {
  if (!agentStatus) return "Connecting to AES...";
  const phase = agentStatus.phase ?? "idle";
  const generator = THINKING_MESSAGES[phase] ?? THINKING_MESSAGES.idle;
  return generator!(agentStatus);
}

/* ── Orchestrator SSE Stream ── */
export interface SSEMessage {
  event: string;
  data: Record<string, unknown>;
  timestamp: number;
}

export function useOrchestratorStream(jobId: string | null) {
  const [messages, setMessages] = useState<SSEMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEMessage | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const url = orchestrator.streamUrl(jobId);
    const es = new EventSource(url);
    eventSourceRef.current = es;

    const handleEvent = (type: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const msg: SSEMessage = { event: type, data, timestamp: Date.now() };
        setMessages((prev) => [...prev, msg]);
        setLastEvent(msg);
      } catch {
        // ignore malformed events
      }
    };

    es.addEventListener("connected", () => setConnected(true));
    es.addEventListener("gate", handleEvent("gate"));
    es.addEventListener("step", handleEvent("step"));
    es.addEventListener("success", handleEvent("success"));
    es.addEventListener("fail", handleEvent("fail"));
    es.addEventListener("warn", handleEvent("warn"));
    es.addEventListener("pause", handleEvent("pause"));
    es.addEventListener("feature", handleEvent("feature"));
    es.addEventListener("needs_approval", handleEvent("needs_approval"));
    es.addEventListener("needs_confirmation", handleEvent("needs_confirmation"));
    es.addEventListener("complete", handleEvent("complete"));
    es.addEventListener("error", handleEvent("error"));

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [jobId]);

  return { messages, connected, lastEvent };
}

/* ── Orchestrator Health ── */
export function useOrchestratorHealth() {
  const fetcher = useCallback(() => orchestrator.health(), []);
  return usePoll<{ status: string; version: string }>(fetcher, 15_000);
}

/* ── Orchestrator Job Status (polling) ── */
export function useOrchestratorJobStatus(jobId: string | null, enabled = true) {
  const fetcher = useCallback(
    () => (jobId ? orchestrator.jobStatus(jobId) : Promise.reject("no job")),
    [jobId]
  );
  return usePoll<OrchestratorJobStatus>(fetcher, 3_000, enabled && !!jobId);
}

/* ── Orchestrator Job List ── */
export function useOrchestratorJobs(enabled = true) {
  const fetcher = useCallback(() => orchestrator.listJobs(), []);
  return usePoll(fetcher, 10_000, enabled);
}
