export interface BridgeMathFields {
  confidence_score: number;
  risk_score: number;
  freshness_score: number;
  dependency_score: number;
  drift_threshold: number;
  scope_budget: {
    max_files: number;
    max_lines: number;
  };
  veto_state: {
    any_triggered: boolean;
    blocking_codes: string[];
  };
  priority_rank: number;
  artifact_state: string;
  last_math_evaluation: string; // ISO timestamp
}
