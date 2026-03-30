import { type ConfidenceDimensions } from "../engines/confidence-engine.js";
import { type VetoInput } from "../engines/veto-engine.js";
import type { BridgeMathFields } from "./math-fields.js";
export declare function enrichBridgeWithMath(params: {
    confidence_dimensions: ConfidenceDimensions;
    veto_input: VetoInput;
    dependency_completeness: number;
    freshness: number;
    priority_rank: number;
    max_files: number;
    max_lines: number;
    current_state: string;
}): BridgeMathFields;
