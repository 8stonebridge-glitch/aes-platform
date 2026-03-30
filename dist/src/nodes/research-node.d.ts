/**
 * Research Node — external research via Perplexity/Paper integration.
 *
 * Runs after intent classification and before decomposition.
 * Queries external research APIs to enrich the pipeline with:
 *   1. Market/product research for the app class
 *   2. Technical pattern research for the inferred stack
 *   3. UX/UI pattern research for the target user type
 *   4. Integration research for any mentioned third-party services
 *
 * Results are stored in graphContext.learnedResearch and passed to
 * the decomposer for evidence-informed feature planning.
 *
 * Graceful: if research APIs are unavailable, continues with empty results.
 */
import type { AESStateType } from "../state.js";
/**
 * Research Node — enriches pipeline with external research.
 */
export declare function researchNode(state: AESStateType): Promise<Partial<AESStateType>>;
