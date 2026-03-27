import { PgClient } from "../services/pg-client.js";
import { ValidatorResultRecord } from "../schema/types.js";

export type CreateValidatorResult = Omit<ValidatorResultRecord, "id" | "created_at">;

export class ValidatorResultRepo {
  constructor(private db: PgClient) {}

  async create(result: CreateValidatorResult): Promise<ValidatorResultRecord> {
    const rows = await this.db.query<ValidatorResultRecord>(
      `INSERT INTO validator_results (
        bridge_id, build_run_id, validator_name, validator_tier,
        verdict, evidence, concerns, execution_time_ms
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        result.bridge_id, result.build_run_id,
        result.validator_name, result.validator_tier,
        result.verdict, JSON.stringify(result.evidence),
        result.concerns, result.execution_time_ms,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<ValidatorResultRecord | null> {
    return this.db.queryOne<ValidatorResultRecord>(
      `SELECT * FROM validator_results WHERE id = $1`,
      [id]
    );
  }

  async findByBridgeId(bridgeId: string): Promise<ValidatorResultRecord[]> {
    return this.db.query<ValidatorResultRecord>(
      `SELECT * FROM validator_results WHERE bridge_id = $1 ORDER BY created_at DESC`,
      [bridgeId]
    );
  }

  async findByBuildRunId(buildRunId: string): Promise<ValidatorResultRecord[]> {
    return this.db.query<ValidatorResultRecord>(
      `SELECT * FROM validator_results WHERE build_run_id = $1 ORDER BY created_at ASC`,
      [buildRunId]
    );
  }

  async findByVerdict(verdict: string): Promise<ValidatorResultRecord[]> {
    return this.db.query<ValidatorResultRecord>(
      `SELECT * FROM validator_results WHERE verdict = $1 ORDER BY created_at DESC`,
      [verdict]
    );
  }

  async findByBridgeAndTier(bridgeId: string, tier: string): Promise<ValidatorResultRecord[]> {
    return this.db.query<ValidatorResultRecord>(
      `SELECT * FROM validator_results WHERE bridge_id = $1 AND validator_tier = $2 ORDER BY created_at DESC`,
      [bridgeId, tier]
    );
  }
}
