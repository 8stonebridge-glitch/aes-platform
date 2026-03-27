import { PgClient } from "../services/pg-client.js";
import { CatalogAdmissionRecord } from "../schema/types.js";

export type CreateCatalogAdmission = Omit<CatalogAdmissionRecord, "id" | "reviewed_at">;

export class CatalogAdmissionRepo {
  constructor(private db: PgClient) {}

  async create(admission: CreateCatalogAdmission): Promise<CatalogAdmissionRecord> {
    const rows = await this.db.query<CatalogAdmissionRecord>(
      `INSERT INTO catalog_admissions (
        candidate_id, source_app_id, source_feature_id,
        asset_type, asset_name,
        decision, reasons, missing_requirements, next_actions
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *`,
      [
        admission.candidate_id, admission.source_app_id, admission.source_feature_id,
        admission.asset_type, admission.asset_name,
        admission.decision, admission.reasons,
        admission.missing_requirements, admission.next_actions,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<CatalogAdmissionRecord | null> {
    return this.db.queryOne<CatalogAdmissionRecord>(
      `SELECT * FROM catalog_admissions WHERE id = $1`,
      [id]
    );
  }

  async findByCandidateId(candidateId: string): Promise<CatalogAdmissionRecord[]> {
    return this.db.query<CatalogAdmissionRecord>(
      `SELECT * FROM catalog_admissions WHERE candidate_id = $1 ORDER BY reviewed_at DESC`,
      [candidateId]
    );
  }

  async findByDecision(decision: string): Promise<CatalogAdmissionRecord[]> {
    return this.db.query<CatalogAdmissionRecord>(
      `SELECT * FROM catalog_admissions WHERE decision = $1 ORDER BY reviewed_at DESC`,
      [decision]
    );
  }

  async findBySourceApp(appId: string): Promise<CatalogAdmissionRecord[]> {
    return this.db.query<CatalogAdmissionRecord>(
      `SELECT * FROM catalog_admissions WHERE source_app_id = $1 ORDER BY reviewed_at DESC`,
      [appId]
    );
  }
}
