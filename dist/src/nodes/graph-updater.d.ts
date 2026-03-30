/**
 * Graph Updater Node — writes pipeline results to Neo4j after each major gate.
 *
 * Graceful: if Neo4j is unavailable, logs a warning and passes through.
 * Uses the versioned-truth Cypher generators from src/graph/versioned-truth.ts.
 */
import type { AESStateType } from "../state.js";
/**
 * Pipeline Outcome — write a queryable record of every pipeline run.
 * Enables failure distribution analysis and self-audit.
 */
export declare function writePipelineOutcome(state: AESStateType): Promise<void>;
/**
 * LangGraph node: writes accumulated pipeline state to Neo4j.
 *
 * Called after veto_checker (gates 0-3) and after deployment_handler (build record).
 * If Neo4j is unavailable, passes through without blocking.
 */
export declare function graphUpdater(state: AESStateType): Promise<Partial<AESStateType>>;
/**
 * Lightweight failure recorder — writes only PipelineOutcome to Neo4j.
 * Used on early-exit failure paths that bypass the full graph-updater.
 */
export declare function failureRecorder(state: AESStateType): Promise<Partial<AESStateType>>;
