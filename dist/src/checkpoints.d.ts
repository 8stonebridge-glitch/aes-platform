import type { CheckpointRecord } from "./types/artifacts.js";
/**
 * Lightweight checkpoint helper. Persists to Postgres when configured and
 * keeps an in-memory copy for local/dev.
 */
export declare function recordCheckpoint(partial: Omit<CheckpointRecord, "checkpoint_id"> & {
    checkpoint_id?: string;
}): Promise<void>;
/**
 * Invalidation model — what kinds of changes force a restart from which gate.
 */
export type InvalidationKind = "classification" | "research" | "decomposition" | "builder" | "compile_gate" | "deploy";
export declare function invalidationToResumeGate(kind: InvalidationKind): string;
