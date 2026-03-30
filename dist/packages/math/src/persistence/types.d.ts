export interface MathEvaluationRecord {
    evaluation_id: string;
    artifact_id: string;
    artifact_type: string;
    confidence_result: any;
    veto_result: any;
    dependency_analysis: any;
    scope_drift_result: any;
    priority_result: any;
    validation_result: any;
    state_transition: {
        from: string;
        to: string;
        allowed: boolean;
        reason: string;
    } | null;
    created_at: string;
}
