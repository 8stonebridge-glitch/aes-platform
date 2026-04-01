"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import type { AttentionQueue, BuildReplay } from "@/lib/api";

const GATE_COLORS: Record<string, string> = {
  gate_0: "bg-blue-100 text-blue-700",
  gate_1: "bg-indigo-100 text-indigo-700",
  gate_2: "bg-amber-100 text-amber-700",
  gate_3: "bg-orange-100 text-orange-700",
  building: "bg-yellow-100 text-yellow-700",
  complete: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function gateBadgeClass(gate: string): string {
  return GATE_COLORS[gate] ?? "bg-gray-100 text-gray-700";
}

export default function HistoryPage() {
  const [attentionQueue, setAttentionQueue] = useState<AttentionQueue | null>(null);
  const [buildId, setBuildId] = useState("");
  const [replay, setReplay] = useState<BuildReplay | null>(null);
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
    <div className="flex-1 overflow-y-auto px-6 py-6">
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
    </div>
  );
}
