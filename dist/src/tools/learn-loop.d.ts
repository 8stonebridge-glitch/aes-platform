/**
 * learn-loop.ts — Automated learning loop with feedback.
 *
 * Runs test scenarios against the knowledge graph, scores the results,
 * and writes feedback + corrections back to Neo4j so AES learns.
 *
 * Two modes:
 *   1. Auto-test: run predefined scenarios with expected answers
 *   2. Custom: pass a description as CLI arg
 *
 * Usage:
 *   npx tsx src/tools/learn-loop.ts                          # run all test scenarios
 *   npx tsx src/tools/learn-loop.ts "barber shop booking app" # custom query
 */
export {};
