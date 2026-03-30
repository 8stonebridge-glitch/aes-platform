/**
 * P6 — Preflight Gates.
 * Quick checks before each feature build to catch obvious issues early:
 * - Does the feature have a valid bridge?
 * - Are dependencies built?
 * - Is the write scope non-empty?
 * - Are required files accessible?
 */
import type { FeatureBridge } from "../types/artifacts.js";
import type { BuildClassConfig } from "./feature-classifier.js";
export interface PreflightResult {
    passed: boolean;
    feature_id: string;
    checks: PreflightCheck[];
    block_reason?: string;
    duration_ms: number;
}
export interface PreflightCheck {
    name: string;
    passed: boolean;
    detail: string;
}
/**
 * Run preflight checks for a single feature before build.
 */
export declare function runPreflight(featureId: string, bridge: FeatureBridge | undefined, classConfig: BuildClassConfig, completedFeatures: Set<string>, workspacePath?: string): PreflightResult;
/**
 * Run preflight for all features and return a summary.
 */
export declare function runPreflightAll(featureIds: string[], bridges: Record<string, FeatureBridge>, classConfigs: Map<string, BuildClassConfig>, completedFeatures: Set<string>, workspacePath?: string): {
    results: PreflightResult[];
    ready: string[];
    blocked: string[];
};
