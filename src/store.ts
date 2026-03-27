/**
 * Job store with write-through Postgres persistence.
 * In-memory Map for fast reads during CLI streaming.
 * Postgres for durability and replay.
 */

import type { PersistenceLayer } from "./persistence.js";
import type {
  IntentBrief,
  AppSpec,
  FeatureBridge,
  ValidationResult,
  VetoResult,
  LogEntry,
  FixTrailEntry,
  BuilderRunRecord,
} from "./types/artifacts.js";
import { CURRENT_SCHEMA_VERSION } from "./types/artifacts.js";

export type DurabilityStatus = "confirmed" | "partial" | "memory_only";

export interface JobRecord {
  jobId: string;
  requestId: string;
  rawRequest: string;
  currentGate: string;
  createdAt: string;
  durability: DurabilityStatus;
  intentBrief?: IntentBrief;
  intentConfirmed?: boolean;
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
  deploymentUrl?: string | null;
  errorMessage?: string | null;
}

export class JobStore {
  private jobs: Map<string, JobRecord> = new Map();
  private logs: Map<string, LogEntry[]> = new Map();
  private latestJobId: string | null = null;
  private persistence: PersistenceLayer | null = null;

  setPersistence(p: PersistenceLayer): void {
    this.persistence = p;
  }

  hasPersistence(): boolean {
    return this.persistence !== null;
  }

  getPersistence(): PersistenceLayer | null {
    return this.persistence;
  }

  create(job: JobRecord): void {
    const durability: DurabilityStatus = this.persistence ? "memory_only" : "memory_only";
    this.jobs.set(job.jobId, { ...job, durability, createdAt: new Date().toISOString() });
    this.logs.set(job.jobId, []);
    this.latestJobId = job.jobId;
  }

  get(jobId: string): JobRecord | undefined {
    return this.jobs.get(jobId);
  }

  getLatest(): JobRecord | undefined {
    if (!this.latestJobId) return undefined;
    return this.jobs.get(this.latestJobId);
  }

  update(jobId: string, updates: Partial<JobRecord>): void {
    const existing = this.jobs.get(jobId);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    this.jobs.set(jobId, updated);

    // Write-through to Postgres (don't block pipeline, but track failures)
    if (this.persistence) {
      this.persistArtifacts(jobId, existing, updates)
        .then(() => {
          const job = this.jobs.get(jobId);
          if (job) {
            job.durability = "confirmed";
          }
        })
        .catch((err) => {
          console.error(`[persistence] Write failed for ${jobId}:`, err.message);
          const job = this.jobs.get(jobId);
          if (job) {
            job.durability = "partial";
          }
        });
    }
  }

  addLog(jobId: string, entry: Omit<LogEntry, "timestamp" | "level">): void {
    const full: LogEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
      level: "info",
      schema_version: CURRENT_SCHEMA_VERSION,
    };
    const logs = this.logs.get(jobId);
    if (logs) logs.push(full);

