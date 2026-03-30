import type { MathEvaluationRecord } from "./types.js";
export declare class ScoreRecorder {
    private evaluations;
    record(evaluation: MathEvaluationRecord): void;
    getEvaluations(artifactId: string): MathEvaluationRecord[];
    getLatest(artifactId: string): MathEvaluationRecord | null;
    getAll(): MathEvaluationRecord[];
    count(): number;
    toJSON(): MathEvaluationRecord[];
}
