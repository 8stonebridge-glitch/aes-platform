/**
 * cross-link-graph.ts — Compute and write SIMILAR_TO relationships between
 * nodes across different apps in the Neo4j knowledge graph.
 *
 * Links three node types:
 *   - LearnedFeature   — Jaccard similarity on name words (>= 0.5)
 *   - LearnedDataModel — exact or fuzzy name match across apps
 *   - LearnedIntegration — same provider across apps
 *
 * Usage:
 *   npx tsx src/tools/cross-link-graph.ts                        # full run
 *   npx tsx src/tools/cross-link-graph.ts --dry-run              # preview only
 *   npx tsx src/tools/cross-link-graph.ts --embedding            # use stored embeddings (cosine > 0.85)
 *   npx tsx src/tools/cross-link-graph.ts --dry-run --embedding  # preview embedding links
 */
import { getNeo4jService } from "../services/neo4j-service.js";
// ═══════════════════════════════════════════════════════════════════════
// SIMILARITY HELPERS
// ═══════════════════════════════════════════════════════════════════════
function wordSet(name) {
    return new Set(name
        .toLowerCase()
        .replace(/[-_]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2));
}
function jaccard(a, b) {
    const intersection = new Set([...a].filter((x) => b.has(x)));
    const union = new Set([...a, ...b]);
    return union.size === 0 ? 0 : intersection.size / union.size;
}
function normalizeName(name) {
    return name
        .toLowerCase()
        .replace(/[-_]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}
// ═══════════════════════════════════════════════════════════════════════
// FEATURE CROSS-LINKING
// ═══════════════════════════════════════════════════════════════════════
async function linkFeatures(dryRun) {
    const neo4j = getNeo4jService();
    const THRESHOLD = 0.5;
    console.log("\n── Feature cross-linking (Jaccard >= %s) ──", THRESHOLD);
    const rows = await neo4j.runCypher(`
    MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature)
    RETURN f.feature_id AS featureId, f.name AS name, a.source_id AS source
  `);
    if (rows.length === 0) {
        console.log("  No features found in graph.");
        return 0;
    }
    const features = rows.map((r) => ({
        featureId: r.featureId,
        name: r.name,
        source: r.source,
        words: wordSet(r.name),
    }));
    console.log("  Loaded %d features from %d apps", features.length, new Set(features.map((f) => f.source)).size);
    // Group by source to avoid comparing within the same app
    const bySource = new Map();
    for (const f of features) {
        if (!bySource.has(f.source))
            bySource.set(f.source, []);
        bySource.get(f.source).push(f);
    }
    const sources = [...bySource.keys()];
    const pairs = [];
    // Compare across apps only
    for (let i = 0; i < sources.length; i++) {
        for (let j = i + 1; j < sources.length; j++) {
            const groupA = bySource.get(sources[i]);
            const groupB = bySource.get(sources[j]);
            for (const a of groupA) {
                if (a.words.size === 0)
                    continue;
                for (const b of groupB) {
                    if (b.words.size === 0)
                        continue;
                    const score = jaccard(a.words, b.words);
                    if (score >= THRESHOLD) {
                        pairs.push({ a, b, score });
                    }
                }
            }
        }
    }
    console.log("  Found %d cross-app feature pairs above threshold", pairs.length);
    if (pairs.length > 0 && !dryRun) {
        for (const { a, b, score } of pairs) {
            await neo4j.runCypher(`
        MATCH (a:LearnedFeature {feature_id: $aid, source: $asrc})
        MATCH (b:LearnedFeature {feature_id: $bid, source: $bsrc})
        WHERE a <> b
        MERGE (a)-[:SIMILAR_TO {score: $score, method: 'jaccard'}]->(b)
        `, { aid: a.featureId, asrc: a.source, bid: b.featureId, bsrc: b.source, score });
        }
        console.log("  Wrote %d SIMILAR_TO edges (features)", pairs.length);
    }
    else if (dryRun && pairs.length > 0) {
        console.log("  [DRY RUN] Would write %d SIMILAR_TO edges (features)", pairs.length);
        // Show a few examples
        const sample = pairs.slice(0, 5);
        for (const { a, b, score } of sample) {
            console.log("    %.2f  %s [%s] <-> %s [%s]", score, a.name, a.source, b.name, b.source);
        }
        if (pairs.length > 5)
            console.log("    ... and %d more", pairs.length - 5);
    }
    return pairs.length;
}
// ═══════════════════════════════════════════════════════════════════════
// MODEL CROSS-LINKING
// ═══════════════════════════════════════════════════════════════════════
async function linkModels(dryRun) {
    const neo4j = getNeo4jService();
    console.log("\n── Model cross-linking (exact normalized name match) ──");
    const rows = await neo4j.runCypher(`
    MATCH (a:LearnedApp)-[:HAS_DATA_MODEL]->(m:LearnedDataModel)
    RETURN m.name AS name, a.source_id AS source
  `);
    if (rows.length === 0) {
        console.log("  No models found in graph.");
        return 0;
    }
    const models = rows.map((r) => ({
        name: r.name,
        source: r.source,
        normalized: normalizeName(r.name),
    }));
    console.log("  Loaded %d models from %d apps", models.length, new Set(models.map((m) => m.source)).size);
    // Group by normalized name
    const byName = new Map();
    for (const m of models) {
        if (!byName.has(m.normalized))
            byName.set(m.normalized, []);
        byName.get(m.normalized).push(m);
    }
    // Find names that appear in multiple different sources
    const pairs = [];
    for (const [, group] of byName) {
        // Deduplicate by source within the group
        const uniqueSources = new Map();
        for (const m of group) {
            if (!uniqueSources.has(m.source))
                uniqueSources.set(m.source, m);
        }
        const unique = [...uniqueSources.values()];
        if (unique.length < 2)
            continue;
        for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                pairs.push({ a: unique[i], b: unique[j] });
            }
        }
    }
    console.log("  Found %d cross-app model pairs with matching names", pairs.length);
    if (pairs.length > 0 && !dryRun) {
        for (const { a, b } of pairs) {
            await neo4j.runCypher(`
        MATCH (ma:LearnedDataModel {name: $aname})
          WHERE EXISTS { MATCH (:LearnedApp {source_id: $asrc})-[:HAS_DATA_MODEL]->(ma) }
        MATCH (mb:LearnedDataModel {name: $bname})
          WHERE EXISTS { MATCH (:LearnedApp {source_id: $bsrc})-[:HAS_DATA_MODEL]->(mb) }
          AND ma <> mb
        MERGE (ma)-[:SIMILAR_TO {score: 1.0, method: 'exact_name'}]->(mb)
        `, { aname: a.name, asrc: a.source, bname: b.name, bsrc: b.source });
        }
        console.log("  Wrote %d SIMILAR_TO edges (models)", pairs.length);
    }
    else if (dryRun && pairs.length > 0) {
        console.log("  [DRY RUN] Would write %d SIMILAR_TO edges (models)", pairs.length);
        const sample = pairs.slice(0, 5);
        for (const { a, b } of sample) {
            console.log("    %s [%s] <-> %s [%s]", a.name, a.source, b.name, b.source);
        }
        if (pairs.length > 5)
            console.log("    ... and %d more", pairs.length - 5);
    }
    return pairs.length;
}
// ═══════════════════════════════════════════════════════════════════════
// INTEGRATION CROSS-LINKING
// ═══════════════════════════════════════════════════════════════════════
async function linkIntegrations(dryRun) {
    const neo4j = getNeo4jService();
    console.log("\n── Integration cross-linking (same provider across apps) ──");
    const rows = await neo4j.runCypher(`
    MATCH (a:LearnedApp)-[:HAS_INTEGRATION]->(i:LearnedIntegration)
    RETURN i.name AS name, i.provider AS provider, a.source_id AS source
  `);
    if (rows.length === 0) {
        console.log("  No integrations found in graph.");
        return 0;
    }
    const integrations = rows.map((r) => ({
        name: r.name,
        source: r.source,
        provider: r.provider || r.name, // fall back to name if provider is missing
    }));
    console.log("  Loaded %d integrations from %d apps", integrations.length, new Set(integrations.map((i) => i.source)).size);
    // Group by normalized provider
    const byProvider = new Map();
    for (const i of integrations) {
        const key = normalizeName(i.provider);
        if (!byProvider.has(key))
            byProvider.set(key, []);
        byProvider.get(key).push(i);
    }
    // Find providers shared across different sources
    const pairs = [];
    for (const [, group] of byProvider) {
        const uniqueSources = new Map();
        for (const i of group) {
            if (!uniqueSources.has(i.source))
                uniqueSources.set(i.source, i);
        }
        const unique = [...uniqueSources.values()];
        if (unique.length < 2)
            continue;
        for (let i = 0; i < unique.length; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                pairs.push({ a: unique[i], b: unique[j] });
            }
        }
    }
    console.log("  Found %d cross-app integration pairs with matching provider", pairs.length);
    if (pairs.length > 0 && !dryRun) {
        for (const { a, b } of pairs) {
            await neo4j.runCypher(`
        MATCH (ia:LearnedIntegration {name: $aname})
          WHERE EXISTS { MATCH (:LearnedApp {source_id: $asrc})-[:HAS_INTEGRATION]->(ia) }
        MATCH (ib:LearnedIntegration {name: $bname})
          WHERE EXISTS { MATCH (:LearnedApp {source_id: $bsrc})-[:HAS_INTEGRATION]->(ib) }
          AND ia <> ib
        MERGE (ia)-[:SIMILAR_TO {score: 1.0, method: 'same_provider'}]->(ib)
        `, { aname: a.name, asrc: a.source, bname: b.name, bsrc: b.source });
        }
        console.log("  Wrote %d SIMILAR_TO edges (integrations)", pairs.length);
    }
    else if (dryRun && pairs.length > 0) {
        console.log("  [DRY RUN] Would write %d SIMILAR_TO edges (integrations)", pairs.length);
        const sample = pairs.slice(0, 5);
        for (const { a, b } of sample) {
            console.log("    %s [%s] <-> %s [%s]  (provider: %s)", a.name, a.source, b.name, b.source, a.provider);
        }
        if (pairs.length > 5)
            console.log("    ... and %d more", pairs.length - 5);
    }
    return pairs.length;
}
// ═══════════════════════════════════════════════════════════════════════
// EMBEDDING-BASED CROSS-LINKING
// ═══════════════════════════════════════════════════════════════════════
async function linkByEmbeddings(dryRun) {
    const neo4j = getNeo4jService();
    const THRESHOLD = 0.85;
    console.log("\n── Embedding cross-linking (cosine > %s) ──", THRESHOLD);
    // Check if any features have embeddings
    const check = await neo4j.runCypher(`
    MATCH (f:LearnedFeature)
    WHERE f.embedding IS NOT NULL
    RETURN count(f) AS cnt
  `);
    const embeddingCount = check[0]?.cnt?.toNumber?.() ?? check[0]?.cnt ?? 0;
    if (embeddingCount === 0) {
        console.log("  No features with embeddings found. Run index-graph-embeddings first.");
        return 0;
    }
    console.log("  Found %d features with embeddings", embeddingCount);
    if (dryRun) {
        // In dry-run mode, compute similarities but don't write
        const preview = await neo4j.runCypher(`
      MATCH (a:LearnedFeature), (b:LearnedFeature)
      WHERE a.source <> b.source
        AND a.embedding IS NOT NULL
        AND b.embedding IS NOT NULL
        AND id(a) < id(b)
      WITH a, b, gds.similarity.cosine(a.embedding, b.embedding) AS sim
      WHERE sim > $threshold
      RETURN a.name AS aName, a.source AS aSrc, b.name AS bName, b.source AS bSrc, sim
      ORDER BY sim DESC
      LIMIT 100
      `, { threshold: THRESHOLD });
        console.log("  [DRY RUN] Would create %d SIMILAR_TO edges (embedding)", preview.length);
        const sample = preview.slice(0, 5);
        for (const r of sample) {
            console.log("    %.3f  %s [%s] <-> %s [%s]", r.sim, r.aName, r.aSrc, r.bName, r.bSrc);
        }
        if (preview.length > 5)
            console.log("    ... and %d more", preview.length - 5);
        return preview.length;
    }
    // Write mode — use a single Cypher to MERGE all qualifying edges
    const result = await neo4j.runCypher(`
    MATCH (a:LearnedFeature), (b:LearnedFeature)
    WHERE a.source <> b.source
      AND a.embedding IS NOT NULL
      AND b.embedding IS NOT NULL
      AND id(a) < id(b)
    WITH a, b, gds.similarity.cosine(a.embedding, b.embedding) AS sim
    WHERE sim > $threshold
    MERGE (a)-[r:SIMILAR_TO]->(b)
    SET r.score = sim, r.method = 'embedding'
    RETURN count(r) AS cnt
    `, { threshold: THRESHOLD });
    const count = result[0]?.cnt?.toNumber?.() ?? result[0]?.cnt ?? 0;
    console.log("  Wrote %d SIMILAR_TO edges (embedding)", count);
    return count;
}
// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes("--dry-run");
    const useEmbeddings = args.includes("--embedding") || args.includes("--embeddings");
    console.log("╔══════════════════════════════════════════════════════╗");
    console.log("║  AES Knowledge Graph — Cross-Link Tool              ║");
    console.log("╚══════════════════════════════════════════════════════╝");
    if (dryRun)
        console.log("  Mode: DRY RUN (no writes)");
    if (useEmbeddings)
        console.log("  Embedding similarity: ENABLED");
    const neo4j = getNeo4jService();
    const connected = await neo4j.connect();
    if (!connected) {
        console.error("Failed to connect to Neo4j. Exiting.");
        process.exit(1);
    }
    const stats = {
        featureLinks: 0,
        modelLinks: 0,
        integrationLinks: 0,
        embeddingLinks: 0,
    };
    try {
        stats.featureLinks = await linkFeatures(dryRun);
        stats.modelLinks = await linkModels(dryRun);
        stats.integrationLinks = await linkIntegrations(dryRun);
        if (useEmbeddings) {
            stats.embeddingLinks = await linkByEmbeddings(dryRun);
        }
        // ── Summary ──
        const total = stats.featureLinks + stats.modelLinks + stats.integrationLinks + stats.embeddingLinks;
        console.log("\n══════════════════════════════════════════════════════");
        console.log("  SUMMARY %s", dryRun ? "(dry run)" : "");
        console.log("──────────────────────────────────────────────────────");
        console.log("  Feature links (Jaccard):      %d", stats.featureLinks);
        console.log("  Model links (exact name):     %d", stats.modelLinks);
        console.log("  Integration links (provider): %d", stats.integrationLinks);
        if (useEmbeddings) {
            console.log("  Embedding links (cosine):     %d", stats.embeddingLinks);
        }
        console.log("  ─────────────────────────────────────────────");
        console.log("  Total:                         %d", total);
        console.log("══════════════════════════════════════════════════════\n");
    }
    finally {
        await neo4j.close();
    }
}
main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
});
