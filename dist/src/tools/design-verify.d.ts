/**
 * design-verify.ts — Post-build validator that checks built output against
 * design evidence and bridge design constraints.
 *
 * Takes a DesignEvidence artifact (or DesignConstraints from a bridge) and a
 * built project directory, then verifies that every design obligation was met.
 *
 * Usage:
 *   npx tsx src/tools/design-verify.ts --evidence evidence.json --project ./my-app
 *   npx tsx src/tools/design-verify.ts --constraints bridge-constraints.json --project ./my-app
 *   npx tsx src/tools/design-verify.ts --evidence evidence.json --project ./my-app --strict
 */
import type { DesignEvidence, DesignConstraints, DesignVerificationResult } from "../types/design-evidence.js";
export interface VerifyOptions {
    /** Only check specific feature's constraints */
    feature_id?: string;
    /** Design constraints from bridge (subset of full evidence) */
    constraints?: DesignConstraints;
    /** Strictness: strict = all must be met, lenient = warnings for missing non-critical items */
    strictness?: "strict" | "lenient";
}
export declare function verifyDesignImplementation(evidence: DesignEvidence, projectDir: string, options?: VerifyOptions): Promise<DesignVerificationResult>;
export declare function writeVerificationToGraph(result: DesignVerificationResult, evidenceId: string, neo4jRun: (cypher: string, params?: Record<string, any>) => Promise<any[]>): Promise<{
    nodesCreated: number;
}>;
