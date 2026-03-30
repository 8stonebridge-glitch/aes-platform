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
export {};
