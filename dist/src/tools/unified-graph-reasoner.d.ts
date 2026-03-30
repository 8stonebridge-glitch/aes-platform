/**
 * unified-graph-reasoner.ts — AES Unified Graph Reasoning Engine
 *
 * Merges three separate tools into one:
 *   1. smart-graph-reader.ts   → auto-synonyms, confidence scoring, cross-app frequency
 *   2. cross-domain-reason.ts  → domain decomposition, best-source-per-domain, composite blueprints
 *   3. think-on-graph.ts       → iterative beam search with hunger-driven exploration
 *
 * Flow:
 *   Step 0: Load AES reasoning rules from graph
 *   Step 1: Decompose request into domains (scheduling, payments, auth, etc.)
 *   Step 2: Auto-generate synonym clusters from graph co-occurrence
 *   Step 3: Domain-aware + synonym-aware seed discovery
 *   Step 4: Hunger-driven beam search with synonym-boosted edge scoring
 *   Step 5: Confidence scoring per concept across all node types
 *   Step 6: Cross-domain composite blueprint with traced paths
 *
 * Usage:
 *   npx tsx src/tools/unified-graph-reasoner.ts "barber shop appointment booking app"
 *   npx tsx src/tools/unified-graph-reasoner.ts "AI-powered invoice management with chat and document signing"
 */
interface GraphNode {
    id: string;
    label: string;
    name: string;
    properties: Record<string, any>;
}
interface GraphEdge {
    type: string;
    targetNode: GraphNode;
    score: number;
    reason: string;
}
/**
 * SYNONYM-BOOSTED EDGE SCORING
 * Unlike the original think-on-graph which scored edges against raw keywords only,
 * this version scores against the full expanded synonym set from the graph.
 *
 * FIX 6 HOOK: When an LLM scorer is available, the top-K edges (after keyword+hunger scoring)
 * can be re-ranked by an LLM that evaluates semantic relevance to the request.
 * Set `llmScorer` to enable. Without it, keyword+hunger heuristics are used (current behavior).
 */
type LLMEdgeScorer = (request: string, edges: GraphEdge[]) => Promise<GraphEdge[]>;
/** Call this to enable LLM-based edge re-ranking in the beam search */
export declare function setLLMScorer(scorer: LLMEdgeScorer): void;
export {};
