/**
 * P7 — Layered Validation.
 * L1: Scope + syntax per feature (runs immediately after each build)
 * L2: Feature tests (runs after L1 passes)
 * L3: Integration / cross-feature tests (runs after all features built)
 *
 * Early layers are fast and cheap. Only features that pass L1 proceed to L2.
 * L3 only runs once when all features are complete.
 */
import type { BuilderRunRecord, FeatureBridge } from "../types/artifacts.js";
import type { BuildClassConfig } from "./feature-classifier.js";
export interface LayerResult {
    layer: "L1" | "L2" | "L3";
    feature_id: string;
    passed: boolean;
    checks: LayerCheck[];
    duration_ms: number;
}
export interface LayerCheck {
    name: string;
    passed: boolean;
    detail: string;
    severity: "error" | "warning" | "info";
}
/**
 * L1 validates scope compliance and basic structure.
 * Runs immediately after each feature build completes.
 */
export declare function validateLayer1(run: BuilderRunRecord, bridge: FeatureBridge, classConfig: BuildClassConfig): LayerResult;
/**
 * L2 validates feature-specific test results.
 * Only runs if L1 passed.
 */
export declare function validateLayer2(run: BuilderRunRecord, bridge: FeatureBridge): LayerResult;
/**
 * L3 validates cross-feature concerns after all builds complete.
 * Checks for conflicting files, duplicate routes, import consistency, etc.
 */
export declare function validateLayer3(runs: Record<string, BuilderRunRecord>, bridges: Record<string, FeatureBridge>): LayerResult;
export interface ValidationPipeline {
    l1Results: Map<string, LayerResult>;
    l2Results: Map<string, LayerResult>;
    l3Result: LayerResult | null;
    summary: {
        total_features: number;
        l1_passed: number;
        l2_passed: number;
        l3_passed: boolean;
        overall_passed: boolean;
    };
}
/**
 * Run the full validation pipeline across all built features.
 */
export declare function runValidationPipeline(runs: Record<string, BuilderRunRecord>, bridges: Record<string, FeatureBridge>, classConfigs: Map<string, BuildClassConfig>): ValidationPipeline;