    if (this.persistence) {
      this.persistence.persistLog(jobId, full).catch((err) => {
        console.error(`[persistence] Log write failed for ${jobId}:`, err.message);
      });
    }
  }

  addFixTrail(jobId: string, entry: FixTrailEntry): void {
    const job = this.jobs.get(jobId);
    if (job) {
      if (!job.fixTrailEntries) job.fixTrailEntries = [];
      job.fixTrailEntries.push(entry);
    }

    if (this.persistence) {
      this.persistence.persistFixTrail(entry).catch((err) => {
        console.error(`[persistence] FixTrail write failed for ${jobId}:`, err.message);
      });
    }
  }

  getLogs(jobId: string): LogEntry[] {
    return this.logs.get(jobId) || [];
  }

  list(): JobRecord[] {
    return Array.from(this.jobs.values());
  }

  // ─── Postgres reconstruction ───────────────────────────────────────

  async loadFromPostgres(jobId: string): Promise<JobRecord | null> {
    if (!this.persistence) return null;

    // Check if already in memory
    const cached = this.jobs.get(jobId);
    if (cached) return cached;

    // Reconstruct from Postgres artifacts
    const brief = await this.persistence.loadIntentBrief(jobId);
    if (!brief) return null;

    const job: JobRecord = {
      jobId,
      requestId: brief.request_id,
      rawRequest: brief.raw_request,
      currentGate: "unknown",
      createdAt: brief.created_at,
      durability: "confirmed", // loaded from Postgres, so it's confirmed
      intentBrief: brief,
      intentConfirmed: brief.confirmation_status === "confirmed" ||
        brief.confirmation_status === "auto_confirmed_low_ambiguity",
    };

    // Try to load AppSpec
    // We need to find the app_id — check app_specs by request_id
    const appSpecRow = await this.persistence.loadAppSpecByRequestId(jobId);
    if (appSpecRow) {
      job.appSpec = appSpecRow;
      job.currentGate = "gate_1";

      // Load bridges
      const bridges = await this.persistence.loadFeatureBridges(appSpecRow.app_id);
      if (Object.keys(bridges).length > 0) {
        job.featureBridges = bridges;
        job.featureBuildOrder = Object.keys(bridges);
        job.currentGate = "gate_2";

        // Load vetoes
        const bridgeIds = Object.values(bridges)
          .filter((b) => b.bridge_id)
          .map((b) => b.bridge_id);
        const vetoes = await this.persistence.loadVetoResults(bridgeIds);
        if (vetoes.length > 0) {
          job.vetoResults = vetoes;
          const anyTriggered = vetoes.some((v) => v.triggered);
          job.currentGate = anyTriggered ? "failed" : "gate_3";
        }
      }

      // Load approval
      const approval = await this.persistence.loadApproval(jobId);
      if (approval) {
        job.userApproved = approval.approved;
      }
    }

    // Load validation results
    const validationResults = await this.persistence.loadValidationResults(jobId);
    if (validationResults.length > 0) {
      job.specValidationResults = validationResults;
    }

    // Load fix trails
    const fixTrails = await this.persistence.loadFixTrails(jobId);
    if (fixTrails.length > 0) {
      job.fixTrailEntries = fixTrails;
    }

    // Load builder runs
    const builderRuns = await this.persistence.loadBuilderRuns(jobId);
    if (builderRuns.length > 0) {
      job.builderRuns = builderRuns;
    }

    // Cache it
    this.jobs.set(jobId, job);

    // Load logs
    const logs = await this.persistence.loadLogs(jobId);
    this.logs.set(jobId, logs);

    return job;
  }

  async loadLogsFromPostgres(jobId: string): Promise<LogEntry[]> {
    if (!this.persistence) return [];
    return this.persistence.loadLogs(jobId);
  }

  async listFromPostgres(): Promise<{ job_id: string; raw_request: string; created_at: string }[]> {
    if (!this.persistence) return [];
    return this.persistence.listJobs();
  }

  // ─── Write-through logic ───────────────────────────────────────────

  private async persistArtifacts(
    jobId: string,
    before: JobRecord,
    updates: Partial<JobRecord>
  ): Promise<void> {
    const p = this.persistence!;
    const after = { ...before, ...updates };

    // Intent brief created or updated
    if (updates.intentBrief && !before.intentBrief) {
      await p.persistIntentBrief(jobId, updates.intentBrief);
    } else if (updates.intentBrief && before.intentBrief) {
      await p.updateIntentBriefStatus(
        updates.intentBrief.request_id,
        updates.intentBrief.confirmation_status
      );
    }

    // AppSpec created
    if (updates.appSpec && !before.appSpec) {
      const dbId = await p.persistAppSpec(jobId, updates.appSpec);
      // Store the DB ID for later references
      this.jobs.get(jobId)!.appSpecDbId = dbId;
    }

    // Validation results
    if (updates.specValidationResults) {
      await p.persistValidationResults(
        jobId,
        jobId,
        jobId,
        updates.specValidationResults as ValidationResult[]
      );
    }

    // User approval
    if (updates.userApproved !== undefined && after.appSpec) {
      const appSpecDbId = this.jobs.get(jobId)?.appSpecDbId;
      if (appSpecDbId) {
        await p.persistApproval({
          job_id: jobId,
          app_spec_id: appSpecDbId,
          approval_type: "app_plan_approval",
          approved: updates.userApproved,
          schema_version: CURRENT_SCHEMA_VERSION,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Feature bridges compiled
    if (updates.featureBridges && after.appSpec) {
      const bridges = updates.featureBridges as Record<string, FeatureBridge>;
      const hasCompiledBridges = Object.values(bridges).some((b) => b.bridge_id);
      if (hasCompiledBridges) {
        // Use the DB row ID from the app_specs insert, not the app_id
        const appSpecDbId = this.jobs.get(jobId)?.appSpecDbId || after.appSpec.app_id;
        await p.persistFeatureBridges(jobId, appSpecDbId, bridges);
      }
    }

    // Veto results
    if (updates.vetoResults && after.featureBridges) {
      await p.persistVetoResults(jobId, after.featureBridges as Record<string, FeatureBridge>);
    }

    // FixTrail entries
    if (updates.fixTrailEntries) {
      for (const entry of updates.fixTrailEntries) {
        await p.persistFixTrail(entry);
      }
    }
  }
}

let instance: JobStore | null = null;

export function getJobStore(): JobStore {
  if (!instance) {
    instance = new JobStore();
  }
  return instance;
}

export function resetJobStore(): void {
  instance = null;
}
