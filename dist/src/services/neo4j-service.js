/**
 * Neo4j Service — singleton client for the AES knowledge graph.
 *
 * Graceful degradation: if Neo4j is unavailable, methods log a warning
 * and return empty results. The pipeline never crashes due to graph issues.
 */
import neo4j from "neo4j-driver";
export class Neo4jService {
    url;
    user;
    password;
    driver = null;
    connected = false;
    constructor(url = process.env.AES_NEO4J_URL || "bolt://localhost:17687", user = process.env.AES_NEO4J_USER || "neo4j", password = process.env.AES_NEO4J_PASSWORD || "aes_dev_password") {
        this.url = url;
        this.user = user;
        this.password = password;
    }
    /**
     * Lazily connect to Neo4j. Safe to call multiple times.
     */
    async connect() {
        if (this.connected && this.driver)
            return true;
        try {
            this.driver = neo4j.driver(this.url, neo4j.auth.basic(this.user, this.password));
            // Verify connectivity with a short timeout
            await this.driver.verifyConnectivity({ database: "neo4j" });
            this.connected = true;
            console.log(`[neo4j] Connected to ${this.url}`);
            return true;
        }
        catch (err) {
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
    async runCypher(query, params) {
        if (!this.connected || !this.driver) {
            const ok = await this.connect();
            if (!ok)
                return [];
        }
        let session = null;
        try {
            session = this.driver.session({ database: "neo4j" });
            const result = await session.run(query, params || {});
            return result.records.map((r) => r.toObject());
        }
        catch (err) {
            console.warn(`[neo4j] Query failed: ${err.message}`);
            return [];
        }
        finally {
            if (session) {
                await session.close().catch(() => { });
            }
        }
    }
    /**
     * Check whether the service has an active connection.
     */
    isConnected() {
        return this.connected;
    }
    /**
     * Close the driver gracefully.
     */
    async close() {
        if (this.driver) {
            await this.driver.close().catch(() => { });
            this.driver = null;
            this.connected = false;
        }
    }
}
// ─── Singleton ───────────────────────────────────────────────────────
let instance = null;
export function getNeo4jService() {
    if (!instance) {
        instance = new Neo4jService();
    }
    return instance;
}
export function resetNeo4jService() {
    if (instance) {
        instance.close().catch(() => { });
    }
    instance = null;
}
