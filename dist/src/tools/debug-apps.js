import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    // Raw count of ALL nodes
    const allNodes = await neo4j.runCypher(`MATCH (n) RETURN count(n) AS total`);
    console.log("Total nodes in DB:", allNodes);
    // Check which labels exist
    const labels = await neo4j.runCypher(`CALL db.labels() YIELD label RETURN label ORDER BY label`);
    console.log("\nLabels:", labels.map((r) => r.label).join(", "));
    // Direct check
    const apps = await neo4j.runCypher(`MATCH (n:LearnedApp) RETURN count(n) AS cnt`);
    console.log("\nLearnedApp count:", apps);
    const features = await neo4j.runCypher(`MATCH (n:LearnedFeature) RETURN count(n) AS cnt`);
    console.log("LearnedFeature count:", features);
    const rules = await neo4j.runCypher(`MATCH (n:AESReasoningRule) RETURN count(n) AS cnt`);
    console.log("AESReasoningRule count:", rules);
    const evos = await neo4j.runCypher(`MATCH (n:AESEvolution) RETURN count(n) AS cnt`);
    console.log("AESEvolution count:", evos);
    await neo4j.close();
}
main().catch(console.error);
