/**
 * Research Node — external research via Perplexity/Paper integration.
 *
 * Runs after intent classification and before decomposition.
 * Queries external research APIs to enrich the pipeline with:
 *   1. Market/product research for the app class
 *   2. Technical pattern research for the inferred stack
 *   3. UX/UI pattern research for the target user type
 *   4. Integration research for any mentioned third-party services
 *
 * Results are stored in graphContext.learnedResearch and passed to
 * the decomposer for evidence-informed feature planning.
 *
 * Graceful: if research APIs are unavailable, continues with empty results.
 */
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { recordCheckpoint } from "../checkpoints.js";
const RESEARCH_API = process.env.AES_PERPLEXITY_URL || process.env.AES_RESEARCH_URL || "";
const RESEARCH_TIMEOUT_MS = 30_000;
/**
 * Call external research API (Perplexity-compatible).
 */
async function queryResearch(query, category) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);
    try {
        const res = await fetch(`${RESEARCH_API}/research`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                query,
                category,
                max_results: 5,
            }),
            signal: controller.signal,
        });
        if (!res.ok) {
            return null;
        }
        const data = await res.json();
        return {
            findings: data.findings || data.results || [],
            sources: data.sources || data.citations || [],
        };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Alternative: direct Perplexity API call if MCP server unavailable.
 */
async function queryPerplexityDirect(query) {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey)
        return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RESEARCH_TIMEOUT_MS);
    try {
        const res = await fetch("https://api.perplexity.ai/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: "sonar",
                messages: [
                    {
                        role: "system",
                        content: "You are a technical research assistant. Return concise, factual findings about software architecture, patterns, and best practices. Be specific and actionable.",
                    },
                    { role: "user", content: query },
                ],
                max_tokens: 1024,
            }),
            signal: controller.signal,
        });
        if (!res.ok)
            return null;
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        const citations = data.citations || [];
        // Parse findings from response
        const findings = content
            .split("\n")
            .filter((line) => line.trim().length > 10)
            .slice(0, 8);
        return { findings, sources: citations };
    }
    catch {
        return null;
    }
    finally {
        clearTimeout(timeout);
    }
}
/**
 * Generate research queries based on intent brief.
 */
function generateResearchQueries(state) {
    const brief = state.intentBrief;
    const raw = state.rawRequest;
    const queries = [];
    const appClass = brief?.inferred_app_class || "web application";
    const users = brief?.inferred_primary_users?.join(", ") || "users";
    const platforms = brief?.inferred_platforms?.join(", ") || "web";
    // 1. Market research
    queries.push({
        query: `Best practices and common features for building a ${appClass}. What are the must-have features, common user flows, and competitive expectations?`,
        category: "market",
    });
    // 2. Technical patterns
    queries.push({
        query: `Technical architecture patterns for a ${appClass} built with Next.js, TypeScript, and a real-time database. Focus on data modeling, API design, and state management patterns.`,
        category: "technical",
    });
    // 3. UX patterns
    queries.push({
        query: `UX and UI patterns for ${appClass} targeting ${users} on ${platforms}. Focus on navigation patterns, dashboard layouts, form patterns, and status indicators.`,
        category: "ux",
    });
    // 4. Integration research (if integrations were mentioned)
    const integrations = brief?.inferred_integrations || [];
    if (integrations.length > 0) {
        queries.push({
            query: `Integration patterns and best practices for ${integrations.join(", ")} in a ${appClass}. Focus on authentication, error handling, rate limiting, and fallback strategies.`,
            category: "integration",
        });
    }
    // 5. Domain-specific research based on raw request keywords
    const domainKeywords = extractDomainKeywords(raw);
    if (domainKeywords.length > 0) {
        queries.push({
            query: `Software architecture and feature requirements for systems involving ${domainKeywords.join(", ")}. What are the critical data models, workflows, and validation rules?`,
            category: "technical",
        });
    }
    return queries;
}
function extractDomainKeywords(text) {
    const domainTerms = [
        "approval", "workflow", "billing", "payment", "subscription",
        "notification", "messaging", "analytics", "reporting", "dashboard",
        "inventory", "scheduling", "booking", "e-commerce", "marketplace",
        "collaboration", "project management", "CRM", "HR", "accounting",
        "compliance", "audit", "healthcare", "education", "logistics",
    ];
    const lower = text.toLowerCase();
    return domainTerms.filter(term => lower.includes(term.toLowerCase()));
}
/**
 * Research Node — enriches pipeline with external research.
 */
export async function researchNode(state) {
    const cb = getCallbacks();
    const store = getJobStore();
    cb?.onGate("research", "Researching patterns and requirements...");
    store.addLog(state.jobId, {
        gate: "research",
        message: "Starting external research phase",
    });
    const queries = generateResearchQueries(state);
    cb?.onStep(`Generated ${queries.length} research queries`);
    const results = [];
    let successCount = 0;
    let failCount = 0;
    for (const { query, category } of queries) {
        cb?.onStep(`Researching: ${category}...`);
        // Try MCP research API first (if configured), then direct Perplexity, then skip
        let research = null;
        if (RESEARCH_API) {
            research = await queryResearch(query, category);
        }
        if (!research) {
            research = await queryPerplexityDirect(query);
        }
        if (research && research.findings.length > 0) {
            results.push({
                query,
                category,
                findings: research.findings,
                sources: research.sources,
                timestamp: new Date().toISOString(),
            });
            successCount++;
            cb?.onStep(`${category}: ${research.findings.length} findings from ${research.sources.length} sources`);
        }
        else {
            failCount++;
            cb?.onStep(`${category}: no results (API unavailable or empty)`);
        }
    }
    // Organize findings by type for graphContext
    const learnedResearch = results;
    const learnedPatterns = results
        .filter(r => r.category === "technical" || r.category === "ux")
        .flatMap(r => r.findings.map(f => ({ pattern: f, source: r.category, sources: r.sources })));
    const learnedIntegrations = results
        .filter(r => r.category === "integration")
        .flatMap(r => r.findings.map(f => ({ integration: f, sources: r.sources })));
    const summary = `Research complete: ${successCount}/${queries.length} queries returned results, ${results.reduce((s, r) => s + r.findings.length, 0)} total findings`;
    store.addLog(state.jobId, { gate: "research", message: summary });
    await recordCheckpoint({
        job_id: state.jobId,
        gate: "research",
        status: "passed",
        last_successful_gate: "research",
        resume_eligible: true,
        resume_reason: "research_complete",
    });
    if (successCount === 0) {
        cb?.onWarn("Research unavailable — continuing with graph context only");
    }
    else {
        cb?.onSuccess(summary);
    }
    // Merge with existing graph context
    const existingContext = state.graphContext || {
        priorBuilds: [],
        similarFeatures: [],
        knownPatterns: [],
        failureHistory: [],
        reusableBridges: [],
        learnedFeatures: [],
        learnedModels: [],
        learnedIntegrations: [],
        learnedPatterns: [],
        learnedFlows: [],
        learnedResearch: [],
        learnedCorrections: [],
    };
    return {
        graphContext: {
            ...existingContext,
            learnedResearch: [...existingContext.learnedResearch, ...learnedResearch],
            learnedPatterns: [...existingContext.learnedPatterns, ...learnedPatterns],
            learnedIntegrations: [...existingContext.learnedIntegrations, ...learnedIntegrations],
        },
    };
}
