/**
 * index-graph-embeddings.ts — Generate embeddings for all graph nodes and store in Neo4j.
 *
 * Creates vector indexes for cosine similarity search.
 * Run once after graph is populated, re-run when new apps are learned.
 *
 * Usage:
 *   npx tsx src/tools/index-graph-embeddings.ts
 *   npx tsx src/tools/index-graph-embeddings.ts --force   # re-embed all nodes
 */
export {};
