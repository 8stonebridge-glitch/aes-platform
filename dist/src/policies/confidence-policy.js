export const confidencePolicy = {
    autoPromote: 0.85,
    manualPromoteFloor: 0.6,
    perFeatureMinimum: 0.5,
    maxAmbiguityFlags: 2,
};
export function shouldAutoPromote(confidence, ambiguityFlags) {
    return confidence >= confidencePolicy.autoPromote && ambiguityFlags <= 0;
}
export function canManuallyPromote(confidence) {
    return confidence >= confidencePolicy.manualPromoteFloor;
}
export function featureMeetsThreshold(confidence) {
    return confidence >= confidencePolicy.perFeatureMinimum;
}
