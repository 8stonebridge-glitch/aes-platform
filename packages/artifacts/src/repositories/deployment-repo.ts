import { PgClient } from "../services/pg-client.js";
import { DeploymentRecord } from "../schema/types.js";

export type CreateDeployment = Omit<DeploymentRecord, "id" | "created_at" | "deployed_at" | "rolled_back_at">;

export class DeploymentRepo {
  constructor(private db: PgClient) {}

  async create(deployment: CreateDeployment): Promise<DeploymentRecord> {
    const rows = await this.db.query<DeploymentRecord>(
      `INSERT INTO deployments (
        app_id, app_spec_id, environment, url,
        vercel_deployment_id, status, commit_sha, branch
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [
        deployment.app_id, deployment.app_spec_id,
        deployment.environment, deployment.url,
        deployment.vercel_deployment_id, deployment.status,
        deployment.commit_sha, deployment.branch,
      ]
    );
    return rows[0];
  }

  async findById(id: string): Promise<DeploymentRecord | null> {
    return this.db.queryOne<DeploymentRecord>(
      `SELECT * FROM deployments WHERE id = $1`,
      [id]
    );
  }

  async findByAppId(appId: string): Promise<DeploymentRecord[]> {
    return this.db.query<DeploymentRecord>(
      `SELECT * FROM deployments WHERE app_id = $1 ORDER BY created_at DESC`,
      [appId]
    );
  }

  async findByStatus(status: string): Promise<DeploymentRecord[]> {
    return this.db.query<DeploymentRecord>(
      `SELECT * FROM deployments WHERE status = $1 ORDER BY created_at DESC`,
      [status]
    );
  }

  async findLatestByAppAndEnv(appId: string, environment: string): Promise<DeploymentRecord | null> {
    return this.db.queryOne<DeploymentRecord>(
      `SELECT * FROM deployments WHERE app_id = $1 AND environment = $2 ORDER BY created_at DESC LIMIT 1`,
      [appId, environment]
    );
  }

  async updateStatus(id: string, status: string): Promise<DeploymentRecord | null> {
    return this.db.queryOne<DeploymentRecord>(
      `UPDATE deployments SET status = $1, deployed_at = CASE WHEN $1 = 'deployed' THEN now() ELSE deployed_at END,
       rolled_back_at = CASE WHEN $1 = 'rolled_back' THEN now() ELSE rolled_back_at END
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
  }
}
