/**
 * Migrate all nodes and relationships from local Neo4j to Neo4j Aura.
 * Usage: npx tsx src/tools/migrate-to-aura.ts
 */
import neo4j from "neo4j-driver";
const LOCAL_URL = "bolt://localhost:17687";
const LOCAL_USER = "neo4j";
const LOCAL_PASS = "aes_dev_password";
const AURA_URL = process.env.AES_NEO4J_AURA_URL || "neo4j+s://27cc044e.databases.neo4j.io";
const AURA_USER = process.env.AES_NEO4J_AURA_USER || "neo4j";
const AURA_PASS = process.env.AES_NEO4J_AURA_PASS || "iGamVa9tHFdwbhwXTn-M47YGecXic2ppCkcFSmjdlr0";
const BATCH_SIZE = 200;
async function migrate() {
    const local = neo4j.driver(LOCAL_URL, neo4j.auth.basic(LOCAL_USER, LOCAL_PASS));
    const aura = neo4j.driver(AURA_URL, neo4j.auth.basic(AURA_USER, AURA_PASS));
    try {
        // Verify connections
        const localSession = local.session();
        const localCount = await localSession.run("MATCH (n) RETURN count(n) as c");
        console.log(`Local: ${localCount.records[0].get("c").toNumber()} nodes`);
        await localSession.close();
        const auraSession = aura.session();
        const auraCount = await auraSession.run("MATCH (n) RETURN count(n) as c");
        console.log(`Aura: ${auraCount.records[0].get("c").toNumber()} nodes (before)`);
        await auraSession.close();
        // Step 1: Export all nodes with labels and properties
        console.log("\n--- Exporting nodes ---");
        const readSession = local.session();
        const nodesResult = await readSession.run("MATCH (n) RETURN id(n) as id, labels(n) as labels, properties(n) as props");
        const nodes = nodesResult.records.map((r) => ({
            id: r.get("id").toNumber(),
            labels: r.get("labels"),
            props: r.get("props"),
        }));
        await readSession.close();
        console.log(`Read ${nodes.length} nodes`);
        // Step 2: Create nodes in Aura in batches
        console.log("\n--- Creating nodes in Aura ---");
        // Clear Aura first
        const clearSession = aura.session();
        await clearSession.run("MATCH (n) DETACH DELETE n");
        await clearSession.close();
        console.log("Cleared Aura");
        // Group nodes by label combination for efficient MERGE
        const labelGroups = new Map();
        for (const node of nodes) {
            const key = node.labels.sort().join(":");
            if (!labelGroups.has(key))
                labelGroups.set(key, []);
            labelGroups.get(key).push(node);
        }
        // We need a way to reference nodes across local/aura. Use a temporary _migrationId prop.
        for (const [labelKey, group] of labelGroups) {
            const labels = labelKey;
            console.log(`  Creating ${group.length} nodes with labels :${labels}`);
            for (let i = 0; i < group.length; i += BATCH_SIZE) {
                const batch = group.slice(i, i + BATCH_SIZE);
                const writeSession = aura.session();
                await writeSession.run(`UNWIND $batch AS item
           CALL {
             WITH item
             CREATE (n:${labels})
             SET n = item.props, n._migrationId = item.id
           } IN TRANSACTIONS OF ${BATCH_SIZE} ROWS`, {
                    batch: batch.map((b) => ({ id: neo4j.int(b.id), props: b.props })),
                }).catch(async () => {
                    // Fallback for older Neo4j versions without CALL IN TRANSACTIONS
                    for (const b of batch) {
                        await writeSession.run(`CREATE (n:${labels}) SET n = $props, n._migrationId = $id`, { props: b.props, id: neo4j.int(b.id) });
                    }
                });
                await writeSession.close();
                process.stdout.write(`    ${Math.min(i + BATCH_SIZE, group.length)}/${group.length}\r`);
            }
            console.log();
        }
        // Step 3: Export and create relationships
        console.log("\n--- Exporting relationships ---");
        const relSession = local.session();
        const relsResult = await relSession.run(`MATCH (a)-[r]->(b)
       RETURN id(a) as fromId, id(b) as toId, type(r) as relType, properties(r) as props`);
        const rels = relsResult.records.map((r) => ({
            fromId: r.get("fromId").toNumber(),
            toId: r.get("toId").toNumber(),
            relType: r.get("relType"),
            props: r.get("props"),
        }));
        await relSession.close();
        console.log(`Read ${rels.length} relationships`);
        // Group by relationship type
        const relGroups = new Map();
        for (const rel of rels) {
            if (!relGroups.has(rel.relType))
                relGroups.set(rel.relType, []);
            relGroups.get(rel.relType).push(rel);
        }
        console.log("\n--- Creating relationships in Aura ---");
        for (const [relType, group] of relGroups) {
            console.log(`  Creating ${group.length} [:${relType}] relationships`);
            for (let i = 0; i < group.length; i += BATCH_SIZE) {
                const batch = group.slice(i, i + BATCH_SIZE);
                const writeSession = aura.session();
                for (const rel of batch) {
                    await writeSession.run(`MATCH (a {_migrationId: $fromId}), (b {_migrationId: $toId})
             CREATE (a)-[r:${relType}]->(b)
             SET r = $props`, {
                        fromId: neo4j.int(rel.fromId),
                        toId: neo4j.int(rel.toId),
                        props: rel.props,
                    });
                }
                await writeSession.close();
                process.stdout.write(`    ${Math.min(i + BATCH_SIZE, group.length)}/${group.length}\r`);
            }
            console.log();
        }
        // Step 4: Remove migration IDs
        console.log("\n--- Cleaning up migration IDs ---");
        const cleanSession = aura.session();
        await cleanSession.run("MATCH (n) REMOVE n._migrationId");
        await cleanSession.close();
        // Step 5: Create indexes (same as local)
        console.log("\n--- Creating indexes ---");
        const indexSession = local.session();
        const indexResult = await indexSession.run("SHOW INDEXES");
        const indexes = indexResult.records.map((r) => ({
            name: r.get("name"),
            type: r.get("type"),
            labelsOrTypes: r.get("labelsOrTypes"),
            properties: r.get("properties"),
        }));
        await indexSession.close();
        const auraIndexSession = aura.session();
        for (const idx of indexes) {
            if (idx.type === "LOOKUP")
                continue; // built-in
            if (idx.type === "RANGE" && idx.labelsOrTypes?.length && idx.properties?.length) {
                const label = idx.labelsOrTypes[0];
                const prop = idx.properties[0];
                try {
                    await auraIndexSession.run(`CREATE INDEX IF NOT EXISTS FOR (n:${label}) ON (n.${prop})`);
                    console.log(`  Created index on :${label}(${prop})`);
                }
                catch (e) {
                    console.log(`  Skipped index :${label}(${prop}): ${e.message}`);
                }
            }
        }
        await auraIndexSession.close();
        // Final count
        const finalSession = aura.session();
        const finalNodes = await finalSession.run("MATCH (n) RETURN count(n) as c");
        const finalRels = await finalSession.run("MATCH ()-[r]->() RETURN count(r) as c");
        console.log(`\nAura: ${finalNodes.records[0].get("c").toNumber()} nodes, ${finalRels.records[0].get("c").toNumber()} relationships`);
        await finalSession.close();
        console.log("\nMigration complete.");
    }
    finally {
        await local.close();
        await aura.close();
    }
}
migrate().catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
});
