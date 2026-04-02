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

  // ── Learned app knowledge layer (learn-app.ts, research-and-backfill.ts) ──
  HAS_FEATURE: { from: "LearnedApp", to: "LearnedFeature", properties: [] },
  HAS_DATA_MODEL: { from: "LearnedApp", to: "LearnedDataModel", properties: [] },
  HAS_INTEGRATION: { from: "LearnedApp", to: "LearnedIntegration", properties: [] },
  HAS_API_DOMAIN: { from: "LearnedApp", to: "LearnedApiDomain", properties: [] },
  HAS_COMPONENTS: { from: "LearnedApp", to: "LearnedComponentGroup", properties: [] },
  HAS_COMPONENT_PATTERN: { from: "LearnedApp", to: "LearnedComponentPattern", properties: [] },
  HAS_PAGES: { from: "LearnedApp", to: "LearnedPageSection", properties: [] },
  HAS_DESIGN_SYSTEM: { from: "LearnedApp", to: "LearnedDesignSystem", properties: [] },
  HAS_USER_FLOW: { from: "LearnedApp", to: "LearnedUserFlow", properties: [] },
  HAS_FORM_PATTERN: { from: "LearnedApp", to: "LearnedFormPattern", properties: [] },
  HAS_STATE_PATTERN: { from: "LearnedApp", to: "LearnedStatePattern", properties: [] },
  HAS_NAVIGATION: { from: "LearnedApp", to: "LearnedNavigation", properties: [] },
  USES_PATTERN: { from: "LearnedApp", to: "LearnedPattern", properties: [] },
  USES_MODEL: { from: "LearnedFeature", to: "LearnedDataModel", properties: [] },

  // ── Learning feedback layer (learn-loop.ts, learn-loop-perplexity.ts) ──
  HAS_FEEDBACK: { from: "LearnedApp", to: "LearnedFeedback", properties: [] },
  HAS_CORRECTION: { from: "LearnedApp", to: "LearnedCorrection", properties: [] },
  HAS_BLUEPRINT_RESULT: { from: "LearnedApp", to: "LearnedBlueprintResult", properties: [] },
  HAS_RESEARCH: { from: "LearnedApp", to: "LearnedResearch", properties: [] },
  TESTED_AGAINST: { from: "LearnedBlueprintResult", to: "LearnedApp", properties: [] },

  // ── AES self-knowledge layer (store-reasoning-lesson.ts, store-evolution-*.ts) ──
  LED_TO: { from: "AESEvolution", to: "AESEvolution", properties: [] },
  PRODUCED: { from: "AESEvolution", to: "AESReasoningRule", properties: [] },
  HAS_STRATEGY: { from: "AESReasoningRule", to: "AESSearchStrategy", properties: [] },
  DISCOVERED: { from: "AESLesson", to: "AESReasoningRule", properties: [] },
  PREFLIGHT_FOR: { from: "AESPreflight", to: "AESReasoningRule", properties: [] },

  // ── Build extraction layer (post-build-extract.ts) ──
  USED_TECH: { from: "BuildExtraction", to: "BuildExtractedTech", properties: [] },
  PRODUCED_MODEL: { from: "BuildExtraction", to: "BuildExtractedModel", properties: [] },
  USED_INTEGRATION: { from: "BuildExtraction", to: "BuildExtractedIntegration", properties: [] },
  USED_PATTERN: { from: "BuildExtraction", to: "BuildExtractedPattern", properties: [] },
  PASSED_CHECK: { from: "BuildExtraction", to: "BuildCheck", properties: [] },
  FAILED_CHECK: { from: "BuildExtraction", to: "BuildCheck", properties: [] },
  MATCHES_LEARNED: { from: "BuildExtractedModel", to: "LearnedDataModel", properties: ["similarity"] },

  // ── Build outcome layer (temporal-success.ts) ──
  USED_SOURCE: { from: "BuildOutcome", to: "LearnedApp", properties: [] },
  USED_FEATURE: { from: "BuildOutcome", to: "LearnedFeature", properties: [] },
  HAD_REASONING_PATH: { from: "BuildOutcome", to: "ReasoningPath", properties: [] },
  EXTRACTION_OUTCOME: { from: "BuildExtraction", to: "BuildOutcome", properties: [] },

  // ── Versioned truth layer (versioned-truth.ts, graph-updater.ts) ──
  HAS_VERSION: { from: "Entity", to: "Version", properties: [] },
  CURRENT_VERSION: { from: "Entity", to: "Version", properties: [] },
  HAS_CHANGE: { from: "Entity", to: "ChangeEvent", properties: [] },
  SNAPSHOT_OF: { from: "Version", to: "Entity", properties: [] },
  FROM_VERSION: { from: "ChangeEvent", to: "Version", properties: [] },
  TO_VERSION: { from: "ChangeEvent", to: "Version", properties: [] },
  EVIDENCE: { from: "ChangeEvent", to: "Entity", properties: [] },
  BUILD_OF: { from: "Entity", to: "Entity", properties: [] },

  // ── Design evidence layer (design-extract.ts) ──
  HAS_SCREEN: { from: "DesignEvidence", to: "DesignScreen", properties: [] },
  HAS_COMPONENT: { from: "DesignScreen", to: "DesignComponent", properties: [] },
  HAS_DATA_VIEW: { from: "DesignScreen", to: "DesignDataView", properties: [] },
  HAS_FORM: { from: "DesignScreen", to: "DesignForm", properties: [] },
  HAS_ACTION: { from: "DesignScreen", to: "DesignAction", properties: [] },
  HAS_STATE: { from: "DesignScreen", to: "DesignState", properties: [] },
  NAVIGATES_TO: { from: "DesignScreen", to: "DesignScreen", properties: [] },
  VERIFIED_BY: { from: "DesignEvidence", to: "DesignVerification", properties: [] },

  // ── Graph analysis layer (community-detect.ts) ──
  BELONGS_TO_COMMUNITY: { from: "LearnedApp", to: "GraphCommunity", properties: [] },

  // ── Operations layer (reconnect-orphans.ts, auto-build-runner.ts) ──
  HAS_BUILD: { from: "BuildHistory", to: "BuildRun", properties: [] },
  HAS_FEATURE_BUILD: { from: "BuildRun", to: "FeatureBuild", properties: [] },
  REPAIR_FOR: { from: "HermesRepairOutcome", to: "ServiceAnchor", properties: [] },

  // ── Learn-UI layer (learn-ui.ts) ──
  HAS_UI_COMPONENTS: { from: "Entity", to: "UIComponentGroup", properties: [] },
  HAS_NAV: { from: "Entity", to: "NavItem", properties: [] },
  HAS_LAYOUT: { from: "Entity", to: "LayoutPattern", properties: [] },

  // ── Reverse engineer layer ──
  USES_INTEGRATION_RE: { from: "Entity", to: "CatalogEntry", properties: [] },
  HAS_DATA_MODELS: { from: "Entity", to: "DataModelGroup", properties: [] },
  CONTAINS_MODEL: { from: "DataModelGroup", to: "DataModel", properties: [] },

  // ── Graph analysis metrics (community-detect.ts) ──
  MEASURES: { from: "GraphMetric", to: "GraphCommunity", properties: [] },

  // ── Research audit trail (research-and-backfill.ts) ──
  RESEARCH_FOR: { from: "LearnedResearch", to: "LearnedApp", properties: [] },
} as const;

export type EdgeLabel = keyof typeof EDGE_TYPES;

export type EdgeDefinition = {
  from: string;
  to: string;
  properties: readonly string[];
};
