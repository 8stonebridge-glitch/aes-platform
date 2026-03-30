/**
 * autoresearch-loop.ts — Autonomous self-improvement loop for the graph reasoner.
 *
 * Inspired by Karpathy's autoresearch: propose → run → measure → keep/discard.
 *
 * The loop:
 *   1. Load current tunable parameters
 *   2. Propose a mutation (random tweak to one or more params)
 *   3. Run the benchmark suite with the mutated params
 *   4. Compute a composite score
 *   5. If score improved → keep the mutation, commit to git
 *   6. If score worsened → discard, revert
 *   7. Repeat
 *
 * Usage:
 *   npx tsx src/tools/autoresearch-loop.ts                    # run 1 iteration
 *   npx tsx src/tools/autoresearch-loop.ts --loops 50         # run 50 iterations
 *   npx tsx src/tools/autoresearch-loop.ts --loops 100 --tag mar26   # overnight run
 *   npx tsx src/tools/autoresearch-loop.ts --benchmark        # just run benchmark, no mutation
 *   npx tsx src/tools/autoresearch-loop.ts --show-params      # show current params
 */
import { getNeo4jService } from "../services/neo4j-service.js";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
export const DEFAULT_PARAMS = {
    beamWidth: 6,
    maxHops: 5,
    hungerFeatures: 8,
    hungerModels: 5,
    hungerIntegrations: 4,
    hungerPatterns: 4,
    hungerFlows: 3,
    hungerApps: 3,
    hungerBonusFeature: 3,
    hungerBonusModel: 3,
    hungerBonusIntegration: 4,
    hungerBonusPattern: 3,
    hungerBonusFlow: 5,
    hungerBonusApp: 5,
    keywordMatchBonus: 2,
    modelStructuralBonus: 1,
    patternStructuralBonus: 1,
    flowStructuralBonus: 1,
    complexityBonus: 1,
    sameCategoryPenalty: 2,
    vectorBoostMultiplier: 4,
    synonymCoOccurrenceMin: 2,
    synonymMinLength: 3,
    synonymMaxPerKeyword: 12,
    rrfK: 60,
    dualSourceBoost: 1.5,
    maxSeeds: 14,
    maxAppSeeds: 8,
    universalPatternPercent: 0.4,
};
const PARAMS_FILE = "src/tools/reasoner-params.json";
function loadParams() {
    if (existsSync(PARAMS_FILE)) {
        const raw = JSON.parse(readFileSync(PARAMS_FILE, "utf-8"));
        return { ...DEFAULT_PARAMS, ...raw };
    }
    return { ...DEFAULT_PARAMS };
}
function saveParams(params) {
    writeFileSync(PARAMS_FILE, JSON.stringify(params, null, 2) + "\n");
}
const BENCHMARK_SUITE = [
    {
        id: "B01-barber-booking",
        query: "barber shop appointment booking app",
        expectedApps: ["Cal.com"],
        expectedFeatures: ["booking", "slot", "availability", "schedule"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B02-invoice-signing",
        query: "AI-powered invoice management with document signing",
        expectedApps: ["Documenso"],
        expectedFeatures: ["document", "signing", "template", "invoice"],
        minDomains: 3,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B03-project-management",
        query: "project management tool with kanban boards and sprints",
        expectedApps: ["Plane"],
        expectedFeatures: ["project", "issue", "cycle", "board"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B04-multi-domain",
        query: "SaaS platform with scheduling, payments, chat, and document management",
        expectedApps: [], // multiple apps expected, don't require specific ones
        expectedFeatures: ["booking", "payment", "chat", "document"],
        minDomains: 4,
        minCoverage: 80,
        weight: 1.5, // harder case, worth more
    },
    {
        id: "B05-crm",
        query: "customer relationship management with lead tracking and sales pipeline",
        expectedApps: [],
        expectedFeatures: ["contact", "lead", "deal", "pipeline"],
        minDomains: 2,
        minCoverage: 70,
        weight: 1.0,
    },
    {
        id: "B06-secrets",
        query: "secrets management vault with encryption and access control",
        expectedApps: ["Infisical"],
        expectedFeatures: ["secret", "vault", "encrypt"],
        minDomains: 2,
        minCoverage: 70,
        weight: 0.8,
    },
    {
        id: "B07-api-tool",
        query: "API development and testing tool like Postman",
        expectedApps: ["Hoppscotch"],
        expectedFeatures: ["request", "collection", "environment"],
        minDomains: 2,
        minCoverage: 70,
        weight: 0.8,
    },
    {
        id: "B08-chat-platform",
        query: "real-time team chat platform with channels and threads",
        expectedApps: ["Rocket.Chat"],
        expectedFeatures: ["channel", "message", "thread"],
        minDomains: 2,
        minCoverage: 70,
        weight: 1.0,
    },
    {
        id: "B09-minimal",
        query: "simple to-do list app",
        expectedApps: [],
        expectedFeatures: ["task"],
        minDomains: 1,
        minCoverage: 50,
        weight: 0.5, // easy case
    },
    {
        id: "B10-complex-multi",
        query: "healthcare clinic management with appointment scheduling, patient records, billing, and prescription tracking",
        expectedApps: [],
        expectedFeatures: ["appointment", "booking", "billing", "patient"],
        minDomains: 4,
        minCoverage: 70,
        weight: 1.5, // hardest case
    },
    // ── B11–B30: Expanded benchmark suite ──────────────────────────────
    // Multi-domain queries
    {
        id: "B11-saas-billing-teams",
        query: "SaaS with billing, team management, and analytics dashboard",
        expectedApps: ["Midday", "Umami"],
        expectedFeatures: ["billing", "team", "analytics", "dashboard", "subscription"],
        minDomains: 3,
        minCoverage: 70,
        weight: 1.5,
    },
    {
        id: "B12-marketplace-platform",
        query: "multi-vendor marketplace with product catalog, checkout, and seller dashboard",
        expectedApps: ["Medusa"],
        expectedFeatures: ["product", "cart", "checkout", "vendor", "order"],
        minDomains: 3,
        minCoverage: 70,
        weight: 1.5,
    },
    {
        id: "B13-devops-pipeline",
        query: "developer platform with CI/CD pipelines, notifications, and workflow automation",
        expectedApps: ["Trigger.dev", "Novu", "n8n"],
        expectedFeatures: ["workflow", "trigger", "notification", "pipeline"],
        minDomains: 3,
        minCoverage: 70,
        weight: 1.5,
    },
    {
        id: "B14-community-platform",
        query: "community platform with forums, chat, surveys, and user analytics",
        expectedApps: ["Rocket.Chat", "Formbricks", "Umami"],
        expectedFeatures: ["chat", "survey", "analytics", "user"],
        minDomains: 4,
        minCoverage: 70,
        weight: 1.5,
    },
    // Single-domain deep dives
    {
        id: "B15-auth-deep",
        query: "Build a complete auth system with SSO, MFA, RBAC, and social login",
        expectedApps: ["Logto"],
        expectedFeatures: ["auth", "sso", "mfa", "role", "permission", "login"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B16-ecommerce-deep",
        query: "full-featured ecommerce backend with inventory, shipping, promotions, and multi-currency support",
        expectedApps: ["Medusa"],
        expectedFeatures: ["product", "inventory", "shipping", "promotion", "currency", "order"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B17-notification-deep",
        query: "multi-channel notification system with email, SMS, push, in-app, and digest support",
        expectedApps: ["Novu"],
        expectedFeatures: ["notification", "email", "sms", "push", "digest", "channel"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    {
        id: "B18-workflow-deep",
        query: "visual workflow automation engine with triggers, conditions, and third-party integrations",
        expectedApps: ["n8n", "Trigger.dev"],
        expectedFeatures: ["workflow", "trigger", "node", "integration", "automation"],
        minDomains: 2,
        minCoverage: 80,
        weight: 1.0,
    },
    // Queries where the answer isn't obvious
    {
        id: "B19-dev-tool-api",
        query: "Build a developer tool for API testing",
        expectedApps: ["Hoppscotch"],
        expectedFeatures: ["request", "collection", "api", "environment"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    {
        id: "B20-ai-assistant",
        query: "AI-powered assistant with chat interface and plugin system",
        expectedApps: ["LobeChat"],
        expectedFeatures: ["chat", "message", "plugin", "model"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    {
        id: "B21-freelancer-tools",
        query: "freelancer toolkit with time tracking, invoicing, and expense management",
        expectedApps: ["Midday"],
        expectedFeatures: ["time", "invoice", "expense", "track"],
        minDomains: 3,
        minCoverage: 60,
        weight: 1.0,
    },
    // Edge cases
    {
        id: "B22-secrets-vault",
        query: "Build a secrets management vault with rotation and audit logging",
        expectedApps: ["Infisical"],
        expectedFeatures: ["secret", "vault", "rotation", "audit", "encrypt"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    {
        id: "B23-doc-signing",
        query: "digital document signing platform with templates and audit trail",
        expectedApps: ["Documenso"],
        expectedFeatures: ["document", "signing", "template", "audit"],
        minDomains: 2,
        minCoverage: 70,
        weight: 0.8,
    },
    {
        id: "B24-survey-feedback",
        query: "customer feedback and survey platform with analytics",
        expectedApps: ["Formbricks"],
        expectedFeatures: ["survey", "feedback", "response", "analytics"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    // Domain-specific tests for apps in the graph
    {
        id: "B25-crm-full",
        query: "CRM with contact management, sales pipeline, email integration, and team collaboration",
        expectedApps: ["Twenty"],
        expectedFeatures: ["contact", "pipeline", "deal", "email", "team"],
        minDomains: 3,
        minCoverage: 70,
        weight: 1.0,
    },
    {
        id: "B26-scheduling-platform",
        query: "scheduling and calendar platform with availability management and booking pages",
        expectedApps: ["Cal.com"],
        expectedFeatures: ["booking", "calendar", "availability", "schedule", "event"],
        minDomains: 2,
        minCoverage: 70,
        weight: 1.0,
    },
    {
        id: "B27-email-marketing",
        query: "email marketing platform with campaigns, subscriber lists, and delivery tracking",
        expectedApps: ["Plunk"],
        expectedFeatures: ["email", "campaign", "subscriber", "delivery"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    {
        id: "B28-web-analytics",
        query: "privacy-focused web analytics with page views, events, and visitor tracking",
        expectedApps: ["Umami"],
        expectedFeatures: ["analytics", "event", "page", "visitor", "track"],
        minDomains: 2,
        minCoverage: 60,
        weight: 0.8,
    },
    // Negative tests / specific feature requests
    {
        id: "B29-webhook-only",
        query: "I need just a webhook delivery system with retries and logging",
        expectedApps: [],
        expectedFeatures: ["webhook", "delivery", "retry"],
        minDomains: 1,
        minCoverage: 50,
        weight: 0.5,
    },
    {
        id: "B30-chat-video",
        query: "Build a real-time chat with video calling and screen sharing",
        expectedApps: ["Rocket.Chat", "LobeChat"],
        expectedFeatures: ["chat", "message", "video", "call"],
        minDomains: 2,
        minCoverage: 60,
        weight: 1.0,
    },
];
/**
 * Run the unified reasoner with given params and return structured output.
 * This calls the reasoner as a subprocess with params injected via env var.
 */
async function runReasoner(query, params) {
    try {
        const result = execSync(`npx tsx src/tools/reasoner-bench-runner.ts ${JSON.stringify(query)}`, {
            env: {
                ...process.env,
                AES_REASONER_PARAMS: JSON.stringify(params),
            },
            timeout: 120_000, // 2 min max per query
            maxBuffer: 10 * 1024 * 1024,
            cwd: process.cwd(),
        });
        return JSON.parse(result.toString().trim());
    }
    catch (err) {
        console.warn(`    ⚠️  Reasoner failed for "${query.slice(0, 40)}...": ${err.message?.slice(0, 100)}`);
        return null;
    }
}
function scoreCase(bench, output) {
    // App score: fraction of expected apps found (case-insensitive substring match)
    let appHits = 0;
    if (bench.expectedApps.length > 0) {
        for (const expected of bench.expectedApps) {
            const found = output.discoveredApps.some(a => a.toLowerCase().includes(expected.toLowerCase()));
            if (found)
                appHits++;
        }
    }
    const appScore = bench.expectedApps.length > 0
        ? appHits / bench.expectedApps.length
        : (output.discoveredApps.length > 0 ? 1 : 0);
    // Feature score: fuzzy match expected features against discovered features + models
    const allDiscovered = [
        ...output.discoveredFeatures,
        ...output.discoveredModels,
    ].map(s => s.toLowerCase());
    let featureHits = 0;
    for (const expected of bench.expectedFeatures) {
        const found = allDiscovered.some(d => d.includes(expected.toLowerCase()));
        if (found)
            featureHits++;
    }
    const featureScore = bench.expectedFeatures.length > 0
        ? featureHits / bench.expectedFeatures.length
        : 1;
    // Coverage score
    const coverageScore = Math.min(1, output.coveragePercent / bench.minCoverage);
    // Domain score
    const domainScore = Math.min(1, output.domainCount / bench.minDomains);
    // Diversity: how many of the 6 categories have at least 1 item
    const categories = [
        output.discoveredApps, output.discoveredFeatures, output.discoveredModels,
        output.discoveredIntegrations, output.discoveredPatterns, output.discoveredFlows,
    ];
    const nonEmpty = categories.filter(c => c.length > 0).length;
    const diversityScore = nonEmpty / 6;
    // Efficiency: ratio of useful discoveries to total hops
    const totalItems = categories.reduce((sum, c) => sum + c.length, 0);
    const efficiencyScore = output.hopCount > 0
        ? Math.min(1, totalItems / (output.hopCount * 3)) // expect ~3 useful items per hop
        : 0;
    // Composite: weighted average
    const composite = 0.25 * appScore +
        0.25 * featureScore +
        0.20 * coverageScore +
        0.10 * domainScore +
        0.10 * diversityScore +
        0.10 * efficiencyScore;
    return {
        caseId: bench.id,
        appScore,
        featureScore,
        coverageScore,
        domainScore,
        diversityScore,
        efficiencyScore,
        composite,
    };
}
function computeTotalScore(caseScores, benchmarks) {
    let weightedSum = 0;
    let totalWeight = 0;
    for (let i = 0; i < caseScores.length; i++) {
        weightedSum += caseScores[i].composite * benchmarks[i].weight;
        totalWeight += benchmarks[i].weight;
    }
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
}
const PARAM_RANGES = {
    beamWidth: { min: 3, max: 12, step: 1 },
    maxHops: { min: 3, max: 8, step: 1 },
    hungerFeatures: { min: 3, max: 15, step: 1 },
    hungerModels: { min: 2, max: 10, step: 1 },
    hungerIntegrations: { min: 2, max: 8, step: 1 },
    hungerPatterns: { min: 2, max: 8, step: 1 },
    hungerFlows: { min: 1, max: 6, step: 1 },
    hungerApps: { min: 2, max: 6, step: 1 },
    hungerBonusFeature: { min: 1, max: 8, step: 1 },
    hungerBonusModel: { min: 1, max: 8, step: 1 },
    hungerBonusIntegration: { min: 1, max: 8, step: 1 },
    hungerBonusPattern: { min: 1, max: 8, step: 1 },
    hungerBonusFlow: { min: 1, max: 8, step: 1 },
    hungerBonusApp: { min: 1, max: 8, step: 1 },
    keywordMatchBonus: { min: 1, max: 5, step: 1 },
    modelStructuralBonus: { min: 0, max: 3, step: 1 },
    patternStructuralBonus: { min: 0, max: 3, step: 1 },
    flowStructuralBonus: { min: 0, max: 3, step: 1 },
    complexityBonus: { min: 0, max: 3, step: 1 },
    sameCategoryPenalty: { min: 0, max: 5, step: 1 },
    vectorBoostMultiplier: { min: 1, max: 8, step: 1 },
    synonymCoOccurrenceMin: { min: 1, max: 4, step: 1 },
    synonymMinLength: { min: 2, max: 5, step: 1 },
    synonymMaxPerKeyword: { min: 5, max: 20, step: 1 },
    rrfK: { min: 20, max: 100, step: 10 },
    dualSourceBoost: { min: 1.0, max: 3.0, step: 0.25 },
    maxSeeds: { min: 8, max: 20, step: 2 },
    maxAppSeeds: { min: 4, max: 12, step: 1 },
    universalPatternPercent: { min: 0.2, max: 0.7, step: 0.05 },
};
function mutateParams(params, mutationCount = 2) {
    const newParams = { ...params };
    const mutations = [];
    const keys = Object.keys(PARAM_RANGES);
    // Pick 1-3 random params to mutate
    const count = Math.min(mutationCount, keys.length);
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    const toMutate = shuffled.slice(0, count);
    for (const key of toMutate) {
        const range = PARAM_RANGES[key];
        const oldVal = params[key];
        // Random direction: up or down by 1-2 steps
        const steps = Math.random() > 0.5 ? 1 : 2;
        const direction = Math.random() > 0.5 ? 1 : -1;
        let newVal = oldVal + direction * steps * range.step;
        // Clamp to range
        newVal = Math.max(range.min, Math.min(range.max, newVal));
        // Round to step precision
        newVal = Math.round(newVal / range.step) * range.step;
        if (newVal !== oldVal) {
            newParams[key] = newVal;
            mutations.push(`${key}: ${oldVal} → ${newVal}`);
        }
    }
    return { params: newParams, mutations };
}
const LOG_FILE = "src/tools/autoresearch-log.jsonl";
function appendLog(entry) {
    const { appendFileSync } = require("node:fs");
    appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
}
// ═══════════════════════════════════════════════════════════════════════
// MAIN LOOP
// ═══════════════════════════════════════════════════════════════════════
async function runBenchmark(params) {
    const caseScores = [];
    for (const bench of BENCHMARK_SUITE) {
        const output = await runReasoner(bench.query, params);
        if (output) {
            caseScores.push(scoreCase(bench, output));
        }
        else {
            // Failed run gets 0
            caseScores.push({
                caseId: bench.id,
                appScore: 0, featureScore: 0, coverageScore: 0,
                domainScore: 0, diversityScore: 0, efficiencyScore: 0,
                composite: 0,
            });
        }
    }
    return {
        totalScore: computeTotalScore(caseScores, BENCHMARK_SUITE),
        caseScores,
    };
}
async function main() {
    const args = process.argv.slice(2);
    const loopCount = args.includes("--loops")
        ? parseInt(args[args.indexOf("--loops") + 1]) || 1
        : 1;
    const benchmarkOnly = args.includes("--benchmark");
    const showParams = args.includes("--show-params");
    const tag = args.includes("--tag")
        ? args[args.indexOf("--tag") + 1]
        : new Date().toISOString().slice(0, 10);
    const params = loadParams();
    if (showParams) {
        console.log("\nCurrent reasoner params:");
        console.log(JSON.stringify(params, null, 2));
        return;
    }
    // Connect to Neo4j (needed by reasoner subprocess)
    const neo4j = getNeo4jService();
    await neo4j.connect();
    await neo4j.close(); // just verify connectivity
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  AES AUTORESEARCH LOOP`);
    console.log(`  Tag: ${tag}`);
    console.log(`  Benchmark: ${BENCHMARK_SUITE.length} cases`);
    console.log(`  Mode: ${benchmarkOnly ? "BENCHMARK ONLY" : `${loopCount} iteration(s)`}`);
    console.log(`${"═".repeat(70)}\n`);
    // ── Baseline run ──
    console.log("  ▸ Running baseline benchmark...");
    const baselineStart = Date.now();
    const baseline = await runBenchmark(params);
    const baselineDuration = Date.now() - baselineStart;
    console.log(`\n  BASELINE SCORE: ${(baseline.totalScore * 100).toFixed(2)}%`);
    console.log(`  Duration: ${(baselineDuration / 1000).toFixed(1)}s\n`);
    for (const cs of baseline.caseScores) {
        const icon = cs.composite >= 0.8 ? "🟢" : cs.composite >= 0.5 ? "🟡" : "🔴";
        console.log(`    ${icon} ${cs.caseId}: ${(cs.composite * 100).toFixed(1)}% (app:${(cs.appScore * 100).toFixed(0)} feat:${(cs.featureScore * 100).toFixed(0)} cov:${(cs.coverageScore * 100).toFixed(0)} dom:${(cs.domainScore * 100).toFixed(0)} div:${(cs.diversityScore * 100).toFixed(0)} eff:${(cs.efficiencyScore * 100).toFixed(0)})`);
    }
    if (benchmarkOnly) {
        console.log(`\n${"═".repeat(70)}\n`);
        return;
    }
    // ── Improvement loop ──
    let bestScore = baseline.totalScore;
    let bestParams = { ...params };
    let accepted = 0;
    let rejected = 0;
    for (let i = 1; i <= loopCount; i++) {
        console.log(`\n${"─".repeat(70)}`);
        console.log(`  ITERATION ${i}/${loopCount} | Best: ${(bestScore * 100).toFixed(2)}% | Accepted: ${accepted} | Rejected: ${rejected}`);
        // Propose mutation
        const mutation = mutateParams(bestParams, Math.random() > 0.7 ? 3 : 2);
        if (mutation.mutations.length === 0) {
            console.log("    (no mutation produced, skipping)");
            continue;
        }
        console.log(`    Mutations: ${mutation.mutations.join(", ")}`);
        // Run benchmark with mutated params
        const start = Date.now();
        const result = await runBenchmark(mutation.params);
        const duration = Date.now() - start;
        const improved = result.totalScore > bestScore;
        const delta = result.totalScore - bestScore;
        if (improved) {
            // ACCEPT — keep the mutation
            bestScore = result.totalScore;
            bestParams = mutation.params;
            saveParams(bestParams);
            accepted++;
            console.log(`    ✅ ACCEPTED: ${(result.totalScore * 100).toFixed(2)}% (+${(delta * 100).toFixed(2)}%) in ${(duration / 1000).toFixed(1)}s`);
        }
        else {
            // REJECT — discard
            rejected++;
            console.log(`    ❌ REJECTED: ${(result.totalScore * 100).toFixed(2)}% (${(delta * 100).toFixed(2)}%) in ${(duration / 1000).toFixed(1)}s`);
        }
        // Log
        appendLog({
            iteration: i,
            timestamp: new Date().toISOString(),
            score: result.totalScore,
            prevScore: bestScore - (improved ? delta : 0),
            accepted: improved,
            mutations: mutation.mutations,
            caseScores: result.caseScores.map(cs => ({ id: cs.caseId, score: cs.composite })),
            durationMs: duration,
        });
    }
    // ── Final summary ──
    const totalDelta = bestScore - baseline.totalScore;
    console.log(`\n${"═".repeat(70)}`);
    console.log(`  AUTORESEARCH COMPLETE`);
    console.log(`  Tag: ${tag}`);
    console.log(`  Iterations: ${loopCount}`);
    console.log(`  Accepted: ${accepted} | Rejected: ${rejected}`);
    console.log(`  Baseline: ${(baseline.totalScore * 100).toFixed(2)}%`);
    console.log(`  Final:    ${(bestScore * 100).toFixed(2)}% (${totalDelta >= 0 ? "+" : ""}${(totalDelta * 100).toFixed(2)}%)`);
    if (accepted > 0) {
        console.log(`\n  Best params saved to: ${PARAMS_FILE}`);
        console.log(`  Changed from defaults:`);
        for (const key of Object.keys(DEFAULT_PARAMS)) {
            if (bestParams[key] !== DEFAULT_PARAMS[key]) {
                console.log(`    ${key}: ${DEFAULT_PARAMS[key]} → ${bestParams[key]}`);
            }
        }
    }
    console.log(`  Log: ${LOG_FILE}`);
    console.log(`${"═".repeat(70)}\n`);
}
main().catch(console.error);
