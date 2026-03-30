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
import { getNeo4jService } from "../services/neo4j-service.js";
import { embedBatch, isEmbeddingAvailable, getEmbeddingDimensions, featureText, modelText, integrationText, patternText, flowText, } from "../services/embedding-service.js";
async function main() {
    if (!isEmbeddingAvailable()) {
        console.error("No OpenAI API key found. Set OPENAI_API_KEY or AES_OPENAI_API_KEY.");
        process.exit(1);
    }
    const force = process.argv.includes("--force");
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const dims = getEmbeddingDimensions();
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  AES Graph Embedding Indexer`);
    console.log(`  Model: text-embedding-3-small (${dims} dims)`);
    console.log(`  Mode: ${force ? "FORCE re-embed all" : "skip already-embedded nodes"}`);
    console.log(`${"═".repeat(65)}\n`);
    // ── Step 1: Create vector indexes if they don't exist ──
    console.log("  ▸ Creating vector indexes...");
    const indexDefs = [
        { label: "LearnedFeature", property: "embedding", name: "feature_embedding_idx" },
        { label: "LearnedDataModel", property: "embedding", name: "model_embedding_idx" },
        { label: "LearnedIntegration", property: "embedding", name: "integration_embedding_idx" },
        { label: "LearnedPattern", property: "embedding", name: "pattern_embedding_idx" },
        { label: "LearnedUserFlow", property: "embedding", name: "flow_embedding_idx" },
    ];
    for (const idx of indexDefs) {
        try {
            await neo4j.runCypher(`
        CREATE VECTOR INDEX ${idx.name} IF NOT EXISTS
        FOR (n:${idx.label})
        ON (n.${idx.property})
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${dims},
          \`vector.similarity_function\`: 'cosine'
        }}
      `);
            console.log(`    ✅ ${idx.name}`);
        }
        catch (err) {
            if (err.message?.includes("already exists")) {
                console.log(`    ✓  ${idx.name} (exists)`);
            }
            else {
                console.warn(`    ⚠️  ${idx.name}: ${err.message}`);
            }
        }
    }
    // ── Step 2: Embed each node type ──
    const stats = { total: 0, embedded: 0, skipped: 0, failed: 0 };
    // Features
    await embedNodeType(neo4j, {
        label: "LearnedFeature",
        idField: "feature_id",
        queryAll: `MATCH (a:LearnedApp)-[:HAS_FEATURE]->(f:LearnedFeature) ${force ? "" : "WHERE f.embedding IS NULL"} RETURN f.feature_id AS id, f.name AS name, f.description AS description, f.complexity AS complexity, f.has_api AS has_api, f.has_tests AS has_tests, f.directory AS directory, a.name AS app_name, a.app_class AS app_class`,
        textFn: (r) => featureText({ name: r.name, description: r.description, complexity: r.complexity, has_api: r.has_api, has_tests: r.has_tests, directory: r.directory, app_name: r.app_name, app_class: r.app_class }),
        setQuery: (id) => `MATCH (f:LearnedFeature {feature_id: $id}) SET f.embedding = $embedding`,
        stats,
    });
    // Models
    await embedNodeType(neo4j, {
        label: "LearnedDataModel",
        idField: "name",
        queryAll: `MATCH (a:LearnedApp)-[:HAS_MODEL]->(m:LearnedDataModel) ${force ? "" : "WHERE m.embedding IS NULL"} RETURN m.name AS id, m.name AS name, m.category AS category, m.fields_csv AS fields_csv, a.name AS app_name, a.app_class AS app_class, size([(m)-[:RELATES_TO]->() | 1]) AS relation_count`,
        textFn: (r) => modelText({ name: r.name, category: r.category, fields_csv: r.fields_csv, app_name: r.app_name, app_class: r.app_class, relation_count: typeof r.relation_count === "number" ? r.relation_count : undefined }),
        setQuery: (id) => `MATCH (m:LearnedDataModel {name: $id}) SET m.embedding = $embedding`,
        stats,
    });
    // Integrations
    await embedNodeType(neo4j, {
        label: "LearnedIntegration",
        idField: "name",
        queryAll: `MATCH (a:LearnedApp)-[:USES_INTEGRATION]->(i:LearnedIntegration) ${force ? "" : "WHERE i.embedding IS NULL"} RETURN DISTINCT i.name AS id, i.name AS name, i.type AS type, i.provider AS provider, a.name AS app_name, i.auth_method AS auth_method`,
        textFn: (r) => integrationText({ name: r.name, type: r.type, provider: r.provider, app_name: r.app_name, auth_method: r.auth_method }),
        setQuery: (id) => `MATCH (i:LearnedIntegration {name: $id}) SET i.embedding = $embedding`,
        stats,
    });
    // Patterns
    await embedNodeType(neo4j, {
        label: "LearnedPattern",
        idField: "name",
        queryAll: `MATCH (a:LearnedApp)-[:USES_PATTERN]->(p:LearnedPattern) ${force ? "" : "WHERE p.embedding IS NULL"} RETURN DISTINCT p.name AS id, p.name AS name, p.type AS type, p.description AS description, a.name AS app_name, p.applicable_to AS applicable_to`,
        textFn: (r) => patternText({ name: r.name, type: r.type, description: r.description, app_name: r.app_name, applicable_to: r.applicable_to }),
        setQuery: (id) => `MATCH (p:LearnedPattern {name: $id}) SET p.embedding = $embedding`,
        stats,
    });
    // Flows
    await embedNodeType(neo4j, {
        label: "LearnedUserFlow",
        idField: "name",
        queryAll: `MATCH (a:LearnedApp)-[:HAS_FLOW]->(f:LearnedUserFlow) ${force ? "" : "WHERE f.embedding IS NULL"} RETURN f.name AS id, f.name AS name, f.steps_description AS steps_description, a.name AS app_name, f.section AS section, f.step_count AS step_count`,
        textFn: (r) => flowText({ name: r.name, steps_description: r.steps_description, app_name: r.app_name, section: r.section, step_count: typeof r.step_count === "number" ? r.step_count : undefined }),
        setQuery: (id) => `MATCH (f:LearnedUserFlow {name: $id}) SET f.embedding = $embedding`,
        stats,
    });
    // ── Summary ──
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  DONE: ${stats.embedded} embedded, ${stats.skipped} skipped, ${stats.failed} failed (${stats.total} total)`);
    console.log(`${"═".repeat(65)}\n`);
    await neo4j.close();
}
async function embedNodeType(neo4j, opts) {
    const rows = await neo4j.runCypher(opts.queryAll);
    if (rows.length === 0) {
        console.log(`\n  ▸ ${opts.label}: 0 nodes to embed (all have embeddings)`);
        return;
    }
    console.log(`\n  ▸ ${opts.label}: ${rows.length} nodes to embed`);
    opts.stats.total += rows.length;
    // Build text representations
    const texts = rows.map(r => opts.textFn(r));
    const ids = rows.map(r => r.id);
    // Batch embed
    const embeddings = await embedBatch(texts);
    // Store in Neo4j
    let embedded = 0;
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
        const emb = embeddings[i];
        if (!emb) {
            failed++;
            continue;
        }
        try {
            await neo4j.runCypher(opts.setQuery(ids[i]), { id: ids[i], embedding: emb });
            embedded++;
        }
        catch (err) {
            console.warn(`    ⚠️  Failed to store embedding for ${ids[i]}: ${err.message}`);
            failed++;
        }
        // Progress indicator
        if ((i + 1) % 100 === 0 || i === rows.length - 1) {
            process.stdout.write(`    ${embedded}/${rows.length} embedded\r`);
        }
    }
    console.log(`    ✅ ${embedded} embedded, ${failed} failed`);
    opts.stats.embedded += embedded;
    opts.stats.failed += failed;
}
main().catch(console.error);
