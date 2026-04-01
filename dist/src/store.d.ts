/**
 * Job store with write-through Postgres persistence.
 * In-memory Map for fast reads during CLI streaming.
 * Postgres for durability and replay.
 */
import type { PersistenceLayer } from "./persistence.js";
import type { IntentBrief, AppSpec, FeatureBridge, ValidationResult, VetoResult, LogEntry, FixTrailEntry, BuilderRunRecord, CheckpointRecord } from "./types/artifacts.js";
export type DurabilityStatus = "confirmed" | "partial" | "persisted" | "memory_only";
export interface JobRecord {
    jobId: string;
    requestId: string;
    rawRequest: string;
    currentGate: string;
    createdAt: string;
    durability: DurabilityStatus;
    intentBrief?: IntentBrief;
    intentConfirmed?: boolean;
    clarification?: string;
    appSpec?: AppSpec;
    appSpecDbId?: string;
    specValidationResults?: ValidationResult[];
    specRetryCount?: number;
    userApproved?: boolean;
    featureBridges?: Record<string, FeatureBridge>;
    featureBuildOrder?: string[];
    featureBuildIndex?: number;
    buildResults?: Record<string, unknown>;
    validatorResults?: Record<string, unknown>;
    vetoResults?: VetoResult[];
    fixTrailEntries?: FixTrailEntry[];
    builderRuns?: BuilderRunRecord[];
    targetPath?: string | null;
    deployTarget?: "local" | "cloudflare" | "vercel";
    autonomous?: boolean;
    previewUrl?: string | null;
    deploymentUrl?: string | null;
    errorMessage?: string | null;
    designMode?: "auto" | "paper";
    designBrief?: any;
    designEvidence?: any;
}
interface HermesReleaseEvent {
    artifactType: string;
    rawMessage: string;
    payload?: Record<string, unknown> | null;
    source?: string;
    sessionId?: string | null;
    promotable?: boolean;
    trafficClass?: "incident" | "coordination";
}
interface HermesRepairOutcomeEvent {
    pattern: string;
    category: string;
    diagnosis: string;
    fixAction: string;
    fixType?: string;
    filesChanged?: string[];
    success: boolean;
    errorSnippet: string;
    service?: string;
}
export declare class JobStore {
    private jobs;
    private logs;
    private checkpoints;
    private latestJobId;
    private persistence;
    private dbAvailable;
    private consecutiveFailures;
    private healthCheckTimer;
    /** Evict oldest completed jobs when the map exceeds MAX_IN_MEMORY_JOBS. */
    private evictIfNeeded;
    setPersistence(p: PersistenceLayer): void;
    hasPersistence(): boolean;
    getPersistence(): PersistenceLayer | null;
    /**
     * Run CREATE TABLE IF NOT EXISTS for every table the store touches.
     * Call this once during startup, before any reads or writes.
     * Uses the persistence layer's pool via a raw query through the
     * persistence interface if available, otherwise is a no-op.
     */
    initSchema(): Promise<void>;
    addCheckpoint(record: CheckpointRecord): Promise<void>;
    listCheckpoints(jobId: string, limit?: number): Promise<CheckpointRecord[]>;
    latestCheckpoint(jobId: string): Promise<CheckpointRecord | null>;
    /**
     * Test the database connection by running a trivial query.
     * Returns true if the connection is healthy, false otherwise.
     */
    checkDbHealth(): Promise<boolean>;
    private recordPersistenceSuccess;
    private recordPersistenceFailure;
    private markDbUnavailable;
    /** Whether the store should attempt DB writes right now. */
    private shouldWrite;
    private toSnapshot;
    private pushSnapshotToHermes;
    private postToHermes;
    private postRepairOutcomeToHermes;
    recordHermesReleaseEvent(event: HermesReleaseEvent): void;
    recordHermesRepairOutcome(outcome: HermesRepairOutcomeEvent): void;
    private startHealthCheckTimer;
    private stopHealthCheckTimer;
    create(job: JobRecord): void;
    get(jobId: string): JobRecord | undefined;
    getLatest(): JobRecord | undefined;
    update(jobId: string, updates: Partial<JobRecord>): void;
    addLog(jobId: string, entry: Omit<LogEntry, "timestamp" | "level">): void;
    addFixTrail(jobId: string, entry: FixTrailEntry): void;
    getLogs(jobId: string): LogEntry[];
    list(): JobRecord[];
    loadFromPostgres(jobId: string): Promise<JobRecord | null>;
    loadLogsFromPostgres(jobId: string): Promise<LogEntry[]>;
    listFromPostgres(): Promise<{
        job_id: string;
        raw_request: string;
        created_at: string;
        current_gate?: string | null;
        deploy_target?: string | null;
        autonomous?: boolean | null;
        preview_url?: string | null;
        updated_at?: string | null;
    }[]>;
    private persistArtifacts;
    /** Stop background timers. Call when tearing down the store. */
    dispose(): void;
}
export declare function getJobStore(): JobStore;
export declare function resetJobStore(): void;
export {};
