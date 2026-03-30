import type { AESStateType } from "../state.js";
export declare function topologicalSort(features: any[], edges: any[]): string[];
/**
 * Template-based decomposition — the original logic, now used as fallback
 * when no LLM API key is configured or the LLM call fails.
 */
export declare function templateDecompose(state: AESStateType): {
    appSpec: any;
    featureBuildOrder: string[];
};
export declare function decomposer(state: AESStateType): Promise<Partial<AESStateType>>;
