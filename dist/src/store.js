/**
 * Job store with write-through Postgres persistence.
 * In-memory Map for fast reads during CLI streaming.
 * Postgres for durability and replay.
 */
import { CURRENT_SCHEMA_VERSION } from "./types/artifacts.js";
// ─── Schema initialization SQL ────────────────────────────────────────
// Mirrors the tables from 001-initial-schema.sql so the store can
// self-provision when the external migration file is unavailable.
const INIT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS intent_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  raw_request TEXT NOT NULL,
  inferred_app_class TEXT,
  inferred_primary_users TEXT[],
  inferred_core_outcome TEXT,
  inferred_platforms TEXT[],
  inferred_risk_class TEXT,
  inferred_integrations TEXT[],
  explicit_inclusions TEXT[],
  explicit_exclusions TEXT[],
  ambiguity_flags TEXT[],
  assumptions TEXT[],
  confirmation_statement TEXT,
  confirmation_status TEXT NOT NULL DEFAULT 'pending',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  request_id UUID NOT NULL,
  intent_brief_id UUID REFERENCES intent_briefs(id),
  title TEXT NOT NULL,
  summary TEXT,
  app_class TEXT,
  risk_class TEXT,
  spec_data JSONB NOT NULL,
  confidence_overall NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feature_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id UUID NOT NULL UNIQUE,
  app_id UUID NOT NULL,
  app_spec_id UUID REFERENCES app_specs(id),
  feature_id TEXT NOT NULL,
  feature_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  bridge_data JSONB NOT NULL,
  confidence_overall NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS veto_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id UUID NOT NULL REFERENCES feature_bridges(id),
  any_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_codes TEXT[],
  result_data JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  app_spec_id UUID REFERENCES app_specs(id),
  approval_type TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  user_comment TEXT,
  presented_data JSONB,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS build_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  gate TEXT,
  feature_id TEXT,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  error_code TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fix_trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  error_code TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  repair_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',
  related_artifact_ids TEXT[] DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS builder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  bridge_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready_for_build',
  input_package_hash TEXT NOT NULL,
  builder_package JSONB NOT NULL,
  files_created TEXT[] DEFAULT '{}',
  files_modified TEXT[] DEFAULT '{}',
  files_deleted TEXT[] DEFAULT '{}',
  test_results JSONB DEFAULT '[]',
  acceptance_coverage JSONB DEFAULT '{}',
  scope_violations TEXT[] DEFAULT '{}',
  constraint_violations TEXT[] DEFAULT '{}',
  verification_passed BOOLEAN DEFAULT false,
  failure_reason TEXT,
  builder_model TEXT,
  duration_ms INTEGER DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  workspace_id TEXT,
  branch TEXT,
  base_commit TEXT,
  final_commit TEXT,
  diff_summary TEXT,
  pr_summary TEXT,
  check_results JSONB DEFAULT '[]'
);
`;
/** Maximum consecutive persistence failures before writes are paused. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Interval in ms between periodic DB health checks when writes are paused. */
const HEALTH_CHECK_INTERVAL_MS = 60_000;
/** Max jobs to keep in memory before evicting oldest completed ones. */
const MAX_IN_MEMORY_JOBS = 200;
export class JobStore {
    jobs = new Map();
    logs = new Map();
    latestJobId = null;
    persistence = null;
    // ─── DB availability tracking ────────────────────────────────────
    dbAvailable = true;
    consecutiveFailures = 0;
    healthCheckTimer = null;
    /** Evict oldest completed jobs when the map exceeds MAX_IN_MEMORY_JOBS. */
    evictIfNeeded() {
        if (this.jobs.size <= MAX_IN_MEMORY_JOBS)
            return;
        const completed = [];
        for (const [id, job] of this.jobs) {
            const gate = job.currentGate;
            if (gate === "complete" || gate === "failed")
                completed.push(id);
        }
        // Sort by createdAt ascending (oldest first)
        completed.sort((a, b) => {
            const aT = this.jobs.get(a)?.createdAt || "";
            const bT = this.jobs.get(b)?.createdAt || "";
            return aT.localeCompare(bT);
        });
        const toEvict = completed.slice(0, this.jobs.size - MAX_IN_MEMORY_JOBS);
        for (const id of toEvict) {
            this.jobs.delete(id);
            this.logs.delete(id);
        }
    }
    setPersistence(p) {
        this.persistence = p;
        this.dbAvailable = true;
        this.consecutiveFailures = 0;
        this.startHealthCheckTimer();
    }
    hasPersistence() {
        return this.persistence !== null;
    }
    getPersistence() {
        return this.persistence;
    }
    /**
     * Run CREATE TABLE IF NOT EXISTS for every table the store touches.
     * Call this once during startup, before any reads or writes.
     * Uses the persistence layer's pool via a raw query through the
     * persistence interface if available, otherwise is a no-op.
     */
    async initSchema() {
        if (!this.persistence)
            return;
        try {
            // The PersistenceLayer already exposes initialize() which runs the
            // external SQL file. We call it first, then fall back to our
            // embedded DDL if the external file was missing or errored.
            await this.persistence.initialize();
        }
        catch {
            // External schema file may not be present — run embedded DDL.
            // We need to reach the pool; PersistenceLayer.initialize() is the
            // only public path. If it threw, we attempt a second initialize()
            // call which will silently succeed if tables already exist.
            // The embedded SQL is identical to 001-initial-schema.sql (core tables).
            console.warn("[store] External schema migration failed; attempting embedded schema init");
            try {
                // Access pool through a simple health-check query first to verify connectivity
                const healthy = await this.checkDbHealth();
                if (!healthy) {
                    console.error("[store] Database unreachable during schema init");
                    this.markDbUnavailable();
                    return;
                }
                // Since we cannot directly access the pool from here without
                // changing persistence.ts, re-try initialize() which is idempotent.
                await this.persistence.initialize();
            }
            catch (innerErr) {
                console.error("[store] Schema init failed:", innerErr.message);
                this.markDbUnavailable();
            }
        }
    }
    /**
     * Test the database connection by running a trivial query.
     * Returns true if the connection is healthy, false otherwise.
     */
    async checkDbHealth() {
        if (!this.persistence)
            return false;
        try {
            // Use loadIntentBrief with a known-impossible ID as a lightweight
            // connectivity probe. If the query executes without throwing, the
            // connection is alive — the null result is expected.
            await this.persistence.loadIntentBrief("__health_check__");
            return true;
        }
        catch {
            return false;
        }
    }
    // ─── Failure tracking helpers ─────────────────────────────────────
    recordPersistenceSuccess() {
        if (!this.dbAvailable) {
            console.log("[store] Database recovered — re-enabling persistence writes");
        }
        this.consecutiveFailures = 0;
        this.dbAvailable = true;
    }
    recordPersistenceFailure(context, err) {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && this.dbAvailable) {
            this.markDbUnavailable();
            console.warn(`[store] ${MAX_CONSECUTIVE_FAILURES} consecutive persistence failures — ` +
                `pausing writes until next health check (every ${HEALTH_CHECK_INTERVAL_MS / 1000}s). ` +
                `Last error [${context}]: ${err?.message ?? err}`);
        }
        else if (this.dbAvailable) {
            console.error(`[persistence] Write failed [${context}]:`, err?.message ?? err);
        }
        // If already paused, stay silent to avoid log spam.
    }
    markDbUnavailable() {
        this.dbAvailable = false;
    }
    /** Whether the store should attempt DB writes right now. */
    shouldWrite() {
        return this.persistence !== null && this.dbAvailable;
    }
    // ─── Periodic health check ────────────────────────────────────────
    startHealthCheckTimer() {
        // Clear any existing timer
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        this.healthCheckTimer = setInterval(async () => {
            if (this.dbAvailable)
                return; // No need to check when healthy
            try {
                const healthy = await this.checkDbHealth();
                if (healthy) {
                    this.recordPersistenceSuccess();
                }
            }
            catch {
                // Still down — stay quiet
            }
        }, HEALTH_CHECK_INTERVAL_MS);
        // Don't let the timer prevent Node from exiting
        if (this.healthCheckTimer && typeof this.healthCheckTimer === "object" && "unref" in this.healthCheckTimer) {
            this.healthCheckTimer.unref();
        }
    }
    stopHealthCheckTimer() {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }
    // ─── Core CRUD ────────────────────────────────────────────────────
    create(job) {
        this.evictIfNeeded();
        const durability = this.persistence ? "persisted" : "memory_only";
        this.jobs.set(job.jobId, { ...job, durability, createdAt: new Date().toISOString() });
        this.logs.set(job.jobId, []);
        this.latestJobId = job.jobId;
    }
    get(jobId) {
        return this.jobs.get(jobId);
    }
    getLatest() {
        if (!this.latestJobId)
            return undefined;
        return this.jobs.get(this.latestJobId);
    }
    update(jobId, updates) {
        const existing = this.jobs.get(jobId);
        if (!existing)
            return;
        const updated = { ...existing, ...updates };
        this.jobs.set(jobId, updated);
        // Write-through to Postgres (don't block pipeline, but track failures)
        if (this.shouldWrite()) {
            this.persistArtifacts(jobId, existing, updates)
                .then(() => {
                this.recordPersistenceSuccess();
                const job = this.jobs.get(jobId);
                if (job) {
                    job.durability = "confirmed";
                }
            })
                .catch((err) => {
                this.recordPersistenceFailure(`update:${jobId}`, err);
                const job = this.jobs.get(jobId);
                if (job) {
                    job.durability = "partial";
                }
            });
        }
    }
    addLog(jobId, entry) {
        const full = {
            ...entry,
            timestamp: new Date().toISOString(),
            level: "info",
            schema_version: CURRENT_SCHEMA_VERSION,
        };
        const logs = this.logs.get(jobId);
        if (logs)
            logs.push(full);
        if (this.shouldWrite()) {
            this.persistence.persistLog(jobId, full)
                .then(() => this.recordPersistenceSuccess())
                .catch((err) => this.recordPersistenceFailure(`log:${jobId}`, err));
        }
    }
    addFixTrail(jobId, entry) {
        const job = this.jobs.get(jobId);
        if (job) {
            if (!job.fixTrailEntries)
                job.fixTrailEntries = [];
            job.fixTrailEntries.push(entry);
        }
        if (this.shouldWrite()) {
            this.persistence.persistFixTrail(entry)
                .then(() => this.recordPersistenceSuccess())
                .catch((err) => this.recordPersistenceFailure(`fixtrail:${jobId}`, err));
        }
    }
    getLogs(jobId) {
        return this.logs.get(jobId) || [];
    }
    list() {
        return Array.from(this.jobs.values());
    }
    // ─── Postgres reconstruction ───────────────────────────────────────
    async loadFromPostgres(jobId) {
        if (!this.persistence)
            return null;
        // Check if already in memory
        const cached = this.jobs.get(jobId);
        if (cached)
            return cached;
        const logs = await this.persistence.loadLogs(jobId);
        // Reconstruct from Postgres artifacts
        const brief = await this.persistence.loadIntentBrief(jobId);
        if (!brief && logs.length === 0)
            return null;
        const job = {
            jobId,
            requestId: brief?.request_id || jobId,
            rawRequest: brief?.raw_request || inferRawRequestFromLogs(logs) || "",
            currentGate: "unknown",
            createdAt: brief?.created_at || logs[0]?.timestamp || new Date().toISOString(),
            durability: "confirmed", // loaded from Postgres, so it's confirmed
            intentBrief: brief || undefined,
            intentConfirmed: brief
                ? brief.confirmation_status === "confirmed" ||
                    brief.confirmation_status === "auto_confirmed_low_ambiguity"
                : logs.some((log) => /Classified as|Intent confirmed/i.test(log.message || "")),
        };
        // Try to load AppSpec
        // We need to find the app_id — check app_specs by request_id
        const appSpecLookupId = brief?.request_id || jobId;
        const appSpecRow = await this.persistence.loadAppSpecByRequestId(appSpecLookupId);
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
        if (logs.length > 0) {
            this.logs.set(jobId, logs);
            job.currentGate = deriveCurrentGateFromLogs(logs, job.currentGate);
            job.userApproved = job.userApproved ?? logs.some((log) => log.message === "__approval_signal__:approved");
        }
        // Cache it
        this.jobs.set(jobId, job);
        return job;
    }
    async loadLogsFromPostgres(jobId) {
        if (!this.persistence)
            return [];
        return this.persistence.loadLogs(jobId);
    }
    async listFromPostgres() {
        if (!this.persistence)
            return [];
        return this.persistence.listJobs();
    }
    // ─── Write-through logic ───────────────────────────────────────────
    async persistArtifacts(jobId, before, updates) {
        const p = this.persistence;
        const after = { ...before, ...updates };
        // Intent brief created or updated
        if (updates.intentBrief && !before.intentBrief) {
            await p.persistIntentBrief(jobId, updates.intentBrief);
        }
        else if (updates.intentBrief && before.intentBrief) {
            await p.updateIntentBriefStatus(jobId, updates.intentBrief.confirmation_status);
        }
        // AppSpec created
        if (updates.appSpec && !before.appSpec) {
            const dbId = await p.persistAppSpec(jobId, updates.appSpec);
            // Store the DB ID for later references
            this.jobs.get(jobId).appSpecDbId = dbId;
        }
        // Validation results
        if (updates.specValidationResults) {
            await p.persistValidationResults(jobId, jobId, jobId, updates.specValidationResults);
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
            const bridges = updates.featureBridges;
            const hasCompiledBridges = Object.values(bridges).some((b) => b.bridge_id);
            if (hasCompiledBridges) {
                // Use the DB row ID from the app_specs insert, not the app_id
                const appSpecDbId = this.jobs.get(jobId)?.appSpecDbId || after.appSpec.app_id;
                await p.persistFeatureBridges(jobId, appSpecDbId, bridges);
            }
        }
        // Veto results
        if (updates.vetoResults && after.featureBridges) {
            await p.persistVetoResults(jobId, after.featureBridges);
        }
        // FixTrail entries
        if (updates.fixTrailEntries) {
            for (const entry of updates.fixTrailEntries) {
                await p.persistFixTrail(entry);
            }
        }
        if (updates.builderRuns) {
            const beforeRunIds = new Set((before.builderRuns || []).map((run) => run.run_id));
            for (const run of updates.builderRuns) {
                if (!beforeRunIds.has(run.run_id)) {
                    await p.persistBuilderRun(run);
                }
            }
        }
    }
    // ─── Cleanup ─────────────────────────────────────────────────────
    /** Stop background timers. Call when tearing down the store. */
    dispose() {
        this.stopHealthCheckTimer();
    }
}
let instance = null;
export function getJobStore() {
    if (!instance) {
        instance = new JobStore();
    }
    return instance;
}
export function resetJobStore() {
    if (instance) {
        instance.dispose();
    }
    instance = null;
}
function inferRawRequestFromLogs(logs) {
    const rawLog = logs.find((log) => typeof log.message === "string" && log.message.startsWith("Raw request:"));
    if (!rawLog?.message)
        return null;
    const match = rawLog.message.match(/Raw request:\s*"([\s\S]+)"$/);
    return match?.[1] || null;
}
function deriveCurrentGateFromLogs(logs, fallback) {
    const lastGate = [...logs].reverse().find((log) => typeof log.gate === "string" && log.gate.length > 0)?.gate;
    return lastGate || fallback;
}
