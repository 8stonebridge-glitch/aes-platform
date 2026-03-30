/**
 * think-on-graph.ts — LLM-driven iterative graph exploration.
 *
 * Instead of one-shot keyword queries, the system:
 *   1. Starts at a seed node
 *   2. Looks at all outgoing edges
 *   3. Scores each edge for relevance to the request
 *   4. Follows the best edges (beam search)
 *   5. At each new node, repeats — discovers connected knowledge
 *   6. Builds a traced reasoning path with evidence at every hop
 *
 * Every fact in the final answer has an explicit graph path backing it.
 *
 * Usage:
 *   npx tsx src/tools/think-on-graph.ts "barber shop appointment booking app"
 *   npx tsx src/tools/think-on-graph.ts "AI-powered invoice management platform"
 */
export {};
