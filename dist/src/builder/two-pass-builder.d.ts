/**
 * P1 — Two-Pass Build.
 * Plan phase produces a file list and structure → validate against scope → execute only if plan passes.
 * This avoids wasting a full build attempt on features that would violate scope.
 */
import type { BuilderPackage } from "../builder-artifact.js";
import type { BuildClassConfig } from "./feature-classifier.js";
export interface ChangePlan {
    feature_id: string;
    planned_files: PlannedFile[];
    estimated_lines: number;
    touches_shared: boolean;
    touches_schema: boolean;
    touches_config: boolean;
    rationale: string;
}
export interface PlannedFile {
    path: string;
    action: "create" | "modify" | "delete";
    estimated_lines: number;
    purpose: string;
}
export interface PlanValidationResult {
    valid: boolean;
    violations: string[];
    warnings: string[];
    files_within_budget: boolean;
    lines_within_budget: boolean;
    paths_within_scope: boolean;
}
/**
 * Validate a change plan against the builder package scope and class config.
 */
export declare function validateChangePlan(plan: ChangePlan, pkg: BuilderPackage, classConfig: BuildClassConfig): PlanValidationResult;
/**
 * Build the plan prompt that asks the LLM to produce a change plan before coding.
 */
export declare function buildPlanPrompt(pkg: BuilderPackage, classConfig: BuildClassConfig): string;
/**
 * Shared build context that can be precomputed and reused across features.
 */
export interface SharedBuildContext {
    route_map: Record<string, string>;
    schema_summary: string;
    component_list: string[];
    shared_utils: string[];
    existing_features: string[];
}
