/**
 * research-and-backfill.ts — Use Perplexity to research any app domain,
 * then write findings directly into the knowledge graph as real Learned* nodes.
 *
 * This closes the gap: the scanner learns from code, Perplexity learns from
 * the market. Both write to the same graph so the pipeline can use everything.
 *
 * Usage:
 *   npx tsx src/tools/research-and-backfill.ts "barber shop appointment booking"
 *   npx tsx src/tools/research-and-backfill.ts "freelancer invoicing platform"
 *   npx tsx src/tools/research-and-backfill.ts "AI chatbot builder"
 */
interface ResearchResult {
    app_description: string;
    app_class: string;
    reference_apps: string[];
    features: {
        name: string;
        description: string;
        complexity: "simple" | "moderate" | "complex";
    }[];
    data_models: {
        name: string;
        category: string;
        fields: string;
    }[];
    integrations: {
        name: string;
        type: string;
        provider: string;
        auth_method: string;
    }[];
    auth_patterns: {
        name: string;
        description: string;
    }[];
    tech_stack: {
        name: string;
        role: string;
    }[];
    user_flows: {
        name: string;
        steps: string;
    }[];
    ui_patterns: {
        name: string;
        description: string;
    }[];
}
/**
 * Build the research prompt for Perplexity.
 * We ask for structured JSON so we can parse and write to Neo4j.
 */
declare function buildResearchPrompt(appDescription: string): string;
/**
 * Parse the research response into structured data.
 * Handles various Perplexity response formats.
 */
declare function parseResearchResponse(raw: string): ResearchResult | null;
/**
 * Write research findings into Neo4j as real Learned* nodes.
 * Creates a LearnedApp node with source "perplexity-research" and
 * links all features, models, integrations, etc.
 */
declare function writeToGraph(research: ResearchResult): Promise<{
    features: number;
    models: number;
    integrations: number;
    patterns: number;
    flows: number;
    uiPatterns: number;
    authPatterns: number;
    techStack: number;
}>;
declare function verifyBackfill(appId: string): Promise<void>;
export { buildResearchPrompt, parseResearchResponse, writeToGraph, verifyBackfill, type ResearchResult, };
