export const EDGE_TYPES = {
  IMPLEMENTED_BY: { from: "Feature", to: "Package", properties: ["confidence"] },
  LIVES_IN: { from: "Package", to: "Repo", properties: ["path"] },
  CONTAINS: { from: "Repo", to: "Module", properties: [] },
  GOVERNED_BY: { from: "Module", to: "Rule", properties: [] },
  COVERED_BY: { from: "Module", to: "TestSuite", properties: ["coverage_pct"] },
  CHANGED: { from: "PR", to: "Module", properties: ["change_type"] },
  REUSED_IN: { from: "Pattern", to: "App", properties: ["feature_id"] },
  DEPENDS_ON: { from: "Feature", to: "Feature", properties: ["type", "reason"] },
  USES: { from: "App", to: "Package", properties: ["version"] },
  OWNS: { from: "Team", to: "Package", properties: [] },
  PRODUCED_BY: { from: "Artifact", to: "Job", properties: [] },
  VALIDATES: { from: "ValidatorBundle", to: "FeatureType", properties: [] },
  TRANSLATES_TO: { from: "ReferenceSchema", to: "ConvexSchema", properties: ["translation_notes"] },
  FAILS_WITH: { from: "FailurePattern", to: "Feature", properties: ["frequency"] },
  FIXED_BY: { from: "FailurePattern", to: "FixPattern", properties: ["success_rate"] },
  PREVENTED_BY: { from: "FailurePattern", to: "PreventionRule", properties: [] },
  DETECTED_BY: { from: "FailurePattern", to: "ValidatorHeuristic", properties: [] },
  APPLIES_TO: { from: "Rule", to: "FeatureType", properties: [] },
  TRIGGERED_BY: { from: "FailurePattern", to: "Rule", properties: [] },
  OBSERVED_IN: { from: "FailurePattern", to: "App", properties: ["build_id"] },
  SIMILAR_TO: { from: "FailurePattern", to: "FailurePattern", properties: ["similarity_score"] },
  SOURCED_FROM: { from: "Pattern", to: "CatalogEntry", properties: [] },
  REQUIRES: { from: "Package", to: "Package", properties: [] },
  BLOCKS: { from: "Feature", to: "Feature", properties: ["reason"] },
  EXTENDS: { from: "Feature", to: "Feature", properties: [] },
  CATALOG_MATCH: { from: "CatalogEntry", to: "Feature", properties: ["fit_score", "fit_reason"] },
  BUILT_FROM: { from: "App", to: "CatalogEntry", properties: ["template_id"] },
} as const;

export type EdgeLabel = keyof typeof EDGE_TYPES;

export type EdgeDefinition = {
  from: string;
  to: string;
  properties: readonly string[];
};
