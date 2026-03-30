import { getNeo4jService } from "../services/neo4j-service.js";
async function main() {
    const neo4j = getNeo4jService();
    await neo4j.connect();
    const fixes = [
        ["twenty", "crm_platform"],
        ["plane", "project_management"],
        ["plunk", "email_marketing_platform"],
        ["timelish", "scheduling_platform"],
        ["triggerdotdev", "background_jobs_platform"],
        ["lobechat", "ai_chat_platform"],
    ];
    for (const [name, cls] of fixes) {
        await neo4j.runCypher("MATCH (a:LearnedApp {name: $name}) SET a.app_class = $cls RETURN a.name", { name, cls });
        console.log(`  ✅ ${name} → ${cls}`);
    }
    await neo4j.close();
}
main().catch(console.error);
