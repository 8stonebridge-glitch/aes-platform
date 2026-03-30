import type { ScopeDefinition, ActualChanges } from "../engines/scope-drift-engine.js";
export interface ValidatorInput {
    artifact: any;
    bridge?: any;
    scope?: ScopeDefinition;
    actual_changes?: ActualChanges;
    files?: {
        path: string;
        content: string;
    }[];
    required_tests?: string[];
    actual_tests?: string[];
}
export interface ValidatorOutput {
    validator_name: string;
    passed: boolean;
    violations: {
        code: string;
        message: string;
        severity: "info" | "warning" | "error" | "critical";
    }[];
    score: number;
}
export interface AggregatedValidation {
    all_passed: boolean;
    total_validators: number;
    passed_count: number;
    failed_count: number;
    results: ValidatorOutput[];
    aggregate_score: number;
    blocking_failures: string[];
}
export declare function runAllValidators(input: ValidatorInput): AggregatedValidation;
export declare function runValidator(name: string, input: ValidatorInput): ValidatorOutput;
