import { PgClient } from "../services/pg-client.js";
import { IntentBriefRecord } from "../schema/types.js";

export type CreateIntentBrief = Omit<IntentBriefRecord, "id" | "created_at" | "updated_at">;

export class IntentBriefRepo {
  constructor(private db: PgClient) {}

  async create(brief: CreateIntentBrief): Promise<IntentBriefRecord> {
    const rows = await this.db.query<IntentBriefRecord>(
      `INSERT INTO intent_briefs (
        request_id, raw_request,
        inferred_app_class, inferred_primary_users, inferred_core_outcome,
        inferred_platforms, inferred_risk_class, inferred_integrations,
        explicit_inclusions, explicit_exclusions,
        ambiguity_flags, assumptions,
        confirmation_statement, confirmation_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [
        brief.request_id, brief.raw_request,
        brief.inferred_app_class, brief.inferred_primary_users, brief.inferred_core_outcome,
        brief.inferred_platforms, brief.inferred_risk_class, brief.inferred_integrations,
        brief.explicit_inclusions, brief.explicit_exclusions,
        brief.ambiguity_flags, brief.assumptions,
        brief.confirmation_statement, brief.confirmation_status,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<IntentBriefRecord | null> {
    return this.db.queryOne<IntentBriefRecord>(
      `SELECT * FROM intent_briefs WHERE id = $1`,
      [id]
    );
  }

  async findByRequestId(requestId: string): Promise<IntentBriefRecord | null> {
    return this.db.queryOne<IntentBriefRecord>(
      `SELECT * FROM intent_briefs WHERE request_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [requestId]
    );
  }

  async findByStatus(status: string): Promise<IntentBriefRecord[]> {
    return this.db.query<IntentBriefRecord>(
      `SELECT * FROM intent_briefs WHERE confirmation_status = $1 ORDER BY created_at DESC`,
      [status]
    );
  }
}
