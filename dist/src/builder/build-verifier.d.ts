import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord, FixTrailEntry } from "../types/artifacts.js";
import { type CatalogValidatorResult } from "../validators/catalog-usage-validator.js";
import { type CompositionValidatorResult } from "../validators/composition-validator.js";
import type { KGFactValidatorResult } from "../validators/kg-fact-validator.js";
export interface VerificationResult {
    passed: boolean;
    scope_violations: string[];
    constraint_violations: string[];
    test_coverage_met: boolean;
    fix_trail_entries: FixTrailEntry[];
    catalog_validation?: CatalogValidatorResult;
    composition_validation?: CompositionValidatorResult;
    /** KG fact validation — checks builder claims against knowledge graph */
    kg_fact_validation?: KGFactValidatorResult;
}
export declare function verifyBuild(jobId: string, pkg: BuilderPackage, run: BuilderRunRecord): VerificationResult;
/**
 * Create FixTrail entries for repo-level check failures (typecheck, lint, test, build).
 */
export declare function createCheckFixTrailEntries(jobId: string, runId: string, bridgeId: string, checkResults: {
    check: string;
    passed: boolean;
    output: string;
    skipped: boolean;
}[]): FixTrailEntry[];
