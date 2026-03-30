/**
 * seed-catalog-to-graph.ts — Reads all catalog YAMLs (packages, patterns, templates)
 * and creates CatalogEntry nodes + relationships in Neo4j.
 *
 * Usage:
 *   npx tsx src/tools/seed-catalog-to-graph.ts
 *   npx tsx src/tools/seed-catalog-to-graph.ts --dry-run
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { getNeo4jService } from "../services/neo4j-service.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MONOREPO_ROOT = join(__dirname, "..", "..");
const CATALOG_DIRS = [
    { dir: join(MONOREPO_ROOT, "catalog", "packages"), category: "package" },
    { dir: join(MONOREPO_ROOT, "catalog", "patterns"), category: "pattern" },
    { dir: join(MONOREPO_ROOT, "catalog", "templates"), category: "template" },
];
function loadAllYamls() {
    const results = [];
    for (const { dir, category } of CATALOG_DIRS) {
        if (!existsSync(dir)) {
            console.warn(`  ⚠ Directory not found: ${dir}`);
            continue;
        }
        const files = readdirSync(dir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
        for (const f of files) {
            try {
                const content = readFileSync(join(dir, f), "utf-8");
                const parsed = parseYaml(content);
                results.push({ entry: parsed, category, file: f });
            }
            catch (err) {
                console.warn(`  ⚠ Failed to parse ${f}: ${err.message}`);
            }
        }
    }
    return results;
}
function esc(s) {
    return (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, " ");
}
async function main() {
    const dryRun = process.argv.includes("--dry-run");
    const entries = loadAllYamls();
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  AES CATALOG → NEO4J SEEDER`);
    console.log(`  Entries: ${entries.length}`);
    console.log(`  Mode: ${dryRun ? "DRY RUN" : "WRITE"}`);
    console.log(`${"═".repeat(65)}\n`);
    if (entries.length === 0) {
        console.log("  No catalog entries found. Check catalog/ directory.");
        return;
    }
    // Print summary
    const byCategory = new Map();
    for (const e of entries) {
        byCategory.set(e.category, (byCategory.get(e.category) || 0) + 1);
    }
    for (const [cat, count] of byCategory) {
        console.log(`  ${cat}: ${count} entries`);
    }
    console.log();
    if (dryRun) {
        for (const { entry, category } of entries) {
            console.log(`  [${category}] ${entry.id} — ${entry.name} (${entry.type}) [${entry.promotion_tier}]`);
            console.log(`    repo: ${entry.repo} | path: ${entry.package_path} | tags: ${(entry.tags || []).join(", ")}`);
        }
        console.log(`\nRun without --dry-run to write to Neo4j.`);
        return;
    }
    // Connect to Neo4j
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (!ok) {
        console.error("  ✗ Cannot connect to Neo4j. Set AES_NEO4J_URL, AES_NEO4J_USER, AES_NEO4J_PASSWORD.");
        process.exit(1);
    }
    let written = 0;
    let failed = 0;
    // Create constraint if not exists
    try {
        await neo4j.runCypher(`CREATE CONSTRAINT catalog_entry_id IF NOT EXISTS FOR (c:CatalogEntry) REQUIRE c.id IS UNIQUE`);
        console.log("  ✓ Constraint ensured: CatalogEntry.id unique\n");
    }
    catch {
        // Constraint may already exist
    }
    for (const { entry, category } of entries) {
        const tagsStr = (entry.tags || []).map((t) => `'${esc(t)}'`).join(", ");
        const depsStr = (entry.dependencies || []).map((d) => `'${esc(d)}'`).join(", ");
        const constraintsStr = (entry.usage_constraints || []).map((c) => `'${esc(c)}'`).join(", ");
        const cypher = `
MERGE (c:CatalogEntry {id: '${esc(entry.id)}'})
SET c.name = '${esc(entry.name)}',
    c.description = '${esc(entry.description)}',
    c.type = '${esc(entry.type)}',
    c.category = '${esc(category)}',
    c.repo = '${esc(entry.repo)}',
    c.package_path = '${esc(entry.package_path)}',
    c.branch_or_tag = '${esc(entry.branch_or_tag || "main")}',
    c.owning_team = '${esc(entry.owning_team || "aes-core")}',
    c.promotion_tier = '${esc(entry.promotion_tier || "DERIVED")}',
    c.tags = [${tagsStr}],
    c.dependencies = [${depsStr}],
    c.usage_constraints = [${constraintsStr}],
    c.last_validation_date = '${esc(entry.last_validation_date || "")}',
    c.seeded_at = datetime(),
    c.source = 'catalog-yaml'
`;
        try {
            await neo4j.runCypher(cypher);
            console.log(`  ✓ ${entry.id} (${category}/${entry.type})`);
            written++;
        }
        catch (err) {
            console.warn(`  ✗ ${entry.id}: ${err.message}`);
            failed++;
        }
    }
    // Create relationships between catalog entries and their dependencies
    console.log("\n  Linking dependencies...");
    let links = 0;
    for (const { entry } of entries) {
        for (const dep of entry.dependencies || []) {
            try {
                await neo4j.runCypher(`
MATCH (a:CatalogEntry {id: '${esc(entry.id)}'})
MATCH (b:CatalogEntry {id: '${esc(dep)}'})
MERGE (a)-[:DEPENDS_ON]->(b)
`);
                links++;
            }
            catch {
                // Dependency may not exist as a catalog entry
            }
        }
    }
    // Link catalog entries to existing Stack nodes if they reference known tech
    console.log("  Linking to Stack nodes...");
    const techMappings = {
        "auth-module": ["clerk", "next"],
        "auth-role-guard": ["clerk"],
        "auth-org-switcher": ["clerk"],
        "payment-adapter-stripe": ["stripe"],
        "payment-adapter-paystack": ["paystack"],
        "notification-service": ["novu", "resend"],
        "sidebar-layout": ["react", "tailwindcss"],
        "dashboard-shell": ["react", "next"],
        "ui-button": ["react", "tailwindcss"],
        "ui-card": ["react", "tailwindcss"],
        "ui-badge": ["react", "tailwindcss"],
        "ui-dialog": ["react", "tailwindcss"],
        "ui-input": ["react", "tailwindcss"],
        "ui-table": ["react", "tailwindcss"],
        "ui-tabs": ["react", "tailwindcss"],
        "ui-toast": ["react", "tailwindcss"],
        "audit-trail-module": ["convex"],
        "approval-workflow": ["convex"],
        "status-workflow": ["convex"],
        "data-table-page": ["react", "tailwindcss"],
        "form-page": ["react", "tailwindcss"],
        "detail-page": ["react", "tailwindcss"],
        "settings-page": ["react", "tailwindcss"],
        "file-upload-zone": ["react"],
        "inbox-pattern": ["react", "convex"],
    };
    let stackLinks = 0;
    for (const [entryId, stacks] of Object.entries(techMappings)) {
        for (const stackName of stacks) {
            try {
                const result = await neo4j.runCypher(`
MATCH (c:CatalogEntry {id: '${esc(entryId)}'})
MATCH (s:Stack) WHERE toLower(s.name) = '${esc(stackName)}'
MERGE (c)-[:USES_STACK]->(s)
RETURN count(*) as cnt
`);
                if (result.length > 0)
                    stackLinks++;
            }
            catch {
                // Stack may not exist
            }
        }
    }
    // Link catalog entries to existing FeatureDomain nodes
    console.log("  Linking to FeatureDomain nodes...");
    const domainMappings = {
        "auth-module": ["auth-session-security"],
        "auth-role-guard": ["auth-session-security", "role-permissions"],
        "auth-org-switcher": ["auth-session-security", "organization-management"],
        "approval-workflow": ["approval-workflow"],
        "status-workflow": ["approval-workflow"],
        "audit-trail-module": ["audit-compliance"],
        "notification-service": ["notifications-alerts"],
        "payment-adapter-stripe": ["payments-billing"],
        "payment-adapter-paystack": ["payments-billing"],
        "dashboard-shell": ["dashboards-analytics"],
        "sidebar-layout": ["navigation-layout"],
        "inbox-pattern": ["notifications-alerts"],
        "file-upload-zone": ["file-management"],
    };
    let domainLinks = 0;
    for (const [entryId, domains] of Object.entries(domainMappings)) {
        for (const domainName of domains) {
            try {
                const result = await neo4j.runCypher(`
MATCH (c:CatalogEntry {id: '${esc(entryId)}'})
MATCH (d:FeatureDomain) WHERE toLower(d.name) = '${esc(domainName)}'
MERGE (c)-[:BELONGS_TO_DOMAIN]->(d)
RETURN count(*) as cnt
`);
                if (result.length > 0)
                    domainLinks++;
            }
            catch {
                // Domain may not exist
            }
        }
    }
    // Link catalog entries to existing UIPattern nodes
    console.log("  Linking to UIPattern nodes...");
    const uiPatternMappings = {
        "sidebar-layout": ["appshell layout"],
        "dashboard-shell": ["appshell layout"],
        "inbox-pattern": ["inbox triage queue"],
        "auth-org-switcher": ["organization switcher"],
        "data-table-page": ["data table"],
        "form-page": ["form page"],
        "approval-workflow": ["approval workflow"],
    };
    let uiLinks = 0;
    for (const [entryId, patterns] of Object.entries(uiPatternMappings)) {
        for (const patternName of patterns) {
            try {
                const result = await neo4j.runCypher(`
MATCH (c:CatalogEntry {id: '${esc(entryId)}'})
MATCH (p:UIPattern) WHERE toLower(p.name) = '${esc(patternName)}'
MERGE (c)-[:IMPLEMENTS_PATTERN]->(p)
RETURN count(*) as cnt
`);
                if (result.length > 0)
                    uiLinks++;
            }
            catch {
                // Pattern may not exist
            }
        }
    }
    await neo4j.close();
    console.log(`\n${"═".repeat(65)}`);
    console.log(`  DONE`);
    console.log(`  CatalogEntry nodes: ${written} written, ${failed} failed`);
    console.log(`  Dependency links: ${links}`);
    console.log(`  Stack links: ${stackLinks}`);
    console.log(`  Domain links: ${domainLinks}`);
    console.log(`  UIPattern links: ${uiLinks}`);
    console.log(`${"═".repeat(65)}\n`);
}
main().catch(console.error);
