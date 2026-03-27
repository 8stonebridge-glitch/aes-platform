"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { orchestrator } from "@/lib/api";

type Job = {
  jobId: string;
  intent: string;
  currentGate: string;
  features: number;
  intentConfirmed: boolean;
  userApproved: boolean;
  createdAt: string;
};

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

export default function AppsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchJobs = useCallback(async () => {
    try {
      const data = await orchestrator.listJobs();
      setJobs(data);
      setError("");
    } catch (err) {
      setError(`Failed to load jobs: ${err}`);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 10_000);
    return () => clearInterval(interval);
  }, [fetchJobs]);

  const filtered = search.trim()
    ? jobs.filter(
        (j) =>
          j.jobId.toLowerCase().includes(search.toLowerCase()) ||
          j.intent.toLowerCase().includes(search.toLowerCase()) ||
          j.currentGate.toLowerCase().includes(search.toLowerCase())
      )
    : jobs;

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
            <div className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] bg-[var(--bg-card)] font-medium text-[var(--text-primary)] shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <svg width="14" height="14" viewBox="0 0 14 14" className="shrink-0">
                <rect x="3" y="3" width="8" height="8" rx="2" fill="#1C1917" />
              </svg>
              Apps
            </div>
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
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                Apps{" "}
                <span className="ml-1 text-sm font-normal text-[var(--text-muted)]">
                  ({filtered.length})
                </span>
              </h1>
              <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                All orchestrator jobs
              </p>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, intent, or gate..."
              className="w-72 rounded-md border border-[var(--border)] bg-[var(--bg-card)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Job cards */}
          {filtered.length === 0 && !error && (
            <p className="text-sm text-[var(--text-muted)]">
              {jobs.length === 0 ? "No jobs found." : "No matching jobs."}
            </p>
          )}

          <div className="grid gap-3">
            {filtered.map((job) => (
              <Link
                key={job.jobId}
                href={`/apps/${job.jobId}`}
                className="block rounded-lg border border-[var(--border)] bg-[var(--bg-card)] px-5 py-4 transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-[var(--text-primary)]">
                        {job.jobId}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${gateBadgeClass(job.currentGate)}`}
                      >
                        {job.currentGate}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[var(--text-secondary)] truncate">
                      {job.intent.length > 80
                        ? job.intent.slice(0, 80) + "..."
                        : job.intent}
                    </p>
                  </div>
                  <div className="ml-4 shrink-0 text-right">
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {job.features} feature{job.features !== 1 ? "s" : ""}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {job.createdAt ? new Date(job.createdAt).toLocaleString() : ""}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
