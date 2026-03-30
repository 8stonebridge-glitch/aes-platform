/**
 * Designer Node — Auto-generates DesignEvidence from decomposed AppSpec.
 *
 * Runs after decomposer, before spec_validator.
 * Uses LLM to derive screens, components, forms, actions, states, and navigation
 * from the feature list. Falls back to template-based generation if no LLM.
 *
 * Output: populates state.designEvidence so downstream nodes (bridge compiler,
 * builder) can use design constraints.
 *
 * Paper MCP integration: if an operator has already created a design in Paper
 * and extracted it (design-evidence-*.json on disk), the graph-reader will have
 * loaded it into state.designEvidence already. This node skips generation in
 * that case and only enriches/validates.
 */
import type { AESStateType } from "../state.js";
export declare function designer(state: AESStateType): Promise<Partial<AESStateType>>;
