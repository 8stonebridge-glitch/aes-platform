/**
 * post-build-extract.ts — Extract knowledge from builder output back into the graph.
 *
 * After every successful build, this tool analyzes the BuilderRunRecord
 * and writes discovered patterns, models, integrations, and features
 * back into the Neo4j knowledge graph as BuildExtracted* nodes.
 *
 * This creates a feedback loop: the graph grows with every build,
 * compounding the system's knowledge over time.
 *
 * Usage:
 *   Called automatically after build verification passes.
 *   Can also be run standalone:
 *     npx tsx src/tools/post-build-extract.ts <run-record.json>
 */
import type { BuilderRunRecord } from "../types/artifacts.js";
export interface ExtractedKnowledge {
    extractionId: string;
    runId: string;
    featureName: string;
    extractedAt: string;
    /** Tech signals found in created files */
    techSignals: TechSignal[];
    /** Data models inferred from file names and paths */
    inferredModels: InferredModel[];
    /** Integration signals from file names */
    inferredIntegrations: InferredIntegration[];
    /** Patterns detected from file structure */
    detectedPatterns: DetectedPattern[];
    /** Build outcome metadata */
    buildOutcome: BuildOutcome;
}
interface TechSignal {
    name: string;
    category: "framework" | "database" | "styling" | "testing" | "api" | "auth" | "state" | "other";
    evidence: string;
}
interface InferredModel {
    name: string;
    source: string;
    category: string;
}
interface InferredIntegration {
    name: string;
    type: string;
    evidence: string;
}
interface DetectedPattern {
    name: string;
    type: string;
    evidence: string;
}
interface BuildOutcome {
    status: string;
    filesCreated: number;
    filesModified: number;
    testsRun: number;
    testsPassed: number;
    checksPassed: string[];
    checksFailed: string[];
    durationMs: number;
    builderModel: string;
}
/**
 * Extract knowledge from a BuilderRunRecord.
 */
export declare function extractKnowledge(run: BuilderRunRecord): ExtractedKnowledge;
/**
 * Write extracted knowledge to Neo4j as BuildExtracted* nodes.
 * Links back to the source build run for full lineage.
 */
export declare function writeExtractionToGraph(extraction: ExtractedKnowledge, neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<{
    nodesCreated: number;
    relsCreated: number;
}>;
export {};
