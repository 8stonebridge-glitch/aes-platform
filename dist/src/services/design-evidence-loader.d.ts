/**
 * design-evidence-loader.ts — Loads and matches design evidence for AES pipeline.
 *
 * Sources (in priority order):
 * 1. Pipeline state (if already loaded, e.g. from API submission)
 * 2. Design evidence JSON files on disk (from Paper MCP extractions)
 * 3. Neo4j graph (if design evidence was persisted there)
 */
import type { DesignEvidence, DesignConstraints } from "../types/design-evidence.js";
/**
 * Load the most recent design evidence JSON from disk.
 * Looks for files matching `design-evidence-*.json` in the platform root.
 */
export declare function loadDesignEvidenceFromDisk(): Promise<DesignEvidence | null>;
/**
 * Extract design constraints for a specific feature by matching feature name
 * against screen names in the design evidence.
 *
 * Matching strategy:
 * - Feature name substring match against screen name (bidirectional)
 * - Feature name keyword match against screen purpose
 * - Falls back to undefined if no screens match
 */
export declare function extractDesignConstraintsForFeature(design: DesignEvidence, featureName: string): DesignConstraints | undefined;
/**
 * Apply design constraints to all features in an appSpec.
 * Mutates the appSpec's design_constraints array and each feature's bridge
 * if design evidence matches.
 */
export declare function applyDesignEvidenceToSpec(appSpec: any, designEvidence: DesignEvidence): {
    constraintsApplied: number;
    featuresMatched: string[];
};
