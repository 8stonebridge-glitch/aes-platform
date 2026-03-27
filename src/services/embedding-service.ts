/**
 * Embedding Service — generates and caches embeddings for AES graph nodes.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims, cheap, fast).
 * Stores embeddings directly on Neo4j nodes as float arrays.
 * Creates vector indexes for cosine similarity search.
 *
 * Graceful degradation: if no OpenAI key, all methods return empty/skip.
 */

import OpenAI from "openai";

// ═══════════════════════════════════════════════════════════════════════
// SINGLETON
// ═══════════════════════════════════════════════════════════════════════

let client: OpenAI | null = null;
const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

function getClient(): OpenAI | null {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY || process.env.AES_OPENAI_API_KEY;
  if (!apiKey) return null;
  client = new OpenAI({ apiKey });
  return client;
}

export function isEmbeddingAvailable(): boolean {
  return getClient() !== null;
}

export function getEmbeddingDimensions(): number {
  return DIMENSIONS;
}

// ═══════════════════════════════════════════════════════════════════════
// EMBEDDING GENERATION
// ═══════════════════════════════════════════════════════════════════════

/**
 * Generate an embedding for a single text string.
 */
export async function embed(text: string): Promise<number[] | null> {
  const c = getClient();
  if (!c) return null;

  try {
    const response = await c.embeddings.create({
      model: MODEL,
      input: text,
      dimensions: DIMENSIONS,
    });
    return response.data[0].embedding;
  } catch (err: any) {
    console.warn(`[embedding] Failed: ${err.message}`);
    return null;
  }
}

/**
 * Generate embeddings for multiple texts in a single batch.
 * OpenAI supports up to 2048 inputs per request.
 */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const c = getClient();
  if (!c || texts.length === 0) return texts.map(() => null);

  const results: (number[] | null)[] = new Array(texts.length).fill(null);
  const BATCH_SIZE = 512;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await c.embeddings.create({
        model: MODEL,
        input: batch,
        dimensions: DIMENSIONS,
      });
      for (const item of response.data) {
        results[i + item.index] = item.embedding;
      }
    } catch (err: any) {
      console.warn(`[embedding] Batch ${i}-${i + batch.length} failed: ${err.message}`);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// TEXT BUILDERS — create meaningful text representations of graph nodes
// ═══════════════════════════════════════════════════════════════════════

export function featureText(f: {
  name: string; description?: string; complexity?: string;
  app_name?: string; app_class?: string; has_api?: boolean; has_tests?: boolean;
  directory?: string;
}): string {
  const parts = [f.name];
  if (f.app_name) parts.push(`from ${f.app_name}`);
  if (f.app_class) parts.push(`(${f.app_class.replace(/_/g, " ")})`);
  if (f.description) parts.push(`— ${f.description}`);
  if (f.complexity) parts.push(`[${f.complexity}]`);
  if (f.has_api) parts.push("with API");
  if (f.has_tests) parts.push("tested");
  if (f.directory) parts.push(`in ${f.directory}`);
  return parts.join(" ");
}

export function modelText(m: {
  name: string; category?: string; fields_csv?: string;
  app_name?: string; app_class?: string; relation_count?: number;
}): string {
  const parts = [`${m.name} data model`];
  if (m.category && m.category !== "general") parts.push(`(${m.category.replace(/_/g, " ")})`);
  if (m.app_name) parts.push(`from ${m.app_name}`);
  if (m.app_class) parts.push(`(${m.app_class.replace(/_/g, " ")})`);
  if (m.fields_csv) parts.push(`fields: ${m.fields_csv.slice(0, 300)}`);
  if (m.relation_count && m.relation_count > 0) parts.push(`${m.relation_count} relations`);
  return parts.join(" ");
}

export function integrationText(i: {
  name: string; type?: string; provider?: string;
  app_name?: string; auth_method?: string;
}): string {
  const parts = [i.provider || i.name];
  if (i.type) parts.push(`${i.type.replace(/_/g, " ")} integration`);
  if (i.app_name) parts.push(`used by ${i.app_name}`);
  if (i.auth_method && i.auth_method !== "unknown") parts.push(`auth: ${i.auth_method}`);
  return parts.join(" ");
}

export function patternText(p: {
  name: string; type?: string; description?: string;
  app_name?: string; applicable_to?: string;
}): string {
  const parts = [p.name];
  if (p.type) parts.push(`[${p.type}]`);
  if (p.app_name) parts.push(`from ${p.app_name}`);
  if (p.description) parts.push(`— ${p.description.slice(0, 250)}`);
  if (p.applicable_to) parts.push(`applies to: ${p.applicable_to}`);
  return parts.join(" ");
}

export function flowText(f: {
  name: string; steps_description?: string;
  app_name?: string; section?: string; step_count?: number;
}): string {
  const parts = [f.name];
  if (f.app_name) parts.push(`from ${f.app_name}`);
  if (f.section) parts.push(`in ${f.section}`);
  if (f.step_count) parts.push(`(${f.step_count} steps)`);
  if (f.steps_description) parts.push(`— ${f.steps_description.slice(0, 250)}`);
  return parts.join(" ");
}

// ═══════════════════════════════════════════════════════════════════════
// VECTOR SEARCH — query Neo4j vector indexes by cosine similarity
// ═══════════════════════════════════════════════════════════════════════

export interface VectorSearchResult {
  id: string;
  name: string;
  label: string;
  score: number;
  properties: Record<string, any>;
}

const INDEX_MAP: Record<string, { index: string; idField: string }> = {
  LearnedFeature:     { index: "feature_embedding_idx",     idField: "feature_id" },
  LearnedDataModel:   { index: "model_embedding_idx",       idField: "name" },
  LearnedIntegration: { index: "integration_embedding_idx", idField: "name" },
  LearnedPattern:     { index: "pattern_embedding_idx",     idField: "name" },
  LearnedUserFlow:    { index: "flow_embedding_idx",        idField: "name" },
};

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
export async function vectorSearch(
  queryText: string,
  nodeType: string,
  topK: number,
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
): Promise<VectorSearchResult[]> {
  const indexInfo = INDEX_MAP[nodeType];
  if (!indexInfo) return [];

  // Embed the query
  const queryEmbedding = await embed(queryText);
  if (!queryEmbedding) return [];

  try {
    const rows = await neo4jRun(
      `CALL db.index.vector.queryNodes($indexName, $topK, $embedding)
       YIELD node, score
       RETURN node.${indexInfo.idField} AS id,
              node.name AS name,
              labels(node)[0] AS label,
              score,
              properties(node) AS props
       ORDER BY score DESC`,
      { indexName: indexInfo.index, topK, embedding: queryEmbedding },
    );

    return rows.map((r: any) => ({
      id: r.id || r.name,
      name: r.name,
      label: nodeType,
      score: typeof r.score === "number" ? r.score : 0,
      properties: r.props || {},
    }));
  } catch (err: any) {
    // Vector index may not exist yet — graceful degradation
    if (!err.message?.includes("index not found") && !err.message?.includes("no such index")) {
      console.warn(`[vectorSearch] ${nodeType}: ${err.message}`);
    }
    return [];
  }
}

/**
 * Search ALL node types at once and return combined results.
 */
export async function vectorSearchAll(
  queryText: string,
  topK: number,
  neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>,
): Promise<VectorSearchResult[]> {
  const types = Object.keys(INDEX_MAP);
  const results = await Promise.all(
    types.map(t => vectorSearch(queryText, t, topK, neo4jRun)),
  );
  return results.flat().sort((a, b) => b.score - a.score);
}
