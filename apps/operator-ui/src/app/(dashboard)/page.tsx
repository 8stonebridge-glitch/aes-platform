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
import { ThinkingLine } from "@/components/thinking-line";
import { IntentInput } from "@/components/intent-input";
import { PipelineView } from "@/components/pipeline-view";
import { DependencyGraph } from "@/components/dependency-graph";
import { ActivityTimeline } from "@/components/activity-timeline";

export default function BuildsPage() {
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

  const { messages: sseMessages, lastEvent } = useOrchestratorStream(jobId);
  const { data: jobStatus } = useOrchestratorJobStatus(jobId, buildActive);

  const sseThinkingText = lastEvent
    ? String(lastEvent.data?.message ?? lastEvent.data?.gate ?? lastEvent.event)
    : pipelineMessage;
  const thinkingText = jobId
    ? sseThinkingText
    : pipelineRunning
      ? pipelineMessage
      : agentThinkingText;

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
      setPipelineMessage(`Warning: ${data.message ?? "Failed"}`);
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

  const isConnected = (!!health && !healthError) || !!orchHealth;
  const orchConnected = !!orchHealth;

  const handleSubmitIntent = useCallback(
    async (intent: string, targetPath?: string, deployTarget?: "local" | "cloudflare") => {
      try {
        setBuildActive(true);
        setPipelineRunning(true);
        setPipelineStage("intake");
        setPipelineMessage("Starting orchestrator...");

        if (orchConnected) {
          const result = await orchApi.startBuild(intent, targetPath, deployTarget);
          setJobId(result.jobId);
          setPipelineMessage("Pipeline started — streaming events...");
          return;
        }

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
    <>
      {/* Thinking line */}
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
          <BuildsContent
            buildActive={buildActive}
            pipelineRunning={pipelineRunning}
            pipelineStage={pipelineStage}
            promoted={promoted}
            isConnected={isConnected}
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
        </div>

        {/* Activity sidebar (only when build is active) */}
        {buildActive && (
          <aside className="shrink-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-sidebar)] px-5 py-6" style={{ width: 260 }}>
            <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Activity
            </h2>
            <ActivityTimeline events={events ?? []} />
          </aside>
        )}
      </div>
    </>
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

/* ── Builds Content ── */
function BuildsContent({
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

  if (needsConfirmation) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6">
        <PipelineStageRail currentStage={pipelineStage} />
        <div className="max-w-md space-y-4 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
            <span className="text-lg">?</span>
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

  if (needsApproval) {
    const specRaw = (approvalData?.data as Record<string, unknown>)?.appSpec ?? approvalData?.appSpec;
    const spec = specRaw as Record<string, unknown> | undefined;
    return (
      <div className="flex h-full flex-col items-center gap-6 overflow-y-auto py-8">
        <PipelineStageRail currentStage="promote" />
        <div className="max-w-lg space-y-4 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
            <span className="text-lg">clipboard</span>
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

  if (pipelineRunning) {
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
