import { PgClient } from "../services/pg-client.js";
import { BuildRunRecord } from "../schema/types.js";

export type CreateBuildRun = Omit<BuildRunRecord, "id" | "created_at" | "started_at" | "completed_at">;

export class BuildRunRepo {
  constructor(private db: PgClient) {}

  async create(run: CreateBuildRun): Promise<BuildRunRecord> {
    const rows = await this.db.query<BuildRunRecord>(
      `INSERT INTO build_runs (
        job_id, app_id, bridge_id, feature_id,
        status, pr_number, pr_url, branch, commit_sha,
        builder_model, builder_duration_ms,
        reuse_assets_used, files_created, files_modified
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        run.job_id, run.app_id, run.bridge_id, run.feature_id,
        run.status, run.pr_number, run.pr_url, run.branch, run.commit_sha,
        run.builder_model, run.builder_duration_ms,
        run.reuse_assets_used, run.files_created, run.files_modified,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<BuildRunRecord | null> {
    return this.db.queryOne<BuildRunRecord>(
      `SELECT * FROM build_runs WHERE id = $1`,
      [id]
    );
  }

  async findByAppId(appId: string): Promise<BuildRunRecord[]> {
    return this.db.query<BuildRunRecord>(
      `SELECT * FROM build_runs WHERE app_id = $1 ORDER BY created_at DESC`,
      [appId]
    );
  }

  async findByBridgeId(bridgeId: string): Promise<BuildRunRecord[]> {
    return this.db.query<BuildRunRecord>(
      `SELECT * FROM build_runs WHERE bridge_id = $1 ORDER BY created_at DESC`,
      [bridgeId]
    );
  }

  async findByStatus(status: string): Promise<BuildRunRecord[]> {
    return this.db.query<BuildRunRecord>(
      `SELECT * FROM build_runs WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
  }

  async updateStatus(id: string, status: string, extras?: {
    commit_sha?: string;
    pr_number?: number;
    pr_url?: string;
    builder_duration_ms?: number;
    files_created?: string[];
    files_modified?: string[];
  }): Promise<BuildRunRecord | null> {
    return this.db.queryOne<BuildRunRecord>(
      `UPDATE build_runs SET
        status = $1,
        started_at = CASE WHEN $1 = 'executing' AND started_at IS NULL THEN now() ELSE started_at END,
        completed_at = CASE WHEN $1 IN ('passed','failed') THEN now() ELSE completed_at END,
        commit_sha = COALESCE($3, commit_sha),
        pr_number = COALESCE($4, pr_number),
        pr_url = COALESCE($5, pr_url),
        builder_duration_ms = COALESCE($6, builder_duration_ms),
        files_created = COALESCE($7, files_created),
        files_modified = COALESCE($8, files_modified)
       WHERE id = $2 RETURNING *`,
      [
        status, id,
        extras?.commit_sha ?? null,
        extras?.pr_number ?? null,
        extras?.pr_url ?? null,
        extras?.builder_duration_ms ?? null,
        extras?.files_created ?? null,
        extras?.files_modified ?? null,
      ]
    );
  }

  async findLatestByBridgeId(bridgeId: string): Promise<BuildRunRecord | null> {
    return this.db.queryOne<BuildRunRecord>(
      `SELECT * FROM build_runs WHERE bridge_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [bridgeId]
    );
  }
}
