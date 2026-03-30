/**
 * Postgres persistence layer for AES v12.
 * Writes artifacts to the aes-artifacts schema tables.
 * Reads back for replay and reconstruction.
 */
export declare function ensureUUID(id: string): string;
import type { IntentBrief, AppSpec, FeatureBridge, ValidationResult, VetoResult, ApprovalRecord, LogEntry, FixTrailEntry, BuilderRunRecord } from "./types/artifacts.js";
export declare class PersistenceLayer {
    private pool;
    constructor(connectionString: string);
    initialize(): Promise<void>;
    private intentBriefDbIds;
    persistIntentBrief(jobId: string, brief: IntentBrief): Promise<void>;
    updateIntentBriefStatus(identifier: string, status: string): Promise<void>;
    persistAppSpec(jobId: string, spec: AppSpec): Promise<string>;
    persistValidationResults(jobId: string, bridgeId: string, buildRunId: string, results: ValidationResult[]): Promise<void>;
    private bridgeDbIds;
    persistFeatureBridges(jobId: string, appSpecId: string, bridges: Record<string, FeatureBridge>): Promise<void>;
    persistVetoResults(jobId: string, bridges: Record<string, FeatureBridge>): Promise<void>;
    persistApproval(approval: ApprovalRecord): Promise<void>;
    persistLog(jobId: string, entry: LogEntry): Promise<void>;
    persistFixTrail(entry: FixTrailEntry): Promise<void>;
    loadFixTrails(jobId: string): Promise<FixTrailEntry[]>;
    loadIntentBrief(requestId: string): Promise<IntentBrief | null>;
    loadAppSpecByRequestId(requestId: string): Promise<AppSpec | null>;
    loadAppSpec(appId: string): Promise<AppSpec | null>;
    loadFeatureBridges(appId: string): Promise<Record<string, FeatureBridge>>;
    loadVetoResults(bridgeIds: string[]): Promise<VetoResult[]>;
    loadValidationResults(jobId: string): Promise<ValidationResult[]>;
    loadApproval(jobId: string): Promise<ApprovalRecord | null>;
    loadLogs(jobId: string): Promise<LogEntry[]>;
    listJobs(): Promise<{
        job_id: string;
        raw_request: string;
        created_at: string;
    }[]>;
    persistBuilderRun(run: BuilderRunRecord): Promise<void>;
    updateBuilderRunStatus(runId: string, status: string, updates: Partial<BuilderRunRecord>): Promise<void>;
    loadBuilderRuns(jobId: string): Promise<BuilderRunRecord[]>;
    close(): Promise<void>;
}
