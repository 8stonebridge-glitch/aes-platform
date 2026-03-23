/**
 * Postgres persistence layer for AES v12.
 * Writes artifacts to the aes-artifacts schema tables.
 * Reads back for replay and reconstruction.
 */

import pg from "pg";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Fixed namespace UUID (DNS namespace) for deterministic UUID v5 generation.
const AES_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Generate a deterministic UUID v5 from an input string.
 * Same input always produces the same UUID, even across process restarts.
 */
function deterministicUUID(input: string): string {
  const hash = createHash("sha1")
    .update(Buffer.from(AES_NAMESPACE.replace(/-/g, ""), "hex"))
    .update(input)
    .digest("hex");

  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    "5" + hash.substring(13, 16), // version 5
    ((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16) + hash.substring(17, 20), // variant
    hash.substring(20, 32),
  ].join("-");
}

// Ensure IDs are valid UUIDs for Postgres.
// Deterministic: same input always produces the same UUID across restarts.
export function ensureUUID(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  return deterministicUUID(id);
}
import type {
  IntentBrief,
  AppSpec,
  FeatureBridge,
  ValidationResult,
  VetoResult,
  ApprovalRecord,
  LogEntry,
  FixTrailEntry,
  BuilderRunRecord,
} from "./types/artifacts.js";
import { CURRENT_SCHEMA_VERSION } from "./types/artifacts.js";

export class PersistenceLayer {
  private pool: pg.Pool;

  constructor(connectionString: string) {
    // Parse connection string for host/port to avoid IPv6 issues
    const url = new URL(connectionString);
    this.pool = new pg.Pool({
      host: url.hostname,
      port: parseInt(url.port || "5432"),
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    });
  }

  async initialize(): Promise<void> {
    // Run full schema migration (all tables, idempotent with IF NOT EXISTS)
    try {
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const sql = readFileSync(join(__dirname, "schema", "001-initial-schema.sql"), "utf-8");
      await this.pool.query(sql);
    } catch {
      // Schema might already exist — that's fine
    }
  }

  // ─── Gate 0: Intent Brief ──────────────────────────────────────────

  private intentBriefDbIds = new Map<string, string>();

