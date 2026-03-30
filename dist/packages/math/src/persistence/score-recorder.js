export class ScoreRecorder {
    evaluations = [];
    record(evaluation) {
        this.evaluations.push(evaluation);
    }
    getEvaluations(artifactId) {
        return this.evaluations.filter(e => e.artifact_id === artifactId);
    }
    getLatest(artifactId) {
        const evals = this.getEvaluations(artifactId);
        return evals[evals.length - 1] || null;
    }
    getAll() {
        return [...this.evaluations];
    }
    count() {
        return this.evaluations.length;
    }
    toJSON() {
        return [...this.evaluations];
    }
}
