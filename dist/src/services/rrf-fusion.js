/**
 * rrf-fusion.ts — Reciprocal Rank Fusion for combining keyword + vector search results.
 *
 * RRF merges two ranked lists without needing score normalization.
 * Formula: RRF_score(d) = Σ 1 / (k + rank_i(d))
 * where rank_i(d) is the rank of document d in list i, and k is a constant (default 60).
 *
 * Reference: Cormack, Clarke, Buettcher (2009) "Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods"
 */
/**
 * Reciprocal Rank Fusion — merge keyword and vector ranked lists.
 *
 * @param keywordResults  Ranked list from keyword/Cypher search (position = rank)
 * @param vectorResults   Ranked list from vector similarity search (position = rank)
 * @param k               RRF constant — higher = more weight to lower-ranked items (default 60)
 * @returns               Fused list sorted by RRF score descending
 */
export function rrfFuse(keywordResults, vectorResults, k = 60) {
    const fusedMap = new Map();
    // Helper to get or create entry
    function getEntry(item) {
        const key = `${item.label}:${item.id}`;
        if (!fusedMap.has(key)) {
            fusedMap.set(key, {
                id: item.id,
                name: item.name,
                label: item.label,
                properties: item.properties,
                rrfScore: 0,
                keywordRank: 0,
                vectorRank: 0,
                sources: [],
            });
        }
        return fusedMap.get(key);
    }
    // Score keyword results (rank is 1-based)
    for (let i = 0; i < keywordResults.length; i++) {
        const rank = i + 1;
        const entry = getEntry(keywordResults[i]);
        entry.rrfScore += 1 / (k + rank);
        entry.keywordRank = rank;
        if (!entry.sources.includes("keyword"))
            entry.sources.push("keyword");
        // Merge properties from keyword results
        Object.assign(entry.properties, keywordResults[i].properties);
    }
    // Score vector results (rank is 1-based)
    for (let i = 0; i < vectorResults.length; i++) {
        const rank = i + 1;
        const entry = getEntry(vectorResults[i]);
        entry.rrfScore += 1 / (k + rank);
        entry.vectorRank = rank;
        if (!entry.sources.includes("vector"))
            entry.sources.push("vector");
        // Merge properties — keyword props take precedence (they're from structured queries)
        for (const [key, val] of Object.entries(vectorResults[i].properties)) {
            if (!(key in entry.properties) || entry.properties[key] == null) {
                entry.properties[key] = val;
            }
        }
    }
    // Sort by fused score descending
    const results = Array.from(fusedMap.values());
    results.sort((a, b) => b.rrfScore - a.rrfScore);
    return results;
}
/**
 * Boost RRF items that appear in BOTH lists.
 * Items found by both keyword and vector get a multiplicative boost,
 * reflecting higher confidence in relevance.
 *
 * @param results     Output of rrfFuse
 * @param boostFactor Multiplier for dual-source items (default 1.5)
 */
export function boostDualSource(results, boostFactor = 1.5) {
    for (const r of results) {
        if (r.sources.length === 2) {
            r.rrfScore *= boostFactor;
        }
    }
    results.sort((a, b) => b.rrfScore - a.rrfScore);
    return results;
}
