/**
 * Embedding Service — generates and caches embeddings for AES graph nodes.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims, cheap, fast).
 * Stores embeddings directly on Neo4j nodes as float arrays.
 * Creates vector indexes for cosine similarity search.
 *
 * Graceful degradation: if no OpenAI key, all methods return empty/skip.
 */
export declare function isEmbeddingAvailable(): boolean;
export declare function getEmbeddingDimensions(): number;
/**
 * Generate an embedding for a single text string.
 */
export declare function embed(text: string): Promise<number[] | null>;
/**
 * Generate embeddings for multiple texts in a single batch.
 * OpenAI supports up to 2048 inputs per request.
 */
export declare function embedBatch(texts: string[]): Promise<(number[] | null)[]>;
export declare function featureText(f: {
    name: string;
    description?: string;
    complexity?: string;
    app_name?: string;
    app_class?: string;
    has_api?: boolean;
    has_tests?: boolean;
    directory?: string;
}): string;
export declare function modelText(m: {
    name: string;
    category?: string;
    fields_csv?: string;
    app_name?: string;
    app_class?: string;
    relation_count?: number;
}): string;
export declare function integrationText(i: {
    name: string;
    type?: string;
    provider?: string;
    app_name?: string;
    auth_method?: string;
}): string;
export declare function patternText(p: {
    name: string;
    type?: string;
    description?: string;
    app_name?: string;
    applicable_to?: string;
}): string;
export declare function flowText(f: {
    name: string;
    steps_description?: string;
    app_name?: string;
    section?: string;
    step_count?: number;
}): string;
export interface VectorSearchResult {
    id: string;
    name: string;
    label: string;
    score: number;
    properties: Record<string, any>;
}
/**
 * Semantic vector search against a Neo4j vector index.
 * Embeds the query text, then uses db.index.vector.queryNodes() for cosine similarity.
 *
 * @param queryText  Natural language query to embed
 * @param nodeType   One of: LearnedFeature, LearnedDataModel, LearnedIntegration, LearnedPattern, LearnedUserFlow
 * @param topK       Number of results to return (default 10)
 * @param neo4jRun   A function that runs Cypher and returns rows (e.g. neo4j.runCypher)
 * @returns          Ranked results with cosine similarity scores (0-1)
 */
export declare function vectorSearch(queryText: string, nodeType: string, topK: number, neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<VectorSearchResult[]>;
/**
 * Search ALL node types at once and return combined results.
 */
export declare function vectorSearchAll(queryText: string, topK: number, neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<VectorSearchResult[]>;
