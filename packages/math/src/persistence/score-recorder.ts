import type { MathEvaluationRecord } from "./types.js";

export class ScoreRecorder {
  private evaluations: MathEvaluationRecord[] = [];

  record(evaluation: MathEvaluationRecord): void {
    this.evaluations.push(evaluation);
  }

  getEvaluations(artifactId: string): MathEvaluationRecord[] {
    return this.evaluations.filter(e => e.artifact_id === artifactId);
  }

  getLatest(artifactId: string): MathEvaluationRecord | null {
    const evals = this.getEvaluations(artifactId);
    return evals[evals.length - 1] || null;
  }

  getAll(): MathEvaluationRecord[] {
    return [...this.evaluations];
  }

  count(): number {
    return this.evaluations.length;
  }

  toJSON(): MathEvaluationRecord[] {
    return [...this.evaluations];
  }
}
