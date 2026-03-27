"use client";

import { motion, AnimatePresence } from "motion/react";
import type { OrchestratorFeature } from "@/lib/api";

const STAGES = [
  { id: "research", label: "Research" },
  { id: "plan", label: "Plan" },
  { id: "approve", label: "Approve" },
  { id: "build", label: "Build" },
  { id: "verify", label: "Verify" },
];

/* Map backend stage names to our stage ids */
const STAGE_MAP: Record<string, string> = {
  raw: "research",
  evidence_gathered: "research",
  researching: "research",
  derived: "plan",
  decomposed: "plan",
  validated: "approve",
  promoted: "approve",
  donors_found: "approve",
  execution_ready: "approve",
  executing: "build",
  building: "build",
  executed: "verify",
  verified: "verify",
  canonical: "verify",
  complete: "verify",
};

function mapStage(backendStage: string): string {
  return STAGE_MAP[backendStage] ?? "research";
}

const STATUS_STYLES: Record<string, string> = {
  research:
    "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--blue)]",
  plan: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  approve:
    "border-[var(--amber)] bg-[var(--amber-soft)] text-[var(--amber)]",
  build: "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]",
  verify:
    "border-[var(--green)] bg-[var(--green-soft)] text-[var(--green)]",
};

interface PipelineViewProps {
  features: OrchestratorFeature[];
  activePhase?: string;
  onApprove?: () => void;
}

export function PipelineView({
  features,
  activePhase,
  onApprove,
}: PipelineViewProps) {
  const currentStageId = activePhase ? mapStage(activePhase) : undefined;

  // Group features by their mapped stage
  const featuresByStage: Record<string, OrchestratorFeature[]> = {};
  for (const s of STAGES) featuresByStage[s.id] = [];
  for (const f of features) {
    const stage = mapStage(f.stage);
    if (featuresByStage[stage]) featuresByStage[stage]!.push(f);
  }

  // Check if we're at the approve gate
  const atApproveGate =
    currentStageId === "approve" &&
    featuresByStage["approve"]!.length > 0 &&
    featuresByStage["build"]!.length === 0;

  return (
    <div className="space-y-6">
      {/* Stage rail */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const isActive = currentStageId === stage.id;
          const isPast =
            currentStageId &&
            STAGES.findIndex((s) => s.id === currentStageId) >
              STAGES.findIndex((s) => s.id === stage.id);
          const count = featuresByStage[stage.id]?.length ?? 0;

          return (
            <div key={stage.id} className="flex items-center">
              <div className="flex flex-col items-center">
                {/* Stage dot */}
                <div className="relative">
                  <motion.div
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
                      isActive
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : isPast
                          ? "border-[var(--green)] bg-[var(--green)] text-white"
                          : "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-muted)]"
                    }`}
                    animate={isActive ? { scale: [1, 1.08, 1] } : {}}
                    transition={
                      isActive
                        ? { duration: 2, repeat: Infinity }
                        : undefined
                    }
                  >
                    {isPast ? "✓" : count > 0 ? count : i + 1}
                  </motion.div>
                </div>
                {/* Stage label */}
                <span
                  className={`mt-1.5 text-xs font-medium ${isActive ? "text-[var(--accent)]" : isPast ? "text-[var(--green)]" : "text-[var(--text-muted)]"}`}
                >
                  {stage.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STAGES.length - 1 && (
                <div
                  className={`mx-1 h-0.5 w-8 sm:w-12 md:w-16 ${isPast ? "bg-[var(--green)]" : "bg-[var(--border)]"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Feature cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        <AnimatePresence mode="popLayout">
          {features.map((f) => (
            <FeatureCard key={f.feature_id} feature={f} />
          ))}
        </AnimatePresence>
      </div>

      {/* Approve gate controls */}
      {atApproveGate && onApprove && (
        <motion.div
          className="flex items-center justify-center gap-3 rounded-lg border border-[var(--amber)] bg-[var(--amber-soft)] p-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="text-sm text-[var(--text-primary)]">
            {features.length} features ready for approval
          </span>
          <button
            onClick={onApprove}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
          >
            Approve Plan
          </button>
        </motion.div>
      )}
    </div>
  );
}

/* ── Feature Card ── */

function FeatureCard({ feature }: { feature: OrchestratorFeature }) {
  const stage = mapStage(feature.stage);
  const style = STATUS_STYLES[stage] ?? "";
  const isBuilding = stage === "build";
  const isDone = stage === "verify";
  const isFailed = feature.stage === "failed";

  return (
    <motion.div
      layout
      layoutId={feature.feature_id}
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className={`relative overflow-hidden rounded-lg border p-3.5 ${
        isFailed
          ? "border-[var(--red)] bg-[var(--red-soft)]"
          : isDone
            ? "border-[var(--green)] bg-[var(--green-soft)]"
            : "border-[var(--border)] bg-[var(--bg-card)]"
      }`}
    >
      {/* Building shimmer */}
      {isBuilding && (
        <motion.div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            background:
              "linear-gradient(90deg, transparent, var(--accent), transparent)",
          }}
          animate={{ x: ["-100%", "100%"] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
      )}

      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold leading-tight text-[var(--text-primary)]">
            {feature.name}
          </h3>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style}`}
          >
            {feature.stage}
          </span>
        </div>

        {feature.dependencies.length > 0 && (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">
            needs {feature.dependencies.join(", ")}
          </p>
        )}
      </div>
    </motion.div>
  );
}
