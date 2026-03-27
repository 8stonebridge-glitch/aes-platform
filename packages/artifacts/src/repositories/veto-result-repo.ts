import { PgClient } from "../services/pg-client.js";
import { VetoResultRecord } from "../schema/types.js";

export type CreateVetoResult = Omit<VetoResultRecord, "id" | "evaluated_at">;

export class VetoResultRepo {
  constructor(private db: PgClient) {}

  async create(veto: CreateVetoResult): Promise<VetoResultRecord> {
    const rows = await this.db.query<VetoResultRecord>(
      `INSERT INTO veto_results (bridge_id, any_triggered, triggered_codes, result_data)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [veto.bridge_id, veto.any_triggered, veto.triggered_codes, JSON.stringify(veto.result_data)]
    );
    return rows[0];
  }

  async findById(id: string): Promise<VetoResultRecord | null> {
    return this.db.queryOne<VetoResultRecord>(
      `SELECT * FROM veto_results WHERE id = $1`,
      [id]
    );
  }

  async findByBridgeId(bridgeId: string): Promise<VetoResultRecord[]> {
    return this.db.query<VetoResultRecord>(
      `SELECT * FROM veto_results WHERE bridge_id = $1 ORDER BY evaluated_at DESC`,
      [bridgeId]
    );
  }

  async findLatestByBridgeId(bridgeId: string): Promise<VetoResultRecord | null> {
    return this.db.queryOne<VetoResultRecord>(
      `SELECT * FROM veto_results WHERE bridge_id = $1 ORDER BY evaluated_at DESC LIMIT 1`,
      [bridgeId]
    );
  }

  async findTriggered(): Promise<VetoResultRecord[]> {
    return this.db.query<VetoResultRecord>(
      `SELECT * FROM veto_results WHERE any_triggered = true ORDER BY evaluated_at DESC`,
      []
    );
  }
}
