/**
 * Neo4j Service — singleton client for the AES knowledge graph.
 *
 * Graceful degradation: if Neo4j is unavailable, methods log a warning
 * and return empty results. The pipeline never crashes due to graph issues.
 */

import neo4j, { type Driver, type Session } from "neo4j-driver";

export class Neo4jService {
  private driver: Driver | null = null;
  private connected = false;

  constructor(
    private url: string = process.env.AES_NEO4J_URL || "bolt://localhost:17687",
    private user: string = process.env.AES_NEO4J_USER || "neo4j",
    private password: string = process.env.AES_NEO4J_PASSWORD || "aes_dev_password"
  ) {}

  /**
   * Lazily connect to Neo4j. Safe to call multiple times.
   */
  async connect(): Promise<boolean> {
    if (this.connected && this.driver) return true;

    try {
      this.driver = neo4j.driver(
        this.url,
        neo4j.auth.basic(this.user, this.password)
      );
      // Verify connectivity with a short timeout
      await this.driver.verifyConnectivity({ database: "neo4j" });
      this.connected = true;
      console.log(`[neo4j] Connected to ${this.url}`);
      return true;
    } catch (err: any) {
      console.warn(`[neo4j] Connection failed (${this.url}): ${err.message} — graph updates will be skipped`);
      this.driver = null;
      this.connected = false;
      return false;
    }
  }

  /**
   * Run a Cypher query with optional parameters.
   * Returns the records array, or an empty array if Neo4j is unavailable.
   */
  async runCypher(
    query: string,
    params?: Record<string, unknown>
  ): Promise<any[]> {
    if (!this.connected || !this.driver) {
      const ok = await this.connect();
      if (!ok) return [];
    }

    let session: Session | null = null;
    try {
      session = this.driver!.session({ database: "neo4j" });
      const result = await session.run(query, params || {});
      return result.records.map((r: any) => r.toObject());
    } catch (err: any) {
      console.warn(`[neo4j] Query failed: ${err.message}`);
      return [];
    } finally {
      if (session) {
        await session.close().catch(() => {});
      }
    }
  }

  /**
   * Check whether the service has an active connection.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the driver gracefully.
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close().catch(() => {});
      this.driver = null;
      this.connected = false;
    }
  }
}

// ─── Singleton ───────────────────────────────────────────────────────

let instance: Neo4jService | null = null;

export function getNeo4jService(): Neo4jService {
  if (!instance) {
    instance = new Neo4jService();
  }
  return instance;
}

export function resetNeo4jService(): void {
  if (instance) {
    instance.close().catch(() => {});
  }
  instance = null;
}
