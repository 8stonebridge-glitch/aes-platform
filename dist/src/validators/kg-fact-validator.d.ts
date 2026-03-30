/**
 * KG Fact Validator — Validates builder output claims against the knowledge graph.
 *
 * From the KG+LLM research paper: extract factual triples from builder output,
 * cross-reference each one against the graph, flag anything contradicted or unverifiable.
 *
 * Plugs into the build-verifier pipeline as a post-build check.
 *
 * How it works:
 *   1. Extract claims from builder output (feature names, model names, integrations,
 *      patterns, flows, auth methods, data relationships)
 *   2. For each claim, query the knowledge graph for supporting evidence
 *   3. Score each claim as VERIFIED / UNVERIFIED / CONTRADICTED
 *   4. Return a verdict with per-claim evidence trails
 *
 * Usage standalone:
 *   npx tsx src/validators/kg-fact-validator.ts
 *
 * Usage in pipeline:
 *   import { validateFacts } from "./kg-fact-validator.js";
 *   const result = await validateFacts(claims, neo4jService);
 */
export interface FactClaim {
    /** What the builder asserts: "User model has email field" */
    claim: string;
    /** Structured triple: subject, predicate, object */
    subject: string;
    predicate: string;
    object: string;
    /** Where in the builder output this claim appears */
    source: string;
    /** Category for grouping: model, feature, integration, pattern, flow, auth, data */
    category: "model" | "feature" | "integration" | "pattern" | "flow" | "auth" | "data" | "api";
}
export interface FactVerdict {
    claim: FactClaim;
    status: "VERIFIED" | "UNVERIFIED" | "CONTRADICTED";
    confidence: number;
    evidence: string[];
    graphHits: number;
}
export interface KGFactValidatorResult {
    verdict: "PASS" | "PASS_WITH_CONCERNS" | "FAIL";
    score: number;
    total_claims: number;
    verified: number;
    unverified: number;
    contradicted: number;
    verdicts: FactVerdict[];
    summary: string;
}
/**
 * Extract factual claims from builder output.
 * This works on the structured AppSpec / FeatureSpec / BuilderPackage output.
 */
export declare function extractClaims(builderOutput: {
    features?: {
        name: string;
        description?: string;
        data_models?: string[];
        integrations?: string[];
        patterns?: string[];
    }[];
    models?: {
        name: string;
        fields?: string[];
        category?: string;
        relationships?: string[];
    }[];
    integrations?: {
        name: string;
        type?: string;
        provider?: string;
        auth_method?: string;
    }[];
    patterns?: {
        name: string;
        type?: string;
    }[];
    flows?: {
        name: string;
        steps?: string[];
    }[];
    auth?: {
        method?: string;
        provider?: string;
        roles?: string[];
    };
}): FactClaim[];
/**
 * Extract claims from raw text (code comments, spec prose, etc.)
 * Uses pattern matching to find factual assertions.
 */
export declare function extractClaimsFromText(text: string, source: string): FactClaim[];
interface Neo4jQueryable {
    runCypher(cypher: string): Promise<any[]>;
}
/**
 * Validate a set of factual claims against the knowledge graph.
 * This is the main entry point for the pipeline.
 */
export declare function validateFacts(claims: FactClaim[], neo4j: Neo4jQueryable): Promise<KGFactValidatorResult>;
export {};
