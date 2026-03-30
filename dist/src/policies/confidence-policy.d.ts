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
export declare const confidencePolicy: ConfidenceThresholds;
export declare function shouldAutoPromote(confidence: number, ambiguityFlags: number): boolean;
export declare function canManuallyPromote(confidence: number): boolean;
export declare function featureMeetsThreshold(confidence: number): boolean;
