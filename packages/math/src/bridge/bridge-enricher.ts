import { computeConfidence, type ConfidenceDimensions } from "../engines/confidence-engine.js";
import { evaluateVetoes, type VetoInput } from "../engines/veto-engine.js";
import type { BridgeMathFields } from "./math-fields.js";

export function enrichBridgeWithMath(params: {
  confidence_dimensions: ConfidenceDimensions;
  veto_input: VetoInput;
  dependency_completeness: number;
  freshness: number;
  priority_rank: number;
  max_files: number;
  max_lines: number;
  current_state: string;
}): BridgeMathFields {
  const confidence = computeConfidence(params.confidence_dimensions);
  const vetoes = evaluateVetoes(params.veto_input);

  return {
    confidence_score: confidence.composite,
    risk_score: Math.round((1 - confidence.composite) * 1000) / 1000,
    freshness_score: params.freshness,
    dependency_score: params.dependency_completeness,
    drift_threshold: 0.1, // max allowed drift
    scope_budget: {
      max_files: params.max_files,
      max_lines: params.max_lines,
    },
    veto_state: {
      any_triggered: vetoes.any_triggered,
      blocking_codes: vetoes.blocking_codes,
    },
    priority_rank: params.priority_rank,
    artifact_state: params.current_state,
    last_math_evaluation: new Date().toISOString(),
  };
}
