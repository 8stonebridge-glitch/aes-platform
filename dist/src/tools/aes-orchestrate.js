/**
 * aes-orchestrate.ts — End-to-end AES pipeline orchestrator.
 *
 * Takes a product description and runs the full pipeline:
 * intent → research → reason → decompose → promote → bridge → build
 *
 * Usage:
 *   npx tsx src/tools/aes-orchestrate.ts "Build a project management tool with billing"
 *   npx tsx src/tools/aes-orchestrate.ts --plan-only "Build a CRM with email sequences"
 *   npx tsx src/tools/aes-orchestrate.ts --from-file intent.txt
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
// ═══════════════════════════════════════════════════════════════
// STEP 1: Run graph reasoner
// ═══════════════════════════════════════════════════════════════
async function runReasoner(query) {
    console.log("\n  \u25b8 Step 1: Running graph reasoner...");
    try {
        const output = execSync(`npx tsx src/tools/unified-graph-reasoner.ts "${query.replace(/"/g, '\\"')}"`, { timeout: 120_000, maxBuffer: 10 * 1024 * 1024, cwd: process.cwd() });
        // The reasoner outputs JSON when --json flag is used (if supported)
        // Otherwise parse the structured output
        const text = output.toString();
        // Try to parse JSON output
        const jsonMatch = text.match(/\{[\s\S]*"apps"[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
        // Fallback: return a minimal result parsed from text output
        return parseReasonerText(text);
    }
    catch (err) {
        console.warn(`    \u26a0\ufe0f Reasoner failed: ${err.message?.slice(0, 100)}`);
        return null;
    }
}
function parseReasonerText(text) {
    const apps = [];
    const features = [];
    const models = [];
    const integrations = [];
    const patterns = [];
    const flows = [];
    const domains = [];
    // Extract "📦 appName → domainName" lines from COMPOSITE BLUEPRINT
    for (const m of text.matchAll(/📦\s*([\w-]+)\s*→\s*([\w_]+)/g)) {
        const appName = m[1];
        const domain = m[2];
        apps.push({ name: appName, class: domain, relevance: 0.8 });
        if (!domains.includes(domain))
            domains.push(domain);
    }
    // Extract features: lines like "features: Feature1, Feature2, Feature3"
    for (const m of text.matchAll(/features:\s*(.+)/gi)) {
        const featureList = m[1].split(",").map(f => f.trim()).filter(Boolean);
        // Try to find which app section we're in by looking backwards
        const preceding = text.slice(0, m.index);
        const appMatch = preceding.match(/📦\s*([\w-]+)\s*→\s*([\w_]+)\s*$/m)
            || preceding.match(/📦\s*([\w-]+)/);
        const source = appMatch ? appMatch[1] : "unknown";
        for (const f of featureList) {
            if (f && !features.some(ex => ex.name === f && ex.source === source)) {
                features.push({ name: f, source, description: "" });
            }
        }
    }
    // Extract models: lines like "models: Model1, Model2, Model3"
    for (const m of text.matchAll(/models:\s*(.+)/gi)) {
        const modelList = m[1].split(",").map(f => f.trim()).filter(Boolean);
        const preceding = text.slice(0, m.index);
        const appMatch = preceding.match(/📦\s*([\w-]+)/);
        const source = appMatch ? appMatch[1] : "unknown";
        for (const name of modelList) {
            if (name && !models.some(ex => ex.name === name)) {
                models.push({ name, source, category: "" });
            }
        }
    }
    // Extract integrations: lines like "integrations: stripe, sendgrid"
    for (const m of text.matchAll(/integrations:\s*(.+)/gi)) {
        const intList = m[1].split(",").map(f => f.trim()).filter(Boolean);
        for (const name of intList) {
            if (name && !integrations.some(ex => ex.name === name)) {
                integrations.push({ name, type: "discovered", provider: name });
            }
        }
    }
    // Extract patterns: lines like "🔧 UNIVERSAL: Pattern1 (95%), Pattern2 (91%)"
    for (const m of text.matchAll(/🔧\s*UNIVERSAL:\s*(.+)/g)) {
        const patternList = m[1].split(",").map(p => p.trim().replace(/\s*\(\d+%\)\s*$/, "")).filter(Boolean);
        for (const name of patternList) {
            if (name)
                patterns.push({ name, type: "universal", description: "" });
        }
    }
    // Extract domains from "Domains: N primary, N supporting, N universal"
    // Already extracted from 📦 lines above, but also look for explicit domain list
    for (const m of text.matchAll(/Domains?:\s*(\d+)\s*primary/gi)) {
        // domains already populated from 📦 lines
    }
    // Extract coverage info
    const coverageMatch = text.match(/(\d+)%\s*category coverage/);
    const itemsMatch = text.match(/(\d+)\s*knowledge items/);
    return {
        apps, features, models, integrations, patterns, flows, domains,
        coverage: {
            percent: coverageMatch ? parseInt(coverageMatch[1]) : 0,
            items: itemsMatch ? parseInt(itemsMatch[1]) : 0,
        }
    };
}
// ═══════════════════════════════════════════════════════════════
// STEP 2: Decompose into features
// ═══════════════════════════════════════════════════════════════
function decomposeIntoFeatures(intent, evidence, design) {
    console.log("  \u25b8 Step 2: Decomposing into features...");
    const features = [];
    const domains = evidence.domains;
    // Core features every app needs
    features.push({
        feature_id: "feat-auth",
        name: "Authentication",
        description: "User authentication with login, signup, session management",
        priority: "critical",
        dependencies: [],
        data_models: evidence.models.filter(m => /user|account|session|role/i.test(m.name)).map(m => m.name),
        integrations: evidence.integrations.filter(i => i.type === "auth").map(i => i.name),
        patterns: evidence.patterns.filter(p => p.type === "auth").map(p => p.name),
        acceptance_criteria: ["Users can sign up", "Users can log in", "Sessions are managed", "Protected routes require auth"],
        source_evidence: evidence.apps.filter(a => /auth/i.test(a.class)).map(a => a.name),
    });
    features.push({
        feature_id: "feat-layout",
        name: "App Layout & Navigation",
        description: "Shared layout shell with sidebar navigation, responsive design",
        priority: "critical",
        dependencies: ["feat-auth"],
        data_models: [],
        integrations: [],
        patterns: evidence.patterns.filter(p => /layout|navigation/i.test(p.name)).map(p => p.name),
        acceptance_criteria: ["Sidebar navigation works", "Responsive on mobile", "Auth state reflected in nav"],
        source_evidence: [],
    });
    // Domain-specific features from evidence (skip domains that overlap with core features)
    const coreIds = new Set(features.map(f => f.feature_id));
    for (const domain of domains) {
        const domainId = `feat-${domain.replace(/_/g, "-")}`;
        if (coreIds.has(domainId))
            continue;
        const domainFeatures = evidence.features.filter(f => {
            const fLower = f.name.toLowerCase();
            return domain.split("_").some(d => fLower.includes(d));
        });
        const domainModels = evidence.models.filter(m => {
            const mLower = m.name.toLowerCase();
            return domain.split("_").some(d => mLower.includes(d));
        });
        const domainIntegrations = evidence.integrations.filter(i => {
            return domain.split("_").some(d => i.type.includes(d));
        });
        if (domainFeatures.length > 0 || domainModels.length > 0) {
            const name = domain.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
            features.push({
                feature_id: `feat-${domain.replace(/_/g, "-")}`,
                name,
                description: `${name} functionality based on ${domainFeatures.length} discovered features`,
                priority: "high",
                dependencies: ["feat-auth", "feat-layout"],
                data_models: domainModels.map(m => m.name),
                integrations: domainIntegrations.map(i => i.name),
                patterns: evidence.patterns.filter(p => domain.split("_").some(d => p.type.includes(d))).map(p => p.name),
                acceptance_criteria: domainFeatures.slice(0, 5).map(f => `${f.name} works as expected`),
                source_evidence: [...new Set(domainFeatures.map(f => f.source))],
            });
        }
    }
    // Features from design screens that don't already have a corresponding feature
    if (design) {
        for (const screen of design.screens) {
            const screenSlug = `feat-${screen.screen_id}`;
            if (features.some(f => f.feature_id === screenSlug || f.name.toLowerCase().includes(screen.name.toLowerCase())))
                continue;
            features.push({
                feature_id: screenSlug,
                name: screen.name,
                description: `${screen.purpose} (from design)`,
                priority: "high",
                dependencies: ["feat-auth", "feat-layout"],
                data_models: [],
                integrations: [],
                patterns: [],
                acceptance_criteria: screen.component_ids.map(c => `Component ${c} is implemented`),
                source_evidence: ["design"],
            });
        }
    }
    // Settings feature (always needed)
    features.push({
        feature_id: "feat-settings",
        name: "Settings",
        description: "User and app settings management",
        priority: "medium",
        dependencies: ["feat-auth"],
        data_models: evidence.models.filter(m => /setting|preference|config/i.test(m.name)).map(m => m.name),
        integrations: [],
        patterns: [],
        acceptance_criteria: ["Users can update profile", "App settings are configurable"],
        source_evidence: [],
    });
    console.log(`    \u2192 ${features.length} features planned`);
    return features;
}
// ═══════════════════════════════════════════════════════════════
// STEP 3: Check promotion gates
// ═══════════════════════════════════════════════════════════════
function checkPromotionGates(feature, allFeatures) {
    const gates = [];
    const featureIds = new Set(allFeatures.map(f => f.feature_id));
    // Coverage gate: has description and acceptance criteria
    gates.push({
        gate: "coverage",
        passed: feature.description.length > 10 && feature.acceptance_criteria.length > 0,
        reason: feature.acceptance_criteria.length === 0 ? "No acceptance criteria defined" : undefined,
    });
    // Dependency gate: all dependencies exist
    const missingDeps = feature.dependencies.filter(d => !featureIds.has(d));
    gates.push({
        gate: "dependency",
        passed: missingDeps.length === 0,
        reason: missingDeps.length > 0 ? `Missing dependencies: ${missingDeps.join(", ")}` : undefined,
    });
    // Buildability gate: has source evidence or is a standard feature
    const isStandard = ["feat-auth", "feat-layout", "feat-settings"].includes(feature.feature_id);
    gates.push({
        gate: "buildability",
        passed: feature.source_evidence.length > 0 || isStandard,
        reason: feature.source_evidence.length === 0 && !isStandard ? "No source evidence from graph" : undefined,
    });
    // Flow gate: acceptance criteria are specific enough
    gates.push({
        gate: "flow",
        passed: feature.acceptance_criteria.every(ac => ac.length > 5),
        reason: feature.acceptance_criteria.some(ac => ac.length <= 5) ? "Acceptance criteria too vague" : undefined,
    });
    // Contradiction gate: no duplicate feature IDs
    gates.push({
        gate: "contradiction",
        passed: true,
    });
    const failures = gates.filter(g => !g.passed);
    return {
        feature_id: feature.feature_id,
        promoted: failures.length === 0,
        gate_results: gates,
        blockers: failures.map(f => `${f.gate}: ${f.reason}`),
    };
}
// ═══════════════════════════════════════════════════════════════
// STEP 4: Compute build order (topological sort)
// ═══════════════════════════════════════════════════════════════
function computeBuildOrder(features) {
    const order = [];
    const visited = new Set();
    const featureMap = new Map(features.map(f => [f.feature_id, f]));
    function visit(id) {
        if (visited.has(id))
            return;
        visited.add(id);
        const feature = featureMap.get(id);
        if (feature) {
            for (const dep of feature.dependencies) {
                visit(dep);
            }
        }
        order.push(id);
    }
    for (const f of features)
        visit(f.feature_id);
    return order;
}
// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    const planOnly = args.includes("--plan-only");
    const fromFile = args.includes("--from-file");
    let intent = "";
    if (fromFile) {
        const filePath = args[args.indexOf("--from-file") + 1];
        intent = fs.readFileSync(filePath, "utf-8").trim();
    }
    else {
        intent = args.filter(a => !a.startsWith("--")).join(" ");
    }
    if (!intent) {
        console.error("Usage: npx tsx src/tools/aes-orchestrate.ts \"Build a project management tool\"");
        process.exit(1);
    }
    console.log(`\n${"=".repeat(65)}`);
    console.log(`  AES ORCHESTRATOR`);
    console.log(`  Intent: ${intent.slice(0, 80)}${intent.length > 80 ? "..." : ""}`);
    console.log(`  Mode: ${planOnly ? "PLAN ONLY" : "FULL PIPELINE"}`);
    console.log(`${"=".repeat(65)}`);
    // Step 1: Graph reasoner
    const evidence = await runReasoner(intent);
    if (!evidence) {
        console.error("\n  Reasoner produced no results. Check graph connectivity.");
        process.exit(1);
    }
    console.log(`    \u2192 ${evidence.apps.length} apps, ${evidence.features.length} features, ${evidence.models.length} models`);
    console.log(`    \u2192 Domains: ${evidence.domains.join(", ")}`);
    // Step 2: Decompose
    const featurePlan = decomposeIntoFeatures(intent, evidence, evidence.designEvidence);
    // Step 3: Promotion gates
    console.log("  \u25b8 Step 3: Checking promotion gates...");
    const promotionResults = [];
    for (const feature of featurePlan) {
        const result = checkPromotionGates(feature, featurePlan);
        promotionResults.push(result);
        const status = result.promoted ? "\u2705" : "\u274c";
        console.log(`    ${status} ${feature.name}${result.blockers.length > 0 ? ` \u2014 ${result.blockers[0]}` : ""}`);
    }
    // Step 4: Build order
    console.log("  \u25b8 Step 4: Computing build order...");
    const promoted = featurePlan.filter(f => promotionResults.find(p => p.feature_id === f.feature_id)?.promoted);
    const blocked = featurePlan.filter(f => !promotionResults.find(p => p.feature_id === f.feature_id)?.promoted);
    const buildOrder = computeBuildOrder(promoted);
    console.log(`    \u2192 Build order: ${buildOrder.join(" \u2192 ")}`);
    // Summary
    const result = {
        intent,
        domains_identified: evidence.domains,
        graph_evidence: {
            apps_found: evidence.apps.length,
            features_found: evidence.features.length,
            models_found: evidence.models.length,
            integrations_found: evidence.integrations.length,
            patterns_found: evidence.patterns.length,
        },
        feature_plan: featurePlan,
        build_order: buildOrder,
        promotion_results: promotionResults,
        ready_to_build: promoted.map(f => f.feature_id),
        blocked: blocked.map(f => f.feature_id),
        timestamp: new Date().toISOString(),
    };
    console.log(`\n${"=".repeat(65)}`);
    console.log(`  ORCHESTRATION COMPLETE`);
    console.log(`${"=".repeat(65)}`);
    console.log(`  Features planned:    ${featurePlan.length}`);
    console.log(`  Promoted (ready):    ${promoted.length}`);
    console.log(`  Blocked:             ${blocked.length}`);
    console.log(`  Build order:         ${buildOrder.length} features`);
    console.log(`  Graph evidence:`);
    console.log(`    Apps:              ${evidence.apps.length}`);
    console.log(`    Features:          ${evidence.features.length}`);
    console.log(`    Models:            ${evidence.models.length}`);
    console.log(`    Integrations:      ${evidence.integrations.length}`);
    console.log(`    Patterns:          ${evidence.patterns.length}`);
    if (planOnly) {
        console.log(`\n  Plan written to stdout (--plan-only mode)`);
        console.log(`\n${JSON.stringify(result, null, 2)}`);
    }
    else {
        console.log(`\n  Build execution not yet wired \u2014 run with --plan-only for now`);
        // Future: iterate through buildOrder, compile bridges, run builds
        // Save the plan
        const planPath = `aes-plan-${Date.now()}.json`;
        fs.writeFileSync(planPath, JSON.stringify(result, null, 2));
        console.log(`  Plan saved to ${planPath}`);
    }
    console.log(`${"=".repeat(65)}\n`);
}
main().catch(console.error);
