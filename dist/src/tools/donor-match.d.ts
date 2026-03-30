/**
 * Donor Match Engine — auto-matches feature descriptions to donor apps
 * in the Neo4j knowledge graph using multi-signal fusion scoring.
 *
 * Usage:
 *   npx tsx src/tools/donor-match.ts "auth with SSO, MFA, and RBAC"
 *   npx tsx src/tools/donor-match.ts --json '{"name":"auth","description":"SSO with SAML and MFA","required_models":["User","Role"]}'
 *
 * Programmatic:
 *   import { findDonors } from "./donor-match.js";
 *   const matches = await findDonors({ name: "auth", description: "SSO with SAML" });
 */
export interface FeatureQuery {
    name: string;
    description: string;
    required_models?: string[];
    required_integrations?: string[];
    required_patterns?: string[];
    app_class_hint?: string;
}
export interface DonorMatch {
    app_name: string;
    app_class: string;
    overall_score: number;
    feature_score: number;
    model_score: number;
    integration_score: number;
    pattern_score: number;
    matched_features: string[];
    matched_models: string[];
    matched_integrations: string[];
    matched_patterns: string[];
    reuse_suggestions: string[];
}
/**
 * Find the best donor apps from the knowledge graph for a given feature spec.
 *
 * Uses multi-signal fusion:
 *  - Vector similarity on features (0.35)
 *  - Data model coverage (0.25)
 *  - Integration overlap (0.20)
 *  - Pattern match (0.15)
 *  - Class affinity bonus (0.05)
 */
export declare function findDonors(query: FeatureQuery): Promise<DonorMatch[]>;
