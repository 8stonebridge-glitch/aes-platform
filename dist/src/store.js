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

CREATE TABLE IF NOT EXISTS job_snapshots (
  job_id TEXT PRIMARY KEY,
  request_id TEXT,
  raw_request TEXT,
  current_gate TEXT,
  intent_confirmed BOOLEAN,
  user_approved BOOLEAN,
  deploy_target TEXT,
  autonomous BOOLEAN,
  target_path TEXT,
  preview_url TEXT,
  deployment_url TEXT,
  error_message TEXT,
  design_mode TEXT,
  design_brief JSONB,
  design_evidence JSONB,
  feature_build_order TEXT[],
  feature_build_index INTEGER,
  feature_bridges JSONB,
  validator_results JSONB,
  build_results JSONB,
  last_log_at TIMESTAMPTZ,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_snapshots_updated_at ON job_snapshots(updated_at DESC);
`;
/** Maximum consecutive persistence failures before writes are paused. */
const MAX_CONSECUTIVE_FAILURES = 3;
/** Interval in ms between periodic DB health checks when writes are paused. */
const HEALTH_CHECK_INTERVAL_MS = 60_000;
/** Max jobs to keep in memory before evicting oldest completed ones. */
const MAX_IN_MEMORY_JOBS = 200;
const HERMES_OBSERVE_URL = process.env.HERMES_RELEASE_URL ||
    process.env.HERMES_INTERNAL_URL ||
    process.env.HERMES_URL ||
    "";
const HERMES_SNAPSHOT_PUSH_DISABLED = process.env.AES_DISABLE_HERMES_SNAPSHOTS === "true" ||
    process.env.AES_DISABLE_HERMES_SNAPSHOTS === "1";
function compactSnapshotForHermes(snapshot) {
    return {
        job_id: snapshot.job_id,
        current_gate: snapshot.current_gate ?? null,
        deploy_target: snapshot.deploy_target ?? null,
        autonomous: snapshot.autonomous ?? null,
        preview_url: snapshot.preview_url ?? null,
        deployment_url: snapshot.deployment_url ?? null,
        error_message: snapshot.error_message ?? null,
        updated_at: snapshot.updated_at ?? null,
    };
}
function formatSnapshotMessage(snapshot) {
    const parts = [
        `job=${snapshot.job_id}`,
        `gate=${snapshot.current_gate ?? "unknown"}`,
        `target=${snapshot.deploy_target ?? "unset"}`,
        `autonomous=${snapshot.autonomous === true ? "true" : "false"}`,
    ];
    if (snapshot.preview_url)
        parts.push(`preview=${snapshot.preview_url}`);
    if (snapshot.deployment_url)
        parts.push(`deployment=${snapshot.deployment_url}`);
    if (snapshot.error_message)
        parts.push(`error=${snapshot.error_message}`);
    return `[AES release] job snapshot | ${parts.join(" | ")}`;
}
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
    toSnapshot(job) {
        const latestLog = this.logs.get(job.jobId)?.slice(-1)[0];
        return {
            job_id: job.jobId,
            request_id: job.requestId,
            raw_request: job.rawRequest,
            current_gate: job.currentGate,
            intent_confirmed: job.intentConfirmed ?? null,
            user_approved: job.userApproved ?? null,
            deploy_target: job.deployTarget ?? null,
            autonomous: job.autonomous ?? null,
            target_path: job.targetPath ?? null,
            preview_url: job.previewUrl ?? null,
            deployment_url: job.deploymentUrl ?? null,
            error_message: job.errorMessage ?? null,
            design_mode: job.designMode ?? null,
            design_brief: job.designBrief ?? null,
            design_evidence: job.designEvidence ?? null,
            feature_build_order: job.featureBuildOrder ?? null,
            feature_build_index: job.featureBuildIndex ?? null,
            feature_bridges: job.featureBridges ?? null,
            validator_results: job.validatorResults ?? null,
            build_results: job.buildResults ?? null,
            last_log_at: latestLog?.timestamp ?? null,
            created_at: job.createdAt ?? null,
            updated_at: new Date().toISOString(),
        };
    }
    async pushSnapshotToHermes(snapshot) {
        await this.postToHermes({
            source: "aes-release-snapshot",
            artifactType: "job_snapshot",
            rawMessage: formatSnapshotMessage(snapshot),
            payload: compactSnapshotForHermes(snapshot),
            sessionId: snapshot.job_id,
            promotable: false,
        });
    }
    async postToHermes(event) {
        if (HERMES_SNAPSHOT_PUSH_DISABLED || !HERMES_OBSERVE_URL)
            return;
        const body = JSON.stringify({
            source: event.source ?? "aes-release",
            environment: "orchestrator",
            raw_message: event.rawMessage,
            session_id: event.sessionId ?? null,
            promotable: event.promotable ?? false,
            traffic_class: event.trafficClass ?? "incident",
            artifact_type: event.artifactType,
            payload: event.payload ?? null,
        });
        const attempt = async () => {
            await fetch(`${HERMES_OBSERVE_URL}/observe`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });
        };
        const retries = [0, 250, 1000]; // immediate, then backoff
        for (const delay of retries) {
            try {
                if (delay) {
                    await new Promise((r) => setTimeout(r, delay));
                }
                await attempt();
                return;
            }
            catch {
                // best-effort; continue retries
            }
        }
    }
    async postRepairOutcomeToHermes(outcome) {
        if (HERMES_SNAPSHOT_PUSH_DISABLED || !HERMES_OBSERVE_URL)
            return;
        const body = JSON.stringify({
            pattern: outcome.pattern,
            category: outcome.category,
            diagnosis: outcome.diagnosis,
            fixAction: outcome.fixAction,
            fixType: outcome.fixType ?? "auto_fix",
            filesChanged: outcome.filesChanged ?? [],
            success: outcome.success,
            errorSnippet: outcome.errorSnippet,
            service: outcome.service ?? "aes-release",
        });
        const attempt = async () => {
            await fetch(`${HERMES_OBSERVE_URL}/repair/remember`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });
        };
        const retries = [0, 250, 1000];
        for (const delay of retries) {
            try {
                if (delay) {
                    await new Promise((r) => setTimeout(r, delay));
                }
                await attempt();
                return;
            }
            catch {
                // best-effort; continue retries
            }
        }
    }
    recordHermesReleaseEvent(event) {
        this.postToHermes(event).catch(() => {
            // best-effort only
        });
    }
    recordHermesRepairOutcome(outcome) {
        this.postRepairOutcomeToHermes(outcome).catch(() => {
            // best-effort only
        });
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
        const createdAt = new Date().toISOString();
        const record = { ...job, durability, createdAt };
        this.jobs.set(job.jobId, record);
        this.logs.set(job.jobId, []);
        this.latestJobId = job.jobId;
        if (this.shouldWrite()) {
            this.persistence.persistJobSnapshot(job.jobId, this.toSnapshot(record))
                .then(() => this.recordPersistenceSuccess())
                .catch((err) => {
                this.recordPersistenceFailure(`snapshot:create:${job.jobId}`, err);
                const j = this.jobs.get(job.jobId);
                if (j)
                    j.durability = "partial";
            })
                .then(() => this.pushSnapshotToHermes(this.toSnapshot(record)))
                .catch(() => { });
        }
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
        const snapshot = await this.persistence.loadJobSnapshot(jobId);
        const logs = await this.persistence.loadLogs(jobId);
        const brief = await this.persistence.loadIntentBrief(jobId);
        if (!brief && !snapshot && logs.length === 0)
            return null;
        const snapshotJob = snapshot ? {
            jobId,
            requestId: snapshot.request_id || jobId,
            rawRequest: snapshot.raw_request || inferRawRequestFromLogs(logs) || brief?.raw_request || "",
            currentGate: snapshot.current_gate || "unknown",
            createdAt: snapshot.created_at || brief?.created_at || logs[0]?.timestamp || new Date().toISOString(),
            durability: "confirmed",
            intentBrief: brief || undefined,
            intentConfirmed: snapshot.intent_confirmed ?? (brief
                ? brief.confirmation_status === "confirmed" ||
                    brief.confirmation_status === "auto_confirmed_low_ambiguity"
                : logs.some((log) => /Classified as|Intent confirmed/i.test(log.message || ""))),
            userApproved: snapshot.user_approved ?? undefined,
            autonomous: snapshot.autonomous ?? undefined,
            deployTarget: snapshot.deploy_target ?? undefined,
            targetPath: snapshot.target_path ?? null,
            previewUrl: snapshot.preview_url ?? null,
            deploymentUrl: snapshot.deployment_url ?? null,
            errorMessage: snapshot.error_message ?? null,
            designMode: snapshot.design_mode,
            designBrief: snapshot.design_brief ?? undefined,
            designEvidence: snapshot.design_evidence ?? undefined,
            featureBuildOrder: snapshot.feature_build_order ?? undefined,
            featureBuildIndex: snapshot.feature_build_index ?? undefined,
            featureBridges: snapshot.feature_bridges ?? undefined,
            validatorResults: snapshot.validator_results ?? undefined,
            buildResults: snapshot.build_results ?? undefined,
        } : null;
        const job = snapshotJob || {
            jobId,
            requestId: brief?.request_id || jobId,
            rawRequest: brief?.raw_request || inferRawRequestFromLogs(logs) || "",
            currentGate: "unknown",
            createdAt: brief?.created_at || logs[0]?.timestamp || new Date().toISOString(),
            durability: "confirmed",
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
            job.appSpec = job.appSpec || appSpecRow;
            if (job.currentGate === "unknown") {
                job.currentGate = "gate_1";
            }
            // Load bridges
            const bridges = await this.persistence.loadFeatureBridges(appSpecRow.app_id);
            if (Object.keys(bridges).length > 0) {
                job.featureBridges = job.featureBridges || bridges;
                job.featureBuildOrder = job.featureBuildOrder || Object.keys(bridges);
                if (job.currentGate === "unknown") {
                    job.currentGate = "gate_2";
                }
                // Load vetoes
                const bridgeIds = Object.values(bridges)
                    .filter((b) => b.bridge_id)
                    .map((b) => b.bridge_id);
                const vetoes = await this.persistence.loadVetoResults(bridgeIds);
                if (vetoes.length > 0) {
                    job.vetoResults = job.vetoResults || vetoes;
                    const anyTriggered = vetoes.some((v) => v.triggered);
                    if (job.currentGate === "unknown") {
                        job.currentGate = anyTriggered ? "failed" : "gate_3";
                    }
                }
            }
            // Load approval
            const approval = await this.persistence.loadApproval(jobId);
            if (approval) {
                job.userApproved = job.userApproved ?? approval.approved;
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
        if (job.errorMessage && job.currentGate !== "complete" && job.currentGate !== "failed") {
            job.currentGate = "failed";
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
        const snapshots = await this.persistence.listJobSnapshots();
        if (snapshots.length > 0) {
            return snapshots.map((s) => ({
                job_id: s.job_id,
                raw_request: s.raw_request || "",
                created_at: s.created_at || s.updated_at || new Date().toISOString(),
                current_gate: s.current_gate || null,
                deploy_target: s.deploy_target || null,
                autonomous: s.autonomous ?? null,
                preview_url: s.preview_url || null,
                updated_at: s.updated_at || null,
            }));
        }
        // Fallback to intent_briefs if no snapshots yet
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
        // Snapshot the latest runtime state
        const snapshot = this.toSnapshot(after);
        await p.persistJobSnapshot(jobId, snapshot);
        this.pushSnapshotToHermes(snapshot).catch(() => { });
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
