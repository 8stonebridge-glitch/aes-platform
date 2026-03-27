import { PgClient } from "../services/pg-client.js";
import { FeatureBridgeRecord } from "../schema/types.js";

export type CreateFeatureBridge = Omit<FeatureBridgeRecord, "id" | "created_at" | "updated_at">;

export class FeatureBridgeRepo {
  constructor(private db: PgClient) {}

  async create(bridge: CreateFeatureBridge): Promise<FeatureBridgeRecord> {
    const rows = await this.db.query<FeatureBridgeRecord>(
      `INSERT INTO feature_bridges (
        bridge_id, app_id, app_spec_id, feature_id, feature_name,
        status, bridge_data, confidence_overall,
        parent_id, version
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING *`,
      [
        bridge.bridge_id, bridge.app_id, bridge.app_spec_id,
        bridge.feature_id, bridge.feature_name,
        bridge.status, JSON.stringify(bridge.bridge_data), bridge.confidence_overall,
        bridge.parent_id, bridge.version,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<FeatureBridgeRecord | null> {
    return this.db.queryOne<FeatureBridgeRecord>(
      `SELECT * FROM feature_bridges WHERE id = $1`,
      [id]
    );
  }

  async findByBridgeId(bridgeId: string): Promise<FeatureBridgeRecord | null> {
    return this.db.queryOne<FeatureBridgeRecord>(
      `SELECT * FROM feature_bridges WHERE bridge_id = $1 ORDER BY version DESC LIMIT 1`,
      [bridgeId]
    );
  }

  async findByAppId(appId: string): Promise<FeatureBridgeRecord[]> {
    return this.db.query<FeatureBridgeRecord>(
      `SELECT * FROM feature_bridges WHERE app_id = $1 ORDER BY created_at ASC`,
      [appId]
    );
  }

  async findByStatus(status: string): Promise<FeatureBridgeRecord[]> {
    return this.db.query<FeatureBridgeRecord>(
      `SELECT * FROM feature_bridges WHERE status = $1 ORDER BY created_at ASC`,
      [status]
    );
  }

  async findByFeatureId(featureId: string): Promise<FeatureBridgeRecord[]> {
    return this.db.query<FeatureBridgeRecord>(
      `SELECT * FROM feature_bridges WHERE feature_id = $1 ORDER BY version DESC`,
      [featureId]
    );
  }
}
