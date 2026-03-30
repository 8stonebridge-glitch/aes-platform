/**
 * Neo4j Service — singleton client for the AES knowledge graph.
 *
 * Graceful degradation: if Neo4j is unavailable, methods log a warning
 * and return empty results. The pipeline never crashes due to graph issues.
 */
export declare class Neo4jService {
    private url;
    private user;
    private password;
    private driver;
    private connected;
    constructor(url?: string, user?: string, password?: string);
    /**
     * Lazily connect to Neo4j. Safe to call multiple times.
     */
    connect(): Promise<boolean>;
    /**
     * Run a Cypher query with optional parameters.
     * Returns the records array, or an empty array if Neo4j is unavailable.
     */
    runCypher(query: string, params?: Record<string, unknown>): Promise<any[]>;
    /**
     * Check whether the service has an active connection.
     */
    isConnected(): boolean;
    /**
     * Close the driver gracefully.
     */
    close(): Promise<void>;
}
export declare function getNeo4jService(): Neo4jService;
export declare function resetNeo4jService(): void;
