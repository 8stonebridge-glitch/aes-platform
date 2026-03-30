/**
 * rrf-fusion.ts — Reciprocal Rank Fusion for combining keyword + vector search results.
 *
 * RRF merges two ranked lists without needing score normalization.
 * Formula: RRF_score(d) = Σ 1 / (k + rank_i(d))
 * where rank_i(d) is the rank of document d in list i, and k is a constant (default 60).
 *
 * Reference: Cormack, Clarke, Buettcher (2009) "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
 */
export interface RankedItem {
    /** Unique identifier — used to match items across lists */
    id: string;
    /** Display name */
    name: string;
    /** Node type label (e.g. LearnedFeature) */
    label: string;
    /** Original properties carried through */
    properties: Record<string, any>;
}
export interface FusedResult extends RankedItem {
    /** Final RRF score */
    rrfScore: number;
    /** Rank in keyword results (0 = not present) */
    keywordRank: number;
    /** Rank in vector results (0 = not present) */
    vectorRank: number;
    /** Which sources contributed */
    sources: ("keyword" | "vector")[];
}
/**
 * Reciprocal Rank Fusion — merge keyword and vector ranked lists.
 *
 * @param keywordResults  Ranked list from keyword/Cypher search (position = rank)
 * @param vectorResults   Ranked list from vector similarity search (position = rank)
 * @param k               RRF constant — higher = more weight to lower-ranked items (default 60)
 * @returns               Fused list sorted by RRF score descending
 */
export declare function rrfFuse(keywordResults: RankedItem[], vectorResults: RankedItem[], k?: number): FusedResult[];
/**
 * Boost RRF items that appear in BOTH lists.
 * Items found by both keyword and vector get a multiplicative boost,
 * reflecting higher confidence in relevance.
 *
 * @param results     Output of rrfFuse
 * @param boostFactor Multiplier for dual-source items (default 1.5)
 */
export declare function boostDualSource(results: FusedResult[], boostFactor?: number): FusedResult[];
