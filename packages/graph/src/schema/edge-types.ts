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

  // Component-level relationships (LearnedComponentPattern ↔ LearnedComponentPattern)
  COMPOSES: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  PLACEHOLDER_FOR: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  VARIANT_OF: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  ERROR_STATE_FOR: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  EMPTY_STATE_FOR: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  NOTIFIES_WITH: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },
  PAIRS_WITH: { from: "LearnedComponentPattern", to: "LearnedComponentPattern", properties: ["reason"] },

  // Learned knowledge relationships
  TEACHES: { from: "LearnedIntegration", to: "FeatureType", properties: ["relevance"] },
  DEMONSTRATES: { from: "LearnedPattern", to: "FeatureType", properties: ["relevance"] },
  PATTERN_FOR: { from: "LearnedPattern", to: "Pattern", properties: [] },
  PREVENTS: { from: "PreventionRule", to: "FeatureType", properties: ["gate"] },
  COMPONENT_FOR: { from: "LearnedComponentPattern", to: "Package", properties: [] },

  // Bridge/Scenario linkage
  BRIDGES: { from: "BridgePreset", to: "FeatureType", properties: [] },
  TESTS: { from: "ScenarioPack", to: "FeatureType", properties: [] },

  // Live runtime relationships (FeatureSpec, RuntimeService, etc.)
  IMPLEMENTS: { from: "FeatureSpec", to: "RuntimeService", properties: [] },
  EXPOSES: { from: "FeatureSpec", to: "InterfaceSurface", properties: [] },
  READS_FROM: { from: "FeatureSpec", to: "DataStore", properties: [] },
  WRITES_TO: { from: "FeatureSpec", to: "DataStore", properties: [] },
  ENFORCES: { from: "FeatureSpec", to: "GovernanceRule", properties: [] },
  DEPENDS_ON_FEATURE: { from: "FeatureSpec", to: "FeatureSpec", properties: [] },
} as const;

export type EdgeLabel = keyof typeof EDGE_TYPES;

export type EdgeDefinition = {
  from: string;
  to: string;
  properties: readonly string[];
};
