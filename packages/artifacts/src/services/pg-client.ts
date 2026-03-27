import { Pool, PoolConfig } from "pg";

export class PgClient {
  private pool: Pool;

  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
  }

  async query<T = any>(text: string, params?: any[]): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows;
  }

  async queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
    const rows = await this.query<T>(text, params);
    return rows[0] ?? null;
  }

  async transaction<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const txClient = new PgClient({ connectionString: "" });
      // Override query to use the transaction client
      txClient.query = async <R = any>(text: string, params?: any[]): Promise<R[]> => {
        const result = await client.query(text, params);
        return result.rows;
      };
      txClient.queryOne = async <R = any>(text: string, params?: any[]): Promise<R | null> => {
        const rows = await txClient.query<R>(text, params);
        return rows[0] ?? null;
      };
      const result = await fn(txClient);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
