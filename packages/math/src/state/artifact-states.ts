export const ARTIFACT_STATES = [
  "raw",
  "evidence_gathered",
  "derived",
  "validated",
  "promoted",
  "execution_ready",
  "executing",
  "executed",
  "verified",
  "canonical",
  "archived",
  "rejected",
] as const;

export type ArtifactState = typeof ARTIFACT_STATES[number];
