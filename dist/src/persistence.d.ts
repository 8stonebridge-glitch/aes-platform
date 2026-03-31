/**
 * Postgres persistence layer for AES v12.
 * Writes artifacts to the aes-artifacts schema tables.
 * Reads back for replay and reconstruction.
 */
export declare function ensureUUID(id: string): string;
import type { IntentBrief, AppSpec, FeatureBridge, ValidationResult, VetoResult, ApprovalRecord, LogEntry, FixTrailEntry, BuilderRunRecord } from "./types/artifacts.js";
export interface JobSnapshotRow {
    job_id: string;
    request_id?: string | null;
    raw_request?: string | null;
    current_gate?: string | null;
    intent_confirmed?: boolean | null;
    user_approved?: boolean | null;
    deploy_target?: string | null;
    autonomous?: boolean | null;
    target_path?: string | null;
    preview_url?: string | null;
    deployment_url?: string | null;
    error_message?: string | null;
    design_mode?: string | null;
    design_brief?: any;
    design_evidence?: any;
    feature_build_order?: string[] | null;
    feature_build_index?: number | null;
    feature_bridges?: any;
    validator_results?: any;
    build_results?: any;
    last_log_at?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    schema_version?: number | null;
}
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
    persistJobSnapshot(jobId: string, snapshot: JobSnapshotRow): Promise<void>;
    loadJobSnapshot(jobId: string): Promise<JobSnapshotRow | null>;
    listJobSnapshots(limit?: number): Promise<JobSnapshotRow[]>;
    close(): Promise<void>;
}
