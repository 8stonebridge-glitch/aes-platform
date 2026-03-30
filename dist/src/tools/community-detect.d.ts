/**
 * community-detect.ts — Auto-discover domain communities from the knowledge graph.
 *
 * Replaces the hardcoded DOMAIN_RULES in unified-graph-reasoner.ts with
 * communities discovered from actual graph structure.
 *
 * Approach: Feature co-occurrence community detection.
 * Two features belong to the same community if they co-occur in the same app
 * more often than expected by chance. We build a co-occurrence matrix,
 * then use a label propagation algorithm to find natural clusters.
 *
 * This is cheaper than Neo4j GDS (no plugin required) and works with
 * the existing graph structure.
 *
 * Usage:
 *   npx tsx src/tools/community-detect.ts                    # discover and display
 *   npx tsx src/tools/community-detect.ts --write            # write communities to graph
 *   npx tsx src/tools/community-detect.ts --export           # export as DOMAIN_RULES replacement
 */
export interface Community {
    id: string;
    /** Auto-generated label from the most representative terms */
    label: string;
    /** Member apps */
    apps: string[];
    /** Core feature terms that define this community */
    coreTerms: string[];
    /** Model categories common in this community */
    modelCategories: string[];
    /** Integration types common in this community */
    integrationTypes: string[];
    /** How many apps belong to this community */
    size: number;
    /** Cohesion score: avg internal edge weight / avg external edge weight */
    cohesion: number;
}
export interface CommunityDetectionResult {
    communities: Community[];
    totalApps: number;
    totalFeatures: number;
    modularity: number;
    /** Ready-to-use domain rules matching the format of DOMAIN_RULES */
    domainRules: DomainRule[];
}
export interface DomainRule {
    domain: string;
    triggers: string[];
    desc: string;
    keywords: string[];
}
export declare function detectCommunities(): Promise<CommunityDetectionResult>;
