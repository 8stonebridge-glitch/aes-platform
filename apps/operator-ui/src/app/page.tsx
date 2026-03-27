"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useHealth,
  useOrchestrator,
  useOrchestratorEvents,
  useAgentStatus,
  useThinkingText,
  useOrchestratorStream,
  useOrchestratorHealth,
  useOrchestratorJobStatus,
} from "@/lib/hooks";
import { api, orchestrator as orchApi } from "@/lib/api";
import Link from "next/link";
import { ThinkingLine } from "@/components/thinking-line";
import { HealthIndicator } from "@/components/health-indicator";
import { IntentInput } from "@/components/intent-input";
import { PipelineView } from "@/components/pipeline-view";
import { DependencyGraph } from "@/components/dependency-graph";
import { ActivityTimeline } from "@/components/activity-timeline";
import { KnowledgeGraph } from "@/components/knowledge-graph";

type Tab = "builds" | "graph" | "history";

export default function Home() {
  const [tab, setTab] = useState<Tab>("builds");
  const [buildActive, setBuildActive] = useState(false);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineStage, setPipelineStage] = useState("");
  const [pipelineMessage, setPipelineMessage] = useState("");
  const [promoted, setPromoted] = useState(false);
  const [appId, setAppId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalData, setApprovalData] = useState<Record<string, unknown> | null>(null);

  const { data: health, error: healthError } = useHealth();
  const { data: orchHealth } = useOrchestratorHealth();
  const { data: orch } = useOrchestrator(buildActive);
  const { data: events } = useOrchestratorEvents(buildActive);
  const { data: agentStatus } = useAgentStatus(buildActive && !pipelineRunning);
  const agentThinkingText = useThinkingText(buildActive && !pipelineRunning ? agentStatus : null);

  // SSE stream from LangGraph orchestrator
  const { messages: sseMessages, lastEvent } = useOrchestratorStream(jobId);
  const { data: jobStatus } = useOrchestratorJobStatus(jobId, buildActive);

  // Derive thinking text from SSE events
  const sseThinkingText = lastEvent
    ? String(lastEvent.data?.message ?? lastEvent.data?.gate ?? lastEvent.event)
    : pipelineMessage;
  const thinkingText = jobId
    ? sseThinkingText
    : pipelineRunning
      ? pipelineMessage
      : agentThinkingText;

  // Map SSE gate events to pipeline stages
  useEffect(() => {
    if (!lastEvent) return;
    const { event, data } = lastEvent;

    if (event === "gate") {
      const gate = String(data.gate ?? "");
      const stageMap: Record<string, string> = {
        gate_0: "intake",
        research: "research",
        gate_1: "decompose",
        gate_2: "verify",
        gate_3: "promote",
        building: "building",
        validation: "validation",
        deploying: "deploying",
      };
      setPipelineStage(stageMap[gate] ?? gate);
      setPipelineMessage(String(data.message ?? ""));
    } else if (event === "step" || event === "success" || event === "warn") {
      setPipelineMessage(String(data.message ?? ""));
    } else if (event === "fail") {
      setPipelineMessage(`⚠ ${data.message ?? "Failed"}`);
    } else if (event === "needs_confirmation") {
      setNeedsConfirmation(true);
      setPipelineMessage(String(data.statement ?? "Confirm intent?"));
    } else if (event === "needs_approval") {
      setNeedsApproval(true);
      setApprovalData(data);
      setPipelineMessage(String(data.prompt ?? "Review and approve the plan"));
    } else if (event === "complete") {
      setPipelineRunning(false);
      const hasError = !!data.error;
      setPromoted(!hasError);
      setPipelineMessage(hasError ? String(data.error) : "Pipeline complete");
    } else if (event === "error") {
      setPipelineRunning(false);
      setPipelineMessage(`Error: ${data.message ?? "Unknown error"}`);
    } else if (event === "feature") {
      setPipelineMessage(`${data.name}: ${data.status}`);
    }
  }, [lastEvent]);

  const isConnected = !!health && !healthError;
  const orchConnected = !!orchHealth;

  const handleSubmitIntent = useCallback(
    async (intent: string, targetPath?: string, deployTarget?: "local" | "cloudflare") => {
      try {
        setBuildActive(true);
        setPipelineRunning(true);
        setPipelineStage("intake");
        setPipelineMessage("Starting orchestrator...");

        // Try LangGraph orchestrator first
        if (orchConnected) {
          const result = await orchApi.startBuild(intent, targetPath, deployTarget);
          setJobId(result.jobId);
          setPipelineMessage("Pipeline started — streaming events...");
          return;
        }

        // Fallback to legacy pipeline
        const result = await api.runPipeline(intent, (stage, message) => {
          setPipelineStage(stage);
          setPipelineMessage(message);
        });

        setAppId(result.app_id);
        setPromoted(result.promoted);
        setPipelineRunning(false);

        if (!result.promoted) {
          setPipelineMessage(result.error ?? "Pipeline blocked");
        }
      } catch (err) {
        console.error("Pipeline failed:", err);
        setPipelineRunning(false);
        setPipelineMessage(`Error: ${err}`);
      }
    },
    [orchConnected]
  );

  const handleConfirm = useCallback(async () => {
    if (!jobId) return;
    try {
      await orchApi.confirmIntent(jobId);
      setNeedsConfirmation(false);
      setPipelineMessage("Intent confirmed — continuing...");
    } catch (err) {
      console.error("Failed to confirm:", err);
    }
  }, [jobId]);

  const handleApprove = useCallback(async () => {
    if (jobId) {
      try {
        await orchApi.approvePlan(jobId);
        setNeedsApproval(false);
        setPipelineMessage("Plan approved — building...");
      } catch (err) {
        console.error("Failed to approve:", err);
      }
      return;
    }
    if (!appId) return;
    try {
      await api.appPromote(appId);
    } catch (err) {
      console.error("Failed to approve:", err);
    }
  }, [jobId, appId]);

  return (
    <div className="flex h-screen">
      {/* ── Sidebar ── */}
      <aside className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]" style={{ width: 220 }}>
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-6 py-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-xs font-bold text-white">
            A
          </div>
          <span className="text-[15px] font-semibold tracking-tight">AES</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4">
          <div className="space-y-0.5">
            {(
              [
                { id: "builds" as Tab, label: "Builds" },
                { id: "graph" as Tab, label: "Graph" },
                { id: "history" as Tab, label: "History" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] transition-colors ${
                  tab === item.id
                    ? "bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)]"
                }`}
              >
                <NavIcon id={item.id} active={tab === item.id} />
                {item.label}
              </button>
            ))}
          </div>

          {/* Apps link (separate page) */}
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <Link
              href="/apps"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <rect x="3" y="3" width="8" height="8" rx="2" stroke="#A8A29E" strokeWidth="1.5" fill="none" />
              </svg>
              Apps
            </Link>
          </div>
        </nav>

        {/* Health at bottom */}
        <div className="border-t border-[var(--border)] px-6 py-4 space-y-2">
          <HealthIndicator health={health} error={healthError} />
          {orchConnected && (
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] text-[var(--text-muted)]">
                Orchestrator {orchHealth?.version ?? "?"}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Thinking line — always visible during active build */}
        {buildActive && (
          <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)] px-7 py-3.5">
            <ThinkingLine
              text={thinkingText}
              phase={
                needsApproval || needsConfirmation
                  ? "blocked"
                  : pipelineRunning
                    ? "building"
                    : (agentStatus?.phase ?? (promoted ? "complete" : "idle"))
              }
            />
          </div>
        )}

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main stage */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {tab === "builds" && (
              <BuildsTab
                buildActive={buildActive}
                pipelineRunning={pipelineRunning}
                pipelineStage={pipelineStage}
                promoted={promoted}
                isConnected={isConnected || orchConnected}
                orchestrator={orch}
                appId={appId}
                jobId={jobId}
                jobStatus={jobStatus}
                needsConfirmation={needsConfirmation}
                needsApproval={needsApproval}
                approvalData={approvalData}
                sseMessages={sseMessages}
                onSubmitIntent={handleSubmitIntent}
                onApprove={handleApprove}
                onConfirm={handleConfirm}
              />
            )}

            {tab === "graph" && <KnowledgeGraph />}

            {tab === "history" && <HistoryTab />}
          </div>

          {/* Activity sidebar (only when build is active) */}
          {buildActive && tab === "builds" && (
            <aside className="shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-sidebar)] px-5 py-6" style={{ width: 260 }}>
              <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                Activity
              </h2>
              <ActivityTimeline events={events ?? []} />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

/* ── Pipeline Stage Indicator ── */
const PIPELINE_STAGES = [
  { id: "intake", label: "Intake" },
  { id: "research", label: "Research" },
  { id: "decompose", label: "Decompose" },
  { id: "verify", label: "Verify" },
  { id: "promote", label: "Promote" },
  { id: "building", label: "Build" },
  { id: "validation", label: "Validate" },
  { id: "deploying", label: "Deploy" },
] as const;

function PipelineStageRail({ currentStage }: { currentStage: string }) {
  const stageOrder = PIPELINE_STAGES.map((s) => s.id);
  const currentIdx = stageOrder.indexOf(currentStage as typeof stageOrder[number]);

  return (
    <div className="flex items-center gap-1">
      {PIPELINE_STAGES.map((stage, i) => {
        const isDone = i < currentIdx || currentStage === "promoted";
        const isActive = i === currentIdx && currentStage !== "promoted";
        return (
          <div key={stage.id} className="flex items-center gap-1">
            {i > 0 && (
              <div
                className={`h-px w-6 ${isDone ? "bg-green-500" : "bg-[var(--border)]"}`}
              />
            )}
            <div className="flex items-center gap-1.5">
              <div
                className={`h-2.5 w-2.5 rounded-full transition-colors ${
                  isDone
                    ? "bg-green-500"
                    : isActive
                      ? "bg-[var(--accent)] animate-pulse"
                      : "bg-[var(--border)]"
                }`}
              />
              <span
                className={`text-[11px] ${
                  isDone
                    ? "text-green-600 font-medium"
                    : isActive
                      ? "text-[var(--accent)] font-medium"
                      : "text-[var(--text-muted)]"
                }`}
              >
                {stage.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Builds Tab ── */
function BuildsTab({
  buildActive,
  pipelineRunning,
  pipelineStage,
  promoted,
  isConnected,
  orchestrator,
  appId,
  jobId,
  jobStatus,
  needsConfirmation,
  needsApproval,
  approvalData,
  sseMessages,
  onSubmitIntent,
  onApprove,
  onConfirm,
}: {
  buildActive: boolean;
  pipelineRunning: boolean;
  pipelineStage: string;
  promoted: boolean;
  isConnected: boolean;
  orchestrator: ReturnType<typeof useOrchestrator>["data"];
  appId: string | null;
  jobId: string | null;
  jobStatus: import("@/lib/api").OrchestratorJobStatus | null;
  needsConfirmation: boolean;
  needsApproval: boolean;
  approvalData: Record<string, unknown> | null;
  sseMessages: import("@/lib/hooks").SSEMessage[];
  onSubmitIntent: (intent: string, targetPath?: string, deployTarget?: "local" | "cloudflare") => void;
  onApprove: () => void;
  onConfirm: () => void;
}) {
  if (!buildActive) {
    return (
      <div className="flex h-full items-center justify-center">
        <IntentInput
          onSubmit={onSubmitIntent}
          disabled={!isConnected}
        />
      </div>
    );
  }

  // Human gate: needs confirmation
  if (needsConfirmation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <PipelineStageRail currentStage={pipelineStage} />
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <span className="text-lg">🤔</span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Confirm Intent
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            The system classified your intent and needs confirmation before proceeding.
          </p>
          {jobId && (
            <p className="text-xs font-mono text-[var(--text-muted)]">Job: {jobId}</p>
          )}
          <button
            onClick={onConfirm}
            className="rounded-lg bg-[var(--text-primary)] px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90"
          >
            Confirm & Continue
          </button>
        </div>
      </div>
    );
  }

  // Human gate: needs approval
  if (needsApproval) {
    const specRaw = (approvalData?.data as Record<string, unknown>)?.appSpec ?? approvalData?.appSpec;
    const spec = specRaw as Record<string, unknown> | undefined;
    return (
      <div className="flex h-full flex-col items-center gap-6 overflow-y-auto py-8">
        <PipelineStageRail currentStage="promote" />
        <div className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <span className="text-lg">📋</span>
          </div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Review & Approve Plan
          </h2>
          {spec && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-left">
              <p className="text-sm font-medium">{String(spec.title ?? "")}</p>
              {spec.summary != null && (
                <p className="mt-1 text-xs text-[var(--text-secondary)]">{String(spec.summary)}</p>
              )}
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {String(spec.app_class ?? "").replace(/_/g, " ")} · {Array.isArray(spec.features) ? spec.features.length : String(spec.features ?? 0)} features · {Array.isArray(spec.roles) ? spec.roles.length : String(spec.roles ?? 0)} roles
              </p>
              {spec.confidence != null && (
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Confidence: {Math.round(Number((spec.confidence as Record<string, unknown>)?.overall ?? spec.confidence) * 100)}%
                </p>
              )}
              {Array.isArray(spec.features) && (
                <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
                  {(spec.features as { name: string; priority: string }[]).map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${f.priority === "critical" ? "bg-red-500" : f.priority === "high" ? "bg-amber-500" : "bg-[var(--border)]"}`} />
                      <span className="text-[11px] text-[var(--text-secondary)]">{f.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {jobId && (
            <p className="text-xs font-mono text-[var(--text-muted)]">Job: {jobId}</p>
          )}
          <button
            onClick={onApprove}
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90"
          >
            Approve & Build
          </button>
        </div>
      </div>
    );
  }

  // Pipeline is running — show stage rail + SSE activity
  if (pipelineRunning) {
    // Map orchestrator gates to pipeline stage names
    const gateToStage: Record<string, string> = {
      gate_0: "intake",
      gate_1: "decompose",
      gate_2: "verify",
      gate_3: "promote",
      building: "building",
      validation: "validation",
    };
    const displayStage = gateToStage[pipelineStage] ?? pipelineStage;

    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <PipelineStageRail currentStage={displayStage} />
        <p className="text-sm text-[var(--text-secondary)]">
          {jobId ? "Orchestrator is processing your intent..." : "Processing your intent through the AES pipeline..."}
        </p>
        {jobId && (
          <p className="text-xs font-mono text-[var(--text-muted)]">
            Job: {jobId}
          </p>
        )}
        {appId && (
          <p className="text-xs text-[var(--text-muted)]">
            App: {appId}
          </p>
        )}

        {/* SSE live feed */}
        {sseMessages.length > 0 && (
          <div className="mt-4 w-full max-w-xl">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Live Events
            </h3>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-3">
              {sseMessages.slice(-20).map((msg, i) => (
                <div key={i} className="flex items-start gap-2 py-0.5">
                  <span className={`mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                    msg.event === "success" ? "bg-green-500"
                    : msg.event === "fail" ? "bg-red-500"
                    : msg.event === "warn" ? "bg-amber-500"
                    : msg.event === "gate" ? "bg-blue-500"
                    : "bg-[var(--border)]"
                  }`} />
                  <span className="text-[11px] text-[var(--text-secondary)]">
                    {String(msg.data?.message ?? msg.data?.gate ?? msg.event)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pipeline complete — orchestrator job has features
  if (jobStatus?.appSpec) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className={`h-4 w-4 rounded-full ${promoted ? "bg-green-500" : jobStatus.errorMessage ? "bg-red-500" : "bg-[var(--accent)]"}`} />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          {promoted ? "Build Complete" : jobStatus.errorMessage ? "Pipeline Failed" : "Pipeline Complete"}
        </h2>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4 text-center">
          <p className="text-sm font-medium">{jobStatus.appSpec.title}</p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {String(jobStatus.appSpec.app_class).replace(/_/g, " ")} · {jobStatus.appSpec.features} features · {jobStatus.appSpec.roles} roles
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Gate: {jobStatus.currentGate}{jobStatus.appSpec.confidence != null && !isNaN(Number(jobStatus.appSpec.confidence)) ? ` · Confidence: ${Math.round(Number(jobStatus.appSpec.confidence) * 100)}%` : ""}
          </p>
        </div>
        {jobStatus.previewUrl && (
          <a
            href={jobStatus.previewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-[var(--green)] bg-green-50 px-3 py-2 transition-colors hover:bg-green-100"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0 text-green-600">
              <path d="M5.5 9.5L2 6l1-1 2.5 2.5L11 2l1 1z" fill="currentColor" />
            </svg>
            <span className="text-[11px] font-medium text-green-700">Live preview:</span>
            <code className="font-mono text-[11px] text-green-600 underline">{jobStatus.previewUrl}</code>
          </a>
        )}
        {jobStatus.targetPath && !jobStatus.previewUrl && (
          <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-sidebar)] px-3 py-2">
            <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0 text-[var(--text-muted)]">
              <path d="M2 3.5A1.5 1.5 0 0 1 3.5 2H6l1 1.5h3.5A1.5 1.5 0 0 1 12 5v5.5A1.5 1.5 0 0 1 10.5 12h-7A1.5 1.5 0 0 1 2 10.5z" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
            <code className="font-mono text-[11px] text-[var(--text-secondary)]">{jobStatus.targetPath}</code>
          </div>
        )}
        {jobStatus.errorMessage && (
          <p className="text-xs text-red-600">{jobStatus.errorMessage}</p>
        )}
        {jobId && (
          <p className="text-xs font-mono text-[var(--text-muted)]">{jobId}</p>
        )}
      </div>
    );
  }

  // Promoted via legacy pipeline, show features
  if (promoted && orchestrator?.features?.length) {
    const features = orchestrator.features;
    return (
      <div className="space-y-8">
        <section>
          <PipelineView
            features={features}
            activePhase={orchestrator?.phase}
            onApprove={onApprove}
          />
        </section>
        {features.length > 1 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Dependencies
            </h2>
            <DependencyGraph features={features} />
          </section>
        )}
      </div>
    );
  }

  // Pipeline complete — show status
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className={`h-4 w-4 rounded-full ${promoted ? "bg-green-500" : "bg-[var(--accent)]"}`} />
      <h2 className="text-lg font-semibold text-[var(--text-primary)]">
        {promoted ? "Plan Promoted" : "Pipeline Complete"}
      </h2>
      {appId && (
        <p className="text-xs font-mono text-[var(--text-muted)]">{appId}</p>
      )}
      {jobId && (
        <p className="text-xs font-mono text-[var(--text-muted)]">{jobId}</p>
      )}
      <p className="text-sm text-[var(--text-secondary)]">
        {promoted
          ? "Features are ready. Approve to start building."
          : "Review the pipeline result. Some gates may need attention."}
      </p>
    </div>
  );
}

/* ── Nav Icon (matches Paper design) ── */
function NavIcon({ id, active }: { id: string; active: boolean }) {
  if (id === "builds") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <circle cx="7" cy="7" r="3" fill={active ? "#D97706" : "#A8A29E"} />
      </svg>
    );
  }
  if (id === "graph") {
    return (
      <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
        <circle cx="7" cy="7" r="3" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" fill="none" />
      </svg>
    );
  }
  // history
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
      <path d="M7 3v4l2.5 1.5" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="7" cy="7" r="4.5" stroke={active ? "#1C1917" : "#A8A29E"} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

/* ── History Tab ── */
function HistoryTab() {
  const [attentionQueue, setAttentionQueue] = useState<import("@/lib/api").AttentionQueue | null>(null);
  const [buildId, setBuildId] = useState("");
  const [replay, setReplay] = useState<import("@/lib/api").BuildReplay | null>(null);
  const [replayError, setReplayError] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalationLoading, setEscalationLoading] = useState<Record<string, string>>({});
  const [escalationErrors, setEscalationErrors] = useState<Record<string, string>>({});
  const [retryLoading, setRetryLoading] = useState<Record<string, boolean>>({});
  const [retryErrors, setRetryErrors] = useState<Record<string, string>>({});

  const handleEscalationAction = async (artifactId: string, action: "approve" | "reject") => {
    setEscalationLoading((prev) => ({ ...prev, [artifactId]: action }));
    setEscalationErrors((prev) => { const n = { ...prev }; delete n[artifactId]; return n; });
    try {
      if (action === "approve") {
        await api.escalationApprove(artifactId, "operator", "Approved from UI");
      } else {
        await api.escalationReject(artifactId, "operator", "Rejected from UI");
      }
      // Remove from list on success
      setAttentionQueue((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          pending_escalations: prev.pending_escalations.filter((e) => e.artifact_id !== artifactId),
        };
      });
    } catch (err) {
      setEscalationErrors((prev) => ({ ...prev, [artifactId]: `Failed to ${action}: ${err}` }));
    } finally {
      setEscalationLoading((prev) => { const n = { ...prev }; delete n[artifactId]; return n; });
    }
  };

  const handleRetryBuild = async (buildArtifactId: string) => {
    setRetryLoading((prev) => ({ ...prev, [buildArtifactId]: true }));
    setRetryErrors((prev) => { const n = { ...prev }; delete n[buildArtifactId]; return n; });
    try {
      await api.buildReplay(buildArtifactId);
      // Remove from blocked list on success
      setAttentionQueue((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          blocked_builds: prev.blocked_builds.filter((b) => b.artifact_id !== buildArtifactId),
        };
      });
    } catch (err) {
      setRetryErrors((prev) => ({ ...prev, [buildArtifactId]: `Retry failed: ${err}` }));
    } finally {
      setRetryLoading((prev) => ({ ...prev, [buildArtifactId]: false }));
    }
  };

  // Load attention queue on mount
  useEffect(() => {
    api.attentionQueue().then(setAttentionQueue).catch(() => {});
  }, []);

  const handleLoadReplay = async () => {
    if (!buildId.trim()) return;
    setLoading(true);
    setReplayError("");
    setReplay(null);
    try {
      const r = await api.buildReplay(buildId.trim());
      setReplay(r);
    } catch (err) {
      setReplayError(`Failed to load: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const blockedBuilds = attentionQueue?.blocked_builds ?? [];
  const pendingEscalations = attentionQueue?.pending_escalations ?? [];
  const staleBridges = attentionQueue?.stale_bridges ?? [];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
          Build History & Audit
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Attention items, build replays, and audit trails.
        </p>
      </div>

      {/* Attention Queue */}
      {attentionQueue && (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Attention Queue
          </h3>

          {blockedBuilds.length === 0 && pendingEscalations.length === 0 && staleBridges.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">No items needing attention.</p>
          )}

          {blockedBuilds.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-red-600">
                Blocked Builds ({blockedBuilds.length})
              </p>
              {blockedBuilds.map((item) => (
                <div
                  key={item.artifact_id}
                  className="rounded-lg border border-red-200 bg-red-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-[var(--text-primary)]">
                      {item.artifact_id}
                    </span>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                      {item.payload.status}
                    </span>
                  </div>
                  {item.payload.feature_id && (
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      Feature: {item.payload.feature_id}
                    </p>
                  )}
                  {item.payload.queued_at && (
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      Queued: {new Date(item.payload.queued_at).toLocaleString()}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => setBuildId(item.artifact_id)}
                      className="text-[11px] text-[var(--accent)] hover:underline"
                    >
                      Load replay
                    </button>
                    <button
                      onClick={() => handleRetryBuild(item.artifact_id)}
                      disabled={retryLoading[item.artifact_id]}
                      className="rounded-md bg-amber-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {retryLoading[item.artifact_id] ? "Retrying..." : "Retry"}
                    </button>
                  </div>
                  {retryErrors[item.artifact_id] && (
                    <p className="mt-1 text-[10px] text-red-600">
                      {retryErrors[item.artifact_id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {pendingEscalations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-[var(--accent)]">
                Pending Escalations ({pendingEscalations.length})
              </p>
              {pendingEscalations.map((item) => (
                <div
                  key={item.artifact_id}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-mono">{item.artifact_id}</span>
                      <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        {item.payload.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEscalationAction(item.artifact_id, "approve")}
                        disabled={!!escalationLoading[item.artifact_id]}
                        className="rounded-md bg-green-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {escalationLoading[item.artifact_id] === "approve" ? "Approving..." : "Approve"}
                      </button>
                      <button
                        onClick={() => handleEscalationAction(item.artifact_id, "reject")}
                        disabled={!!escalationLoading[item.artifact_id]}
                        className="rounded-md bg-red-600 px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        {escalationLoading[item.artifact_id] === "reject" ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                  {escalationErrors[item.artifact_id] && (
                    <p className="mt-1.5 text-[10px] text-red-600">
                      {escalationErrors[item.artifact_id]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {staleBridges.length > 0 && (
            <p className="text-xs text-[var(--text-muted)]">
              {staleBridges.length} stale bridge(s)
            </p>
          )}
        </div>
      )}

      {/* Build Replay Lookup */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Build Replay
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={buildId}
            onChange={(e) => setBuildId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleLoadReplay(); }}
            placeholder="BLD-... or paste build ID"
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm font-mono outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleLoadReplay}
            disabled={loading || !buildId.trim()}
            className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm text-white disabled:opacity-30"
          >
            {loading ? "Loading..." : "Load"}
          </button>
        </div>

        {replayError && (
          <p className="text-xs text-red-600">{replayError}</p>
        )}

        {replay && (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-mono font-medium">{replay.build_id}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                replay.build?.payload?.status === "PASSED"
                  ? "bg-green-100 text-green-700"
                  : replay.build?.payload?.status === "FAILED"
                    ? "bg-red-100 text-red-700"
                    : "bg-gray-100 text-gray-700"
              }`}>
                {replay.build?.payload?.status ?? "UNKNOWN"}
              </span>
            </div>
            {replay.build?.payload?.feature_id && (
              <p className="mt-2 text-xs text-[var(--text-secondary)]">
                Feature: {replay.build.payload.feature_id}
              </p>
            )}
            {replay.diff != null && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  Diff captured
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed">
                  {JSON.stringify(replay.diff, null, 2)}
                </pre>
              </details>
            )}
            {replay.test_run != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  Test run
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed">
                  {JSON.stringify(replay.test_run, null, 2)}
                </pre>
              </details>
            )}
            {replay.validation != null && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                  Validation
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[var(--bg-sidebar)] p-3 text-[10px] leading-relaxed">
                  {JSON.stringify(replay.validation, null, 2)}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
