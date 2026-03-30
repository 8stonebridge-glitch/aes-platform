/**
 * P2 — Slim Bridge Contracts.
 * Strips a full FeatureBridge down to only what the builder needs,
 * reducing prompt token count by ~60%.
 */
import type { FeatureBridge } from "../types/artifacts.js";
import type { BuilderPackage } from "../builder-artifact.js";
/**
 * A minimal contract for the builder — just enough to build correctly.
 */
export interface SlimContract {
    feature_id: string;
    feature_name: string;
    objective: string;
    included: string[];
    excluded: string[];
    write_paths: string[];
    forbidden_paths: string[];
    may_create: boolean;
    may_modify: boolean;
    may_delete: boolean;
    reuse_assets: {
        name: string;
        path: string;
    }[];
    tests: {
        name: string;
        pass_condition: string;
    }[];
    success_outcome: string;
    rules_summary: string;
}
/**
 * Compile a full BuilderPackage into a SlimContract.
 * Strips metadata, hashes, timestamps, and verbose descriptions.
 */
export declare function compileSlimContract(pkg: BuilderPackage): SlimContract;
/**
 * Compile a SlimContract directly from a FeatureBridge (skipping BuilderPackage).
 */
export declare function compileSlimContractFromBridge(bridge: FeatureBridge): SlimContract;
/**
 * Measure the token reduction from full package to slim contract.
 */
export declare function measureContractReduction(pkg: BuilderPackage): {
    full_chars: number;
    slim_chars: number;
    reduction_pct: number;
};
