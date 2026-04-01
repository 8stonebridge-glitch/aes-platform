import { randomUUID } from "node:crypto";
import { getJobStore } from "./store.js";
import type { CheckpointRecord } from "./types/artifacts.js";

/**
 * Lightweight checkpoint helper. Persists to Postgres when configured and
 * keeps an in-memory copy for local/dev.
 */
export async function recordCheckpoint(partial: Omit<CheckpointRecord, "checkpoint_id"> & { checkpoint_id?: string }): Promise<void> {
  const store = getJobStore();
  const checkpoint: CheckpointRecord = {
    checkpoint_id: partial.checkpoint_id ?? randomUUID(),
    job_id: partial.job_id,
    gate: partial.gate,
    status: partial.status,
    last_successful_gate: partial.last_successful_gate ?? null,
    workspace_path: partial.workspace_path ?? null,
    feature_ids: partial.feature_ids ?? null,
    contract_packs: partial.contract_packs ?? null,
    archetypes: partial.archetypes ?? null,
    env_snapshot: partial.env_snapshot ?? null,
    artifacts: partial.artifacts ?? null,
    raw_error: partial.raw_error ?? null,
    summarized_error: partial.summarized_error ?? null,
    resume_eligible: partial.resume_eligible ?? false,
    resume_reason: partial.resume_reason ?? null,
    invalidation_scope: partial.invalidation_scope ?? null,
    schema_version: partial.schema_version ?? 1,
  };
  await store.addCheckpoint(checkpoint);
}

/**
 * Invalidation model — what kinds of changes force a restart from which gate.
 */
export type InvalidationKind =
  | "classification"
  | "research"
  | "decomposition"
  | "builder"
  | "compile_gate"
  | "deploy";

export function invalidationToResumeGate(kind: InvalidationKind): string {
  switch (kind) {
    case "classification":
      return "gate_0";
    case "research":
      return "research";
    case "decomposition":
      return "gate_1";
    case "builder":
      return "builder_dispatcher";
    case "compile_gate":
      return "deploying";
    case "deploy":
      return "deploying";
    default:
      return "gate_0";
  }
}