  async persistIntentBrief(jobId: string, brief: IntentBrief): Promise<void> {
    const requestId = ensureUUID(brief.request_id);
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO intent_briefs (
        request_id, raw_request, inferred_app_class, inferred_primary_users,
        inferred_core_outcome, inferred_platforms, inferred_risk_class,
        inferred_integrations, explicit_inclusions, explicit_exclusions,
        ambiguity_flags, assumptions, confirmation_statement, confirmation_status,
        schema_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT DO NOTHING
      RETURNING id`,
      [
        requestId, brief.raw_request, brief.inferred_app_class,
        brief.inferred_primary_users, brief.inferred_core_outcome,
        brief.inferred_platforms, brief.inferred_risk_class,
        brief.inferred_integrations, brief.explicit_inclusions,
        brief.explicit_exclusions, brief.ambiguity_flags, brief.assumptions,
        brief.confirmation_statement, brief.confirmation_status,
        brief.schema_version ?? CURRENT_SCHEMA_VERSION,
      ]
    );
    if (result.rows[0]?.id) {
      this.intentBriefDbIds.set(brief.request_id, result.rows[0].id);
    }
  }

  async updateIntentBriefStatus(requestId: string, status: string): Promise<void> {
    await this.pool.query(
      `UPDATE intent_briefs SET confirmation_status = $1, updated_at = now() WHERE request_id = $2`,
      [status, requestId]
    );
  }

  // ─── Gate 1: AppSpec ───────────────────────────────────────────────

  async persistAppSpec(jobId: string, spec: AppSpec): Promise<string> {
    const appId = ensureUUID(spec.app_id);
    const requestId = ensureUUID(spec.request_id);
    // Use the actual DB ID from the intent_briefs insert, not a generated UUID
    const intentBriefId = this.intentBriefDbIds.get(spec.intent_brief_id)
      || this.intentBriefDbIds.get(spec.request_id)
      || ensureUUID(spec.intent_brief_id);
    const rows = await this.pool.query<{ id: string }>(
      `INSERT INTO app_specs (
        app_id, request_id, intent_brief_id, title, summary,
        app_class, risk_class, spec_data, confidence_overall, version,
        schema_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id`,
      [
        appId, requestId, intentBriefId,
        spec.title, spec.summary, spec.app_class, spec.risk_class,
        JSON.stringify(spec), spec.confidence.overall, 1,
        spec.schema_version ?? CURRENT_SCHEMA_VERSION,
      ]
    );
    return rows.rows[0].id;
  }

  // ─── Gate 1: Validation Results ────────────────────────────────────

  async persistValidationResults(
    jobId: string,
    bridgeId: string,
    buildRunId: string,
    results: ValidationResult[]
  ): Promise<void> {
    // Gate 1 validation results don't have a bridge yet (bridges are Gate 2).
    // Store them as build_logs with structured error codes instead of in validator_results
    // which has an FK to feature_bridges.
    for (const r of results) {
      await this.pool.query(
        `INSERT INTO build_logs (job_id, gate, message, level, error_code, schema_version)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          jobId,
          "gate_1",
          r.passed ? `${r.code}: PASS` : `${r.code}: FAIL — ${r.reason || ""}`,
          r.passed ? "info" : "error",
          r.passed ? null : r.code,
          CURRENT_SCHEMA_VERSION,
        ]
      );
    }
  }

  // ─── Gate 2: Feature Bridges ───────────────────────────────────────

  private bridgeDbIds = new Map<string, string>();

  async persistFeatureBridges(
    jobId: string,
    appSpecId: string,
    bridges: Record<string, FeatureBridge>
  ): Promise<void> {
    for (const [featureId, bridge] of Object.entries(bridges)) {
      if (!bridge.bridge_id) continue;
      const result = await this.pool.query<{ id: string }>(
        `INSERT INTO feature_bridges (
          bridge_id, app_id, app_spec_id, feature_id, feature_name,
          status, bridge_data, confidence_overall, version, schema_version
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
        RETURNING id`,
        [
          ensureUUID(bridge.bridge_id), ensureUUID(bridge.app_id), appSpecId, bridge.feature_id,
          bridge.feature_name, bridge.status, JSON.stringify(bridge),
          bridge.confidence?.overall || 0, 1,
          bridge.schema_version ?? CURRENT_SCHEMA_VERSION,
        ]
      );
      if (result.rows[0]?.id) {
        this.bridgeDbIds.set(bridge.bridge_id, result.rows[0].id);
      }
    }
  }

  // ─── Gate 3: Veto Results ──────────────────────────────────────────

  async persistVetoResults(
    jobId: string,
    bridges: Record<string, FeatureBridge>
  ): Promise<void> {
    for (const [featureId, bridge] of Object.entries(bridges)) {
      if (!bridge.bridge_id || !bridge.hard_vetoes) continue;
      const triggered = bridge.hard_vetoes.filter((v: VetoResult) => v.triggered);
      // Use the DB row ID, not the bridge_id field
      const dbId = this.bridgeDbIds.get(bridge.bridge_id);
      if (!dbId) continue; // Can't persist without a valid FK
      await this.pool.query(
        `INSERT INTO veto_results (
          bridge_id, any_triggered, triggered_codes, result_data, schema_version
        ) VALUES ($1,$2,$3,$4,$5)`,
        [
          dbId,
          triggered.length > 0,
          triggered.map((v: VetoResult) => v.code),
          JSON.stringify(bridge.hard_vetoes),
          CURRENT_SCHEMA_VERSION,
        ]
      );
    }
  }

  // ─── Approval ──────────────────────────────────────────────────────

  async persistApproval(approval: ApprovalRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_approvals (
        app_id, app_spec_id, approval_type, approved, user_comment, presented_data, schema_version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        ensureUUID(approval.job_id),
        approval.app_spec_id,  // Already a DB UUID from persistAppSpec
        approval.approval_type,
        approval.approved,
        approval.user_comment || null,
        JSON.stringify({ approval_type: approval.approval_type }),
        approval.schema_version ?? CURRENT_SCHEMA_VERSION,
      ]
    );
  }

  // ─── Logs ──────────────────────────────────────────────────────────

  async persistLog(jobId: string, entry: LogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO build_logs (job_id, gate, feature_id, message, level, error_code, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        jobId, entry.gate || null, entry.feature_id || null,
        entry.message, entry.level || "info", entry.error_code || null,
        entry.schema_version ?? CURRENT_SCHEMA_VERSION,
      ]
    );
  }

  // ─── FixTrail ─────────────────────────────────────────────────────

  async persistFixTrail(entry: FixTrailEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO fix_trails (fix_id, job_id, gate, error_code, issue_summary,
       root_cause, repair_action, status, related_artifact_ids, schema_version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [entry.fix_id, entry.job_id, entry.gate, entry.error_code,
       entry.issue_summary, entry.root_cause, entry.repair_action,
       entry.status, entry.related_artifact_ids, entry.schema_version]
    );
  }

  async loadFixTrails(jobId: string): Promise<FixTrailEntry[]> {
    const res = await this.pool.query(
      `SELECT * FROM fix_trails WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );
    return res.rows.map(r => ({
      fix_id: r.fix_id,
      job_id: r.job_id,
      gate: r.gate,
      error_code: r.error_code,
      issue_summary: r.issue_summary,
      root_cause: r.root_cause,
      repair_action: r.repair_action,
      status: r.status,
      related_artifact_ids: r.related_artifact_ids || [],
      schema_version: r.schema_version,
      created_at: r.created_at?.toISOString(),
      resolved_at: r.resolved_at?.toISOString() || null,
    }));
  }

  // ─── Load / Reconstruct ────────────────────────────────────────────

  async loadIntentBrief(requestId: string): Promise<IntentBrief | null> {
    const res = await this.pool.query(
      `SELECT * FROM intent_briefs WHERE request_id = $1 LIMIT 1`,
      [requestId]
    );
    return res.rows[0] || null;
  }

  async loadAppSpecByRequestId(requestId: string): Promise<AppSpec | null> {
    const res = await this.pool.query(
      `SELECT spec_data FROM app_specs WHERE request_id = $1 ORDER BY version DESC LIMIT 1`,
      [requestId]
    );
    if (!res.rows[0]) return null;
    return typeof res.rows[0].spec_data === "string"
      ? JSON.parse(res.rows[0].spec_data)
      : res.rows[0].spec_data;
  }

  async loadAppSpec(appId: string): Promise<AppSpec | null> {
    const res = await this.pool.query(
      `SELECT spec_data FROM app_specs WHERE app_id = $1 ORDER BY version DESC LIMIT 1`,
      [appId]
    );
    if (!res.rows[0]) return null;
    return typeof res.rows[0].spec_data === "string"
      ? JSON.parse(res.rows[0].spec_data)
      : res.rows[0].spec_data;
  }

  async loadFeatureBridges(appId: string): Promise<Record<string, FeatureBridge>> {
    const res = await this.pool.query(
      `SELECT feature_id, bridge_data FROM feature_bridges WHERE app_id = $1`,
      [appId]
    );
    const bridges: Record<string, FeatureBridge> = {};
    for (const row of res.rows) {
      const data = typeof row.bridge_data === "string"
        ? JSON.parse(row.bridge_data)
        : row.bridge_data;
      bridges[row.feature_id] = data;
    }
    return bridges;
  }

  async loadVetoResults(bridgeIds: string[]): Promise<VetoResult[]> {
    if (bridgeIds.length === 0) return [];
    const res = await this.pool.query(
      `SELECT result_data FROM veto_results WHERE bridge_id = ANY($1)`,
      [bridgeIds]
    );
    return res.rows.flatMap((r) => {
      const data = typeof r.result_data === "string"
        ? JSON.parse(r.result_data)
        : r.result_data;
      return Array.isArray(data) ? data : [data];
    });
  }

  async loadValidationResults(jobId: string): Promise<ValidationResult[]> {
    // Read from build_logs (same table persistValidationResults writes to).
    // Gate 1 validation results are stored as build_logs with gate='gate_1'.
    // Failures have error_code set; passes have message matching "CODE: PASS".
    const res = await this.pool.query(
      `SELECT message, error_code FROM build_logs
       WHERE job_id = $1 AND gate = 'gate_1'
       AND (error_code IS NOT NULL OR message LIKE '%: PASS')
       ORDER BY created_at ASC`,
      [jobId]
    );
    return res.rows.map((r) => {
      if (r.error_code) {
        // Failure entry: message is "CODE: FAIL — reason"
        const reason = r.message?.replace(/^[^:]+:\s*FAIL\s*—?\s*/, "") || undefined;
        return { code: r.error_code, passed: false, reason };
      }
      // Pass entry: message is "CODE: PASS"
      const code = r.message?.replace(/:\s*PASS$/, "").trim() || "UNKNOWN";
      return { code, passed: true };
    });
  }

  async loadApproval(jobId: string): Promise<ApprovalRecord | null> {
    const res = await this.pool.query(
      `SELECT * FROM user_approvals WHERE app_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [jobId]
    );
    if (!res.rows[0]) return null;
    const row = res.rows[0];
    return {
      job_id: row.app_id,
      app_spec_id: row.app_spec_id,
      approval_type: row.approval_type,
      approved: row.approved,
      user_comment: row.user_comment,
      schema_version: row.schema_version ?? CURRENT_SCHEMA_VERSION,
      created_at: row.created_at?.toISOString(),
    };
  }

  async loadLogs(jobId: string): Promise<LogEntry[]> {
    const res = await this.pool.query(
      `SELECT * FROM build_logs WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );
    return res.rows.map((r) => ({
      timestamp: r.created_at?.toISOString(),
      gate: r.gate,
      feature_id: r.feature_id,
      message: r.message,
      level: r.level,
      error_code: r.error_code,
      schema_version: r.schema_version ?? CURRENT_SCHEMA_VERSION,
    }));
  }

  async listJobs(): Promise<{ job_id: string; raw_request: string; created_at: string }[]> {
    const res = await this.pool.query(
      `SELECT request_id as job_id, raw_request, created_at
       FROM intent_briefs ORDER BY created_at DESC LIMIT 50`
    );
    return res.rows.map((r) => ({
      job_id: r.job_id,
      raw_request: r.raw_request,
      created_at: r.created_at?.toISOString(),
    }));
  }

  // ─── Builder Runs ────────────────────────────────────────────────

  async persistBuilderRun(run: BuilderRunRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO builder_runs (
        run_id, job_id, bridge_id, feature_id, feature_name, status,
        input_package_hash, builder_package, files_created, files_modified,
        files_deleted, test_results, acceptance_coverage, scope_violations,
        constraint_violations, verification_passed, failure_reason,
        builder_model, duration_ms, schema_version,
        workspace_id, branch, base_commit, final_commit, diff_summary, pr_summary
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        run.run_id, run.job_id, run.bridge_id, run.feature_id, run.feature_name,
        run.status, run.input_package_hash, JSON.stringify(run.builder_package),
        run.files_created, run.files_modified, run.files_deleted,
        JSON.stringify(run.test_results), JSON.stringify(run.acceptance_coverage),
        run.scope_violations, run.constraint_violations, run.verification_passed,
        run.failure_reason, run.builder_model, run.duration_ms, run.schema_version,
        run.workspace_id || null, run.branch || null, run.base_commit || null,
        run.final_commit || null, run.diff_summary || null, run.pr_summary || null
      ]
    );
  }

  async updateBuilderRunStatus(runId: string, status: string, updates: Partial<BuilderRunRecord>): Promise<void> {
    const sets: string[] = [`status = $2`];
    const params: any[] = [runId, status];
    let idx = 3;

    if (updates.files_created) { sets.push(`files_created = $${idx}`); params.push(updates.files_created); idx++; }
    if (updates.files_modified) { sets.push(`files_modified = $${idx}`); params.push(updates.files_modified); idx++; }
    if (updates.files_deleted) { sets.push(`files_deleted = $${idx}`); params.push(updates.files_deleted); idx++; }
    if (updates.test_results) { sets.push(`test_results = $${idx}`); params.push(JSON.stringify(updates.test_results)); idx++; }
    if (updates.acceptance_coverage) { sets.push(`acceptance_coverage = $${idx}`); params.push(JSON.stringify(updates.acceptance_coverage)); idx++; }
    if (updates.scope_violations) { sets.push(`scope_violations = $${idx}`); params.push(updates.scope_violations); idx++; }
    if (updates.constraint_violations) { sets.push(`constraint_violations = $${idx}`); params.push(updates.constraint_violations); idx++; }
    if (updates.verification_passed !== undefined) { sets.push(`verification_passed = $${idx}`); params.push(updates.verification_passed); idx++; }
    if (updates.failure_reason) { sets.push(`failure_reason = $${idx}`); params.push(updates.failure_reason); idx++; }
    if (updates.duration_ms) { sets.push(`duration_ms = $${idx}`); params.push(updates.duration_ms); idx++; }
    if (updates.completed_at) { sets.push(`completed_at = $${idx}`); params.push(updates.completed_at); idx++; }
    if (updates.workspace_id) { sets.push(`workspace_id = $${idx}`); params.push(updates.workspace_id); idx++; }
    if (updates.branch) { sets.push(`branch = $${idx}`); params.push(updates.branch); idx++; }
    if (updates.base_commit) { sets.push(`base_commit = $${idx}`); params.push(updates.base_commit); idx++; }
    if (updates.final_commit) { sets.push(`final_commit = $${idx}`); params.push(updates.final_commit); idx++; }
    if (updates.diff_summary) { sets.push(`diff_summary = $${idx}`); params.push(updates.diff_summary); idx++; }
    if (updates.pr_summary) { sets.push(`pr_summary = $${idx}`); params.push(updates.pr_summary); idx++; }

    await this.pool.query(
      `UPDATE builder_runs SET ${sets.join(", ")} WHERE run_id = $1`,
      params
    );
  }

  async loadBuilderRuns(jobId: string): Promise<BuilderRunRecord[]> {
    const res = await this.pool.query(
      `SELECT * FROM builder_runs WHERE job_id = $1 ORDER BY created_at ASC`,
      [jobId]
    );
    return res.rows.map(r => ({
      run_id: r.run_id,
      job_id: r.job_id,
      bridge_id: r.bridge_id,
      feature_id: r.feature_id,
      feature_name: r.feature_name,
      status: r.status,
      input_package_hash: r.input_package_hash,
      builder_package: r.builder_package,
      files_created: r.files_created || [],
      files_modified: r.files_modified || [],
      files_deleted: r.files_deleted || [],
      test_results: r.test_results || [],
      acceptance_coverage: r.acceptance_coverage || {},
      scope_violations: r.scope_violations || [],
      constraint_violations: r.constraint_violations || [],
      verification_passed: r.verification_passed,
      failure_reason: r.failure_reason,
      builder_model: r.builder_model,
      duration_ms: r.duration_ms,
      schema_version: r.schema_version,
      created_at: r.created_at?.toISOString(),
      completed_at: r.completed_at?.toISOString() || null,
      workspace_id: r.workspace_id || null,
      branch: r.branch || null,
      base_commit: r.base_commit || null,
      final_commit: r.final_commit || null,
      diff_summary: r.diff_summary || null,
      pr_summary: r.pr_summary || null,
    }));
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
