/**
 * Graph Reader Node — searches Neo4j at pipeline start for prior knowledge.
 *
 * Queries the graph for:
 *   1. Prior builds with similar intent (have we built something like this before?)
 *   2. Existing feature specs that match keywords (reusable features)
 *   3. Known patterns and packages (catalog enrichment)
 *   4. Failure history (what went wrong before on similar builds?)
 *   5. Existing bridges that could be reused
 *
 * This gives every downstream node (classifier, decomposer, catalog searcher,
 * bridge compiler) access to what the system already knows.
 *
 * Graceful: if Neo4j is unavailable, returns empty context and continues.
 */
import type { AESStateType } from "../state.js";
export declare function graphReader(state: AESStateType): Promise<Partial<AESStateType>>;
