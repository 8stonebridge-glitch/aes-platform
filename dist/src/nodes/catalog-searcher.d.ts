import type { AESStateType } from "../state.js";
/**
 * Catalog Searcher — for each feature in the build order,
 * searches the catalog for reusable assets.
 * Runs once before bridge compilation begins.
 */
export declare function catalogSearcher(state: AESStateType): Promise<Partial<AESStateType>>;
