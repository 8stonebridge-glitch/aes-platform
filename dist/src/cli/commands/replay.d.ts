/**
 * Replay a prior run from Postgres without re-executing anything.
 * Reconstructs and displays the full gate-by-gate trace.
 */
export declare function replayCommand(jobId: string): Promise<void>;
