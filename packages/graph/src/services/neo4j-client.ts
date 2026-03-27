import neo4j, { Driver, Session, Record as Neo4jRecord } from "neo4j-driver";

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export class Neo4jClient {
  private driver: Driver;
  private database: string;

  constructor(config: Neo4jConfig) {
    this.driver = neo4j.driver(
      config.uri,
      neo4j.auth.basic(config.username, config.password),
    );
    this.database = config.database ?? "neo4j";
  }

  static fromEnv(): Neo4jClient {
    return new Neo4jClient({
      uri: process.env.NEO4J_URI ?? "bolt://localhost:7687",
      username: process.env.NEO4J_USERNAME ?? "neo4j",
      password: process.env.NEO4J_PASSWORD ?? "password",
      database: process.env.NEO4J_DATABASE ?? "neo4j",
    });
  }

  getSession(): Session {
    return this.driver.session({ database: this.database });
  }

  async runQuery(
    cypher: string,
    params: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>[]> {
    const session = this.getSession();
    try {
      const result = await session.run(cypher, params);
      return result.records.map((r: Neo4jRecord) => r.toObject());
    } finally {
      await session.close();
    }
  }

  async runWriteQuery(
    cypher: string,
    params: Record<string, unknown> = {},
  ): Promise<{ records: Record<string, unknown>[]; summary: { counters: Record<string, number> } }> {
    const session = this.getSession();
    try {
      const result = await session.executeWrite(async (tx) => {
        return tx.run(cypher, params);
      });
      return {
        records: result.records.map((r: Neo4jRecord) => r.toObject()),
        summary: {
          counters: result.summary.counters.updates() as unknown as Record<string, number>,
        },
      };
    } finally {
      await session.close();
    }
  }

  async runMultiple(statements: string[]): Promise<void> {
    const session = this.getSession();
    try {
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed && !trimmed.startsWith("//")) {
          await session.run(trimmed);
        }
      }
    } finally {
      await session.close();
    }
  }

  async verifyConnectivity(): Promise<boolean> {
    try {
      await this.driver.verifyConnectivity();
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    await this.driver.close();
  }
}
