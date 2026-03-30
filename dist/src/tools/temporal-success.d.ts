/**
 * temporal-success.ts — Track which graph paths lead to successful builds.
 *
 * Records build outcomes against the reasoning paths that were used,
 * creating a temporal feedback signal. Over time, the graph learns
 * which apps, features, models, integrations, and patterns reliably
 * produce good builds — and which ones correlate with failures.
 *
 * This enables:
 *   - Path success scoring: "this reasoning path succeeded 8/10 times"
 *   - Source reliability: "Cal.com features have 90% build success"
 *   - Pattern effectiveness: "RBAC pattern succeeds more than basic auth"
 *   - Temporal decay: recent outcomes weighted more than old ones
 *
 * Usage:
 *   import { recordBuildOutcome, getPathSuccessScores } from "./temporal-success.js";
 *
 *   // After a build completes:
 *   await recordBuildOutcome(neo4j, {
 *     runId: "run-001",
 *     featureName: "Booking",
 *     succeeded: true,
 *     reasoningPaths: [...paths from unified reasoner],
 *     usedApps: ["Cal.com"],
 *     usedFeatures: ["Bookings", "Slots"],
 *     usedModels: ["Booking", "EventType"],
 *     usedPatterns: ["RBAC"],
 *     usedIntegrations: ["stripe"],
 *   });
 *
 *   // During reasoning — boost paths with good track records:
 *   const scores = await getPathSuccessScores(neo4j, ["Cal.com", "Documenso"]);
 *
 * CLI:
 *   npx tsx src/tools/temporal-success.ts --stats           # show success stats
 *   npx tsx src/tools/temporal-success.ts --leaderboard     # best/worst sources
 */
export interface BuildOutcomeRecord {
    runId: string;
    featureName: string;
    succeeded: boolean;
    /** From unified-graph-reasoner tracedPaths */
    reasoningPaths: string[];
    /** Apps that contributed to the build plan */
    usedApps: string[];
    /** Features referenced in the blueprint */
    usedFeatures: string[];
    /** Models referenced in the blueprint */
    usedModels: string[];
    /** Patterns used */
    usedPatterns: string[];
    /** Integrations used */
    usedIntegrations: string[];
    /** Optional: verification score (0-1) */
    verificationScore?: number;
    /** Optional: fact validation score (0-1) */
    factValidationScore?: number;
}
export interface SuccessScore {
    name: string;
    label: string;
    totalBuilds: number;
    successCount: number;
    failCount: number;
    successRate: number;
    /** Weighted success rate with temporal decay */
    weightedSuccessRate: number;
    /** Average verification score across builds */
    avgVerificationScore: number;
    /** Trend: improving, stable, declining */
    trend: "improving" | "stable" | "declining";
}
export interface SuccessLeaderboard {
    topSources: SuccessScore[];
    bottomSources: SuccessScore[];
    topPatterns: SuccessScore[];
    overallSuccessRate: number;
    totalBuildsTracked: number;
}
/**
 * Record a build outcome in the graph.
 * Creates a BuildOutcome node linked to all graph entities that contributed.
 */
export declare function recordBuildOutcome(neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>, record: BuildOutcomeRecord): Promise<void>;
/**
 * Get success scores for specific apps.
 * Used during reasoning to boost paths through reliable sources.
 */
export declare function getPathSuccessScores(neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>, appNames: string[]): Promise<Map<string, SuccessScore>>;
/**
 * Get success scores for any node type (features, patterns, integrations).
 */
export declare function getNodeSuccessScores(neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>, nodeLabel: string, relType: string): Promise<SuccessScore[]>;
/**
 * Get the full leaderboard — best and worst sources, patterns, etc.
 */
export declare function getLeaderboard(neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<SuccessLeaderboard>;
/**
 * Get a success bonus map for use in the beam search edge scorer.
 * Returns a Map<appName, bonus> where bonus is 0-3 based on success rate.
 *
 * Wire into unified-graph-reasoner.ts scoreEdges():
 *   const successBonus = await getSuccessBonus(neo4jRun);
 *   // In scoreEdges: if target is an app, add successBonus.get(app.name)
 */
export declare function getSuccessBonus(neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<Map<string, number>>;
