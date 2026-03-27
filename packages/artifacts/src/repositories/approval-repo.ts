import { PgClient } from "../services/pg-client.js";
import { UserApprovalRecord } from "../schema/types.js";

export type CreateUserApproval = Omit<UserApprovalRecord, "id" | "created_at">;

export class ApprovalRepo {
  constructor(private db: PgClient) {}

  async create(approval: CreateUserApproval): Promise<UserApprovalRecord> {
    const rows = await this.db.query<UserApprovalRecord>(
      `INSERT INTO user_approvals (
        app_id, app_spec_id, approval_type,
        approved, user_comment, presented_data
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [
        approval.app_id, approval.app_spec_id, approval.approval_type,
        approval.approved, approval.user_comment,
        JSON.stringify(approval.presented_data),
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<UserApprovalRecord | null> {
    return this.db.queryOne<UserApprovalRecord>(
      `SELECT * FROM user_approvals WHERE id = $1`,
      [id]
    );
  }

  async findByAppId(appId: string): Promise<UserApprovalRecord[]> {
    return this.db.query<UserApprovalRecord>(
      `SELECT * FROM user_approvals WHERE app_id = $1 ORDER BY created_at DESC`,
      [appId]
    );
  }

  async findByAppSpecId(appSpecId: string): Promise<UserApprovalRecord[]> {
    return this.db.query<UserApprovalRecord>(
      `SELECT * FROM user_approvals WHERE app_spec_id = $1 ORDER BY created_at DESC`,
      [appSpecId]
    );
  }

  async findByType(approvalType: string): Promise<UserApprovalRecord[]> {
    return this.db.query<UserApprovalRecord>(
      `SELECT * FROM user_approvals WHERE approval_type = $1 ORDER BY created_at DESC`,
      [approvalType]
    );
  }

  async findLatestByAppAndType(appId: string, approvalType: string): Promise<UserApprovalRecord | null> {
    return this.db.queryOne<UserApprovalRecord>(
      `SELECT * FROM user_approvals WHERE app_id = $1 AND approval_type = $2 ORDER BY created_at DESC LIMIT 1`,
      [appId, approvalType]
    );
  }
}
