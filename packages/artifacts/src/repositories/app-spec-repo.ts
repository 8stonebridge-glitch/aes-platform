import { PgClient } from "../services/pg-client.js";
import { AppSpecRecord } from "../schema/types.js";

export type CreateAppSpec = Omit<AppSpecRecord, "id" | "created_at" | "updated_at">;

export class AppSpecRepo {
  constructor(private db: PgClient) {}

  async create(spec: CreateAppSpec): Promise<AppSpecRecord> {
    const rows = await this.db.query<AppSpecRecord>(
      `INSERT INTO app_specs (
        app_id, request_id, intent_brief_id,
        title, summary, app_class, risk_class,
        spec_data, confidence_overall,
        parent_id, version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        spec.app_id, spec.request_id, spec.intent_brief_id,
        spec.title, spec.summary, spec.app_class, spec.risk_class,
        JSON.stringify(spec.spec_data), spec.confidence_overall,
        spec.parent_id, spec.version,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<AppSpecRecord | null> {
    return this.db.queryOne<AppSpecRecord>(
      `SELECT * FROM app_specs WHERE id = $1`,
      [id]
    );
  }

  async findByAppId(appId: string): Promise<AppSpecRecord[]> {
    return this.db.query<AppSpecRecord>(
      `SELECT * FROM app_specs WHERE app_id = $1 ORDER BY version DESC`,
      [appId]
    );
  }

  async findLatestByAppId(appId: string): Promise<AppSpecRecord | null> {
    return this.db.queryOne<AppSpecRecord>(
      `SELECT * FROM app_specs WHERE app_id = $1 ORDER BY version DESC LIMIT 1`,
      [appId]
    );
  }

  async findByRequestId(requestId: string): Promise<AppSpecRecord[]> {
    return this.db.query<AppSpecRecord>(
      `SELECT * FROM app_specs WHERE request_id = $1 ORDER BY created_at DESC`,
      [requestId]
    );
  }
}
