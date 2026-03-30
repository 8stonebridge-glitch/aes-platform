export interface PriorityCandidate {
    id: string;
    name: string;
    business_value: number;
    readiness: number;
    evidence_strength: number;
    estimated_effort: number;
    blast_radius: number;
    is_blocked: boolean;
    blocking_reason?: string;
}
export declare const PRIORITY_WEIGHTS: {
    readonly business_value: 0.3;
    readonly readiness: 0.25;
    readonly evidence_strength: 0.2;
    readonly effort_inverse: 0.15;
    readonly blast_radius_inverse: 0.1;
};
export interface PriorityResult {
    id: string;
    name: string;
    score: number;
    rank: number;
    is_blocked: boolean;
    breakdown: {
        business_value: number;
        readiness: number;
        evidence_strength: number;
        effort_inverse: number;
        blast_radius_inverse: number;
    };
}
export declare function rankPriorities(candidates: PriorityCandidate[]): PriorityResult[];
