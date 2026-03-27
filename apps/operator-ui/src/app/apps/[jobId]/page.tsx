"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { orchestrator } from "@/lib/api";
import type { OrchestratorJobStatus } from "@/lib/api";

type LogEntry = { gate: string; message: string; timestamp: string };

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

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.jobId as string;

  const [status, setStatus] = useState<OrchestratorJobStatus | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([
        orchestrator.jobStatus(jobId),
        orchestrator.jobLogs(jobId).catch(() => [] as LogEntry[]),
      ]);
      setStatus(s);
      setLogs(l);
      setError("");
    } catch (err) {
      setError(`Failed to load job: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 8_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-sm text-[var(--text-muted)]">Loading job...</p>
      </div>
    );
  }

  if (error && !status) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-600">{error}</p>
          <Link href="/apps" className="mt-3 inline-block text-xs text-[var(--accent)] hover:underline">
            Back to Apps
          </Link>
        </div>
      </div>
    );
  }

  const spec = status?.appSpec;
  const features = status?.features ?? [];
  const bridges = status?.featureBridges ?? {};
  const vetoes = status?.vetoResults ?? [];

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside
        className="flex shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-sidebar)]"
        style={{ width: 220 }}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-6 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--text-primary)] text-xs font-bold text-white">
              A
            </div>
            <span className="text-[15px] font-semibold tracking-tight">AES</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4">
          <div className="space-y-0.5">
            <Link
              href="/"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <circle cx="7" cy="7" r="3" fill="#A8A29E" />
              </svg>
              Builds
            </Link>
            <Link
              href="/apps"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="#1C1917" />
              </svg>
              Apps
            </Link>
            <Link
              href="/"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <circle cx="7" cy="7" r="3" stroke="#A8A29E" strokeWidth="1.5" fill="none" />
              </svg>
              Graph
            </Link>
            <Link
              href="/"
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-card)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <path d="M7 3v4l2.5 1.5" stroke="#A8A29E" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                <circle cx="7" cy="7" r="4.5" stroke="#A8A29E" strokeWidth="1.5" fill="none" />
              </svg>
              History
            </Link>
          </div>
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {/* Breadcrumb */}
          <div className="mb-4 flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Link href="/apps" className="hover:text-[var(--text-primary)]">
              Apps
            </Link>
            <span>/</span>
            <span className="font-mono text-[var(--text-secondary)]">{jobId}</span>
          </div>

          {/* Header */}
          {status && (
            <div className="mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-lg font-semibold font-mono text-[var(--text-primary)]">
                  {status.jobId}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${gateBadgeClass(status.currentGate)}`}
                >
                  {status.currentGate}
                </span>
                {status.intentConfirmed && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    intent confirmed
                  </span>
                )}
                {status.userApproved && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    approved
                  </span>
                )}
              </div>
              {status.previewUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Preview:</span>
                  <a
                    href={status.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded bg-green-50 px-2 py-0.5 font-mono text-[11px] text-green-600 underline hover:bg-green-100"
                  >
                    {status.previewUrl}
                  </a>
                </div>
              )}
              {status.targetPath && !status.previewUrl && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Output:</span>
                  <code className="rounded bg-[var(--bg-sidebar)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                    {status.targetPath}
                  </code>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {status?.errorMessage && (
            <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-xs font-medium text-red-700">Error</p>
              <p className="mt-1 text-sm text-red-600">{status.errorMessage}</p>
            </div>
          )}

          <div className="space-y-6">
            {/* App Spec */}
            {spec && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  App Spec
                </h2>
                <p className="text-sm font-medium text-[var(--text-primary)]">{spec.title}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  {String(spec.app_class).replace(/_/g, " ")} · {spec.features} features · {spec.roles} roles
                </p>
                {spec.confidence != null && !isNaN(Number(spec.confidence)) && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                      <span>Confidence</span>
                      <span>{Math.round(Number(spec.confidence) * 100)}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[var(--border)]">
                      <div
                        className="h-1.5 rounded-full bg-green-500 transition-all"
                        style={{ width: `${Math.round(Number(spec.confidence) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Features */}
            {features.length > 0 && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Features ({features.length})
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="pb-2 pr-4 font-medium">Feature</th>
                        <th className="pb-2 pr-4 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {features.map((f, i) => (
                        <tr key={i} className="border-b border-[var(--border)] last:border-0">
                          <td className="py-2 pr-4 font-mono text-[var(--text-primary)]">{f}</td>
                          <td className="py-2 pr-4">
                            {bridges[f] ? (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                                bridged
                              </span>
                            ) : (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
                                pending
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Bridges */}
            {Object.keys(bridges).length > 0 && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Bridges ({Object.keys(bridges).length})
                </h2>
                <div className="space-y-2">
                  {Object.entries(bridges).map(([featureId, bridge]) => {
                    const b = bridge as Record<string, unknown>;
                    return (
                      <div key={featureId} className="rounded border border-[var(--border)] px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-mono text-[var(--text-primary)]">{featureId}</span>
                          {b.confidence != null && !isNaN(Number(b.confidence)) && (
                            <span className="text-[10px] text-[var(--text-muted)]">
                              confidence: {Math.round(Number(b.confidence) * 100)}%
                            </span>
                          )}
                        </div>
                        {b.risk_score != null && (
                          <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                            Risk: {String(b.risk_score)}
                          </p>
                        )}
                        {Array.isArray(b.write_paths) && b.write_paths.length > 0 && (
                          <p className="mt-0.5 text-[10px] font-mono text-[var(--text-muted)]">
                            Writes: {(b.write_paths as string[]).join(", ")}
                          </p>
                        )}
                        {b.blocked_reason ? (
                          <p className="mt-0.5 text-[10px] text-red-600">
                            Blocked: {String(b.blocked_reason)}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Veto Results */}
            {vetoes.length > 0 && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Veto Results ({vetoes.length})
                </h2>
                <div className="space-y-2">
                  {vetoes.map((v, i) => {
                    const veto = v as Record<string, unknown>;
                    const triggered = veto.status === "triggered" || veto.triggered === true;
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div
                          className={`h-2 w-2 rounded-full ${triggered ? "bg-red-500" : "bg-green-500"}`}
                        />
                        <span className="text-xs text-[var(--text-secondary)]">
                          {String(veto.name ?? veto.gate ?? `Veto ${i + 1}`)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            triggered
                              ? "bg-red-100 text-red-700"
                              : "bg-green-100 text-green-700"
                          }`}
                        >
                          {triggered ? "triggered" : "clear"}
                        </span>
                        {veto.reason ? (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            {String(veto.reason)}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-card)] p-5">
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Logs ({logs.length})
                </h2>
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {logs.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 py-0.5">
                      <span className="shrink-0 text-[10px] font-mono text-[var(--text-muted)]">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${gateBadgeClass(entry.gate)}`}
                      >
                        {entry.gate}
                      </span>
                      <span className="text-[11px] text-[var(--text-secondary)]">
                        {entry.message}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
