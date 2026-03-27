/**
 * Confidence Policy — thresholds for promotion gates.
 */
export interface ConfidenceThresholds {
  /** Minimum overall confidence to auto-promote (0-1) */
  autoPromote: number;
  /** Minimum confidence to allow manual promotion (0-1) */
  manualPromoteFloor: number;
  /** Minimum per-feature confidence (0-1) */
  perFeatureMinimum: number;
  /** Maximum allowed ambiguity flags before requiring human review */
  maxAmbiguityFlags: number;
}

export const confidencePolicy: ConfidenceThresholds = {
  autoPromote: 0.85,
  manualPromoteFloor: 0.6,
  perFeatureMinimum: 0.5,
  maxAmbiguityFlags: 2,
};

export function shouldAutoPromote(confidence: number, ambiguityFlags: number): boolean {
  return confidence >= confidencePolicy.autoPromote && ambiguityFlags <= 0;
}

export function canManuallyPromote(confidence: number): boolean {
  return confidence >= confidencePolicy.manualPromoteFloor;
}

export function featureMeetsThreshold(confidence: number): boolean {
  return confidence >= confidencePolicy.perFeatureMinimum;
}
