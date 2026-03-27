import { PgClient } from "../services/pg-client.js";
import { FixTrailRecord } from "../schema/types.js";

export type CreateFixTrail = Omit<FixTrailRecord, "id" | "created_at" | "resolved_at">;

export class FixTrailRepo {
  constructor(private db: PgClient) {}

  async create(trail: CreateFixTrail): Promise<FixTrailRecord> {
    const rows = await this.db.query<FixTrailRecord>(
      `INSERT INTO fix_trails (
        failure_id, app_id, feature_id, build_id,
        stage, failure_type, root_cause_category,
        symptom, affected_surface, severity,
        first_detector,
        resolution_action, resolution_detail, reused_fix_pattern,
        validation_after_fix,
        promoted_to_catalog_candidate, prevented_by_existing_rule,
        similar_past_failures
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *`,
      [
        trail.failure_id, trail.app_id, trail.feature_id, trail.build_id,
        trail.stage, trail.failure_type, trail.root_cause_category,
        trail.symptom, trail.affected_surface, trail.severity,
        trail.first_detector,
        trail.resolution_action, trail.resolution_detail, trail.reused_fix_pattern,
        trail.validation_after_fix,
        trail.promoted_to_catalog_candidate, trail.prevented_by_existing_rule,
        trail.similar_past_failures,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<FixTrailRecord | null> {
    return this.db.queryOne<FixTrailRecord>(
      `SELECT * FROM fix_trails WHERE id = $1`,
      [id]
    );
  }

  async findByAppId(appId: string): Promise<FixTrailRecord[]> {
    return this.db.query<FixTrailRecord>(
      `SELECT * FROM fix_trails WHERE app_id = $1 ORDER BY created_at DESC`,
      [appId]
    );
  }

  async findByBuildId(buildId: string): Promise<FixTrailRecord[]> {
    return this.db.query<FixTrailRecord>(
      `SELECT * FROM fix_trails WHERE build_id = $1 ORDER BY created_at DESC`,
      [buildId]
    );
  }

  async findSimilar(failureType: string, rootCauseCategory: string): Promise<FixTrailRecord[]> {
    return this.db.query<FixTrailRecord>(
      `SELECT * FROM fix_trails
       WHERE failure_type = $1 AND root_cause_category = $2
       ORDER BY created_at DESC`,
      [failureType, rootCauseCategory]
    );
  }

  async findByStage(stage: string): Promise<FixTrailRecord[]> {
    return this.db.query<FixTrailRecord>(
      `SELECT * FROM fix_trails WHERE stage = $1 ORDER BY created_at DESC`,
      [stage]
    );
  }

  async findUnresolved(): Promise<FixTrailRecord[]> {
    return this.db.query<FixTrailRecord>(
      `SELECT * FROM fix_trails WHERE resolved_at IS NULL ORDER BY created_at ASC`,
      []
    );
  }

  async markResolved(id: string): Promise<FixTrailRecord | null> {
    return this.db.queryOne<FixTrailRecord>(
      `UPDATE fix_trails SET resolved_at = now() WHERE id = $1 RETURNING *`,
      [id]
    );
  }
}
