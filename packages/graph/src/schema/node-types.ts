import { z } from "zod";

export const NODE_TYPES = {
  App: {
    required: ["app_id", "title", "app_class", "risk_class", "created_at"],
    optional: ["summary", "deployment_url", "status"],
    indexes: ["app_id", "app_class"],
  },
  Feature: {
    required: ["feature_id", "name", "priority", "status"],
    optional: ["summary", "description", "app_id"],
    indexes: ["feature_id", "app_id"],
  },
  FeatureType: {
    required: ["type_id", "name", "description"],
    optional: ["validator_bundle_id", "bridge_preset_id"],
    indexes: ["type_id"],
  },
  Package: {
    required: ["package_id", "name", "repo", "package_path"],
    optional: ["version", "description", "promotion_tier"],
    indexes: ["package_id", "name"],
  },
  Repo: {
    required: ["repo_id", "name", "url"],
    optional: ["description", "default_branch"],
    indexes: ["repo_id", "name"],
  },
  Module: {
    required: ["module_id", "name", "path"],
    optional: ["description", "package_id"],
    indexes: ["module_id"],
  },
  Rule: {
    required: ["rule_id", "code", "gate", "severity"],
    optional: ["description", "trigger_condition"],
    indexes: ["rule_id", "code"],
  },
  TestSuite: {
    required: ["suite_id", "name", "type"],
    optional: ["status", "last_run", "coverage"],
    indexes: ["suite_id"],
  },
  PR: {
    required: ["pr_id", "number", "repo_id", "branch", "status"],
    optional: ["title", "url", "merged_at"],
    indexes: ["pr_id"],
  },
  Pattern: {
    required: ["pattern_id", "name", "type"],
    optional: ["description", "source_donor", "promotion_tier"],
    indexes: ["pattern_id", "name"],
  },
  Team: {
    required: ["team_id", "name"],
    optional: ["description"],
    indexes: ["team_id"],
  },
  Job: {
    required: ["job_id", "type", "status", "created_at"],
    optional: ["app_id", "feature_id", "completed_at"],
    indexes: ["job_id", "status"],
  },
  Artifact: {
    required: ["artifact_id", "type", "job_id", "created_at"],
    optional: ["status", "parent_artifact_id"],
    indexes: ["artifact_id", "type"],
  },
  ValidatorBundle: {
    required: ["bundle_id", "name", "feature_type"],
    optional: ["description", "validators"],
    indexes: ["bundle_id"],
  },
  BridgePreset: {
    required: ["preset_id", "name", "feature_type"],
    optional: ["description"],
    indexes: ["preset_id"],
  },
  ScenarioPack: {
    required: ["pack_id", "name", "feature_type"],
    optional: ["description", "scenarios"],
    indexes: ["pack_id"],
  },
  CatalogEntry: {
    required: ["entry_id", "name", "type", "repo", "package_path", "promotion_tier"],
    optional: ["description", "version", "owning_team", "last_validation_date"],
    indexes: ["entry_id", "name", "type"],
  },
  ConvexSchema: {
    required: ["schema_id", "name", "table_name"],
    optional: ["description", "fields", "indexes"],
    indexes: ["schema_id"],
  },
  ReferenceSchema: {
    required: ["schema_id", "name", "source"],
    optional: ["description", "original_orm"],
    indexes: ["schema_id"],
  },
  FailurePattern: {
    required: ["pattern_id", "name", "failure_type", "root_cause_category"],
    optional: ["description", "severity_range", "frequency", "first_observed"],
    indexes: ["pattern_id", "failure_type"],
  },
  FixPattern: {
    required: ["pattern_id", "name", "resolution_action"],
    optional: ["description", "success_rate", "times_applied"],
    indexes: ["pattern_id"],
  },
  PreventionRule: {
    required: ["rule_id", "name", "gate", "target_failure_type"],
    optional: ["description", "check_logic"],
    indexes: ["rule_id"],
  },
  ValidatorHeuristic: {
    required: ["heuristic_id", "name", "validator_tier", "target_failure_type"],
    optional: ["description", "detection_logic", "false_positive_rate"],
    indexes: ["heuristic_id"],
  },

  // Learned knowledge nodes (populated by graph-reader, donor seeds, and build extraction)
  LearnedIntegration: {
    required: ["name", "type", "provider"],
    optional: ["description", "auth_method", "code_sample"],
    indexes: ["name", "provider"],
  },
  LearnedPattern: {
    required: ["name", "type"],
    optional: ["description", "applicable_to", "code_sample"],
    indexes: ["name", "type"],
  },
  LearnedComponentPattern: {
    required: ["name", "category"],
    optional: ["description", "source", "props", "usage_example", "depends_on"],
    indexes: ["name", "category"],
  },

  // Live runtime nodes (populated by live-runtime.cypher)
  FeatureSpec: {
    required: ["node_id", "feature_id", "name", "status"],
    optional: ["description", "priority", "depends_on", "app_id"],
    indexes: ["node_id", "feature_id"],
  },
  RuntimeService: {
    required: ["node_id", "name"],
    optional: ["description", "entry_point", "authority_tier"],
    indexes: ["node_id", "name"],
  },
  InterfaceSurface: {
    required: ["node_id", "name", "type"],
    optional: ["description", "entry_point"],
    indexes: ["node_id", "name"],
  },
  DataStore: {
    required: ["node_id", "name", "type"],
    optional: ["description", "connection_env"],
    indexes: ["node_id", "name"],
  },
  GovernanceRule: {
    required: ["node_id", "name"],
    optional: ["description", "enforcement"],
    indexes: ["node_id", "name"],
  },

  // ── Learned knowledge layer (learn-app.ts, research-and-backfill.ts) ──
  LearnedApp: {
    required: ["app_id", "name"],
    optional: ["description", "url", "category", "source", "analyzed_at"],
    indexes: ["app_id", "name"],
  },
  LearnedFeature: {
    required: ["feature_id", "name"],
    optional: ["description", "category", "priority", "app_id"],
    indexes: ["feature_id", "name"],
  },
  LearnedDataModel: {
    required: ["name"],
    optional: ["description", "domain", "fields", "relationships_to", "code_sample"],
    indexes: ["name"],
  },
  LearnedApiDomain: {
    required: ["name"],
    optional: ["description", "endpoints", "auth_method"],
    indexes: ["name"],
  },
  LearnedComponentGroup: {
    required: ["name"],
    optional: ["description", "components", "framework"],
    indexes: ["name"],
  },
  LearnedPageSection: {
    required: ["name"],
    optional: ["description", "layout", "components"],
    indexes: ["name"],
  },
  LearnedDesignSystem: {
    required: ["name"],
    optional: ["description", "colors", "typography", "spacing", "framework"],
    indexes: ["name"],
  },
  LearnedUserFlow: {
    required: ["name"],
    optional: ["description", "domain", "steps", "entry_point", "success_criteria"],
    indexes: ["name"],
  },
  LearnedFormPattern: {
    required: ["name"],
    optional: ["description", "fields", "validation_rules", "submission_pattern"],
    indexes: ["name"],
  },
  LearnedStatePattern: {
    required: ["name"],
    optional: ["description", "state_shape", "actions", "selectors"],
    indexes: ["name"],
  },
  LearnedNavigation: {
    required: ["name"],
    optional: ["description", "structure", "type"],
    indexes: ["name"],
  },

  // ── Learning feedback layer (learn-loop.ts, learn-loop-perplexity.ts) ──
  LearnedFeedback: {
    required: ["session_id", "section"],
    optional: ["app_description", "score", "feedback", "created_at"],
    indexes: ["session_id"],
  },
  LearnedCorrection: {
    required: ["session_id"],
    optional: ["app_description", "section", "original", "corrected", "reason", "created_at"],
    indexes: ["session_id"],
  },
  LearnedBlueprintResult: {
    required: ["session_id"],
    optional: ["app_description", "result", "score", "created_at"],
    indexes: ["session_id"],
  },
  LearnedResearch: {
    required: ["name"],
    optional: ["description", "domain", "source", "findings", "created_at"],
    indexes: ["name", "domain"],
  },

  // ── AES self-knowledge layer (store-reasoning-lesson.ts, store-evolution-*.ts) ──
  AESEvolution: {
    required: ["evolution_id"],
    optional: ["description", "trigger", "outcome", "created_at"],
    indexes: ["evolution_id"],
  },
  AESReasoningRule: {
    required: ["rule_id", "name"],
    optional: ["description", "condition", "action", "confidence"],
    indexes: ["rule_id", "name"],
  },
  AESSearchStrategy: {
    required: ["name"],
    optional: ["description", "query_pattern", "target_labels"],
    indexes: ["name"],
  },
  AESPreflight: {
    required: ["name"],
    optional: ["description", "check_type", "implementation"],
    indexes: ["name"],
  },
  AESLesson: {
    required: ["name"],
    optional: ["description", "context", "insight", "created_at"],
    indexes: ["name"],
  },
  AESBlueprint: {
    required: ["name"],
    optional: ["description", "domains", "strategy", "created_at"],
    indexes: ["name"],
  },

  // ── Build extraction layer (post-build-extract.ts) ──
  BuildExtraction: {
    required: ["extraction_id"],
    optional: ["run_id", "app_id", "feature_id", "created_at"],
    indexes: ["extraction_id", "run_id"],
  },
  BuildExtractedTech: {
    required: ["name"],
    optional: ["version", "category", "extraction_id"],
    indexes: ["name"],
  },
  BuildExtractedModel: {
    required: ["name"],
    optional: ["description", "fields", "extraction_id"],
    indexes: ["name"],
  },
  BuildExtractedIntegration: {
    required: ["name"],
    optional: ["provider", "type", "extraction_id"],
    indexes: ["name"],
  },
  BuildExtractedPattern: {
    required: ["name"],
    optional: ["type", "description", "extraction_id"],
    indexes: ["name"],
  },
  BuildCheck: {
    required: ["check_id", "name"],
    optional: ["status", "message", "extraction_id"],
    indexes: ["check_id"],
  },

  // ── Build outcome layer (temporal-success.ts) ──
  BuildOutcome: {
    required: ["outcome_id"],
    optional: ["run_id", "status", "duration_ms", "created_at"],
    indexes: ["outcome_id", "run_id"],
  },
  ReasoningPath: {
    required: ["path_id"],
    optional: ["description", "steps", "outcome_id"],
    indexes: ["path_id"],
  },

  // ── Graph analysis layer (community-detect.ts) ──
  GraphCommunity: {
    required: ["community_id", "name"],
    optional: ["description", "member_count", "density"],
    indexes: ["community_id"],
  },
  GraphMetric: {
    required: ["metric_id", "name"],
    optional: ["value", "computed_at"],
    indexes: ["metric_id"],
  },

  // ── Versioned truth layer (versioned-truth.ts, graph-updater.ts) ──
  Entity: {
    required: ["entity_id", "entity_type"],
    optional: ["name", "status", "created_at"],
    indexes: ["entity_id", "entity_type"],
  },
  Version: {
    required: ["version_id"],
    optional: ["entity_id", "version_number", "data", "created_at"],
    indexes: ["version_id", "entity_id"],
  },
  ChangeEvent: {
    required: ["event_id"],
    optional: ["entity_id", "change_type", "description", "created_at"],
    indexes: ["event_id", "entity_id"],
  },
  PipelineOutcome: {
    required: ["outcome_id"],
    optional: ["run_id", "status", "gate", "created_at"],
    indexes: ["outcome_id", "run_id"],
  },

  // ── Design evidence layer (design-extract.ts) ──
  DesignEvidence: {
    required: ["evidence_id"],
    optional: ["name", "source", "description", "created_at"],
    indexes: ["evidence_id"],
  },
  DesignScreen: {
    required: ["screen_id", "name"],
    optional: ["description", "route", "layout"],
    indexes: ["screen_id"],
  },
  DesignComponent: {
    required: ["name"],
    optional: ["description", "props", "screen_id"],
    indexes: ["name"],
  },
  DesignDataView: {
    required: ["name"],
    optional: ["description", "data_source", "screen_id"],
    indexes: ["name"],
  },
  DesignForm: {
    required: ["name"],
    optional: ["description", "fields", "screen_id"],
    indexes: ["name"],
  },
  DesignAction: {
    required: ["name"],
    optional: ["description", "trigger", "screen_id"],
    indexes: ["name"],
  },
  DesignState: {
    required: ["name"],
    optional: ["description", "type", "screen_id"],
    indexes: ["name"],
  },
  DesignVerification: {
    required: ["verification_id"],
    optional: ["status", "findings", "created_at"],
    indexes: ["verification_id"],
  },

  // ── Operations layer (reconnect-orphans.ts, store.ts, auto-build-runner.ts) ──
  ResearchHub: {
    required: ["hub_id"],
    optional: ["name", "description", "created_at"],
    indexes: ["hub_id"],
  },
  BuildHistory: {
    required: ["history_id"],
    optional: ["app_id", "created_at"],
    indexes: ["history_id"],
  },
  BuildRun: {
    required: ["run_id"],
    optional: ["status", "app_id", "feature_id", "created_at"],
    indexes: ["run_id"],
  },
  FeatureBuild: {
    required: ["build_id"],
    optional: ["feature_id", "run_id", "status", "created_at"],
    indexes: ["build_id", "run_id"],
  },
  HermesRepairOutcome: {
    required: ["pattern"],
    optional: ["category", "service", "diagnosis", "fix_action", "error_snippet", "created_at"],
    indexes: ["pattern", "category"],
  },

  // ── Learn-UI layer (learn-ui.ts — parallel schema to Learned* nodes) ──
  UIComponentGroup: {
    required: ["name"],
    optional: ["description", "components", "framework"],
    indexes: ["name"],
  },
  PageSection: {
    required: ["name"],
    optional: ["description", "layout", "route"],
    indexes: ["name"],
  },
  NavItem: {
    required: ["name"],
    optional: ["description", "href", "icon"],
    indexes: ["name"],
  },
  LayoutPattern: {
    required: ["name"],
    optional: ["description", "type", "structure"],
    indexes: ["name"],
  },

  // ── Reverse engineer layer ──
  DataModelGroup: {
    required: ["name"],
    optional: ["description", "models"],
    indexes: ["name"],
  },
  DataModel: {
    required: ["name"],
    optional: ["description", "domain", "fields", "relationships_to"],
    indexes: ["name"],
  },

  // ── Service anchor (store.ts — connects HermesRepairOutcome to a service) ──
  ServiceAnchor: {
    required: ["name"],
    optional: ["description"],
    indexes: ["name"],
  },
} as const;

export type NodeLabel = keyof typeof NODE_TYPES;

// Zod schemas for runtime validation of node properties

export const AppSchema = z.object({
  app_id: z.string(),
  title: z.string(),
  app_class: z.string(),
  risk_class: z.string(),
  created_at: z.string(),
  summary: z.string().optional(),
  deployment_url: z.string().optional(),
  status: z.string().optional(),
});

export const FeatureSchema = z.object({
  feature_id: z.string(),
  name: z.string(),
  priority: z.union([z.string(), z.number()]),
  status: z.string(),
  summary: z.string().optional(),
  description: z.string().optional(),
  app_id: z.string().optional(),
});

export const FeatureTypeSchema = z.object({
  type_id: z.string(),
  name: z.string(),
  description: z.string(),
  validator_bundle_id: z.string().optional(),
  bridge_preset_id: z.string().optional(),
});

export const PackageSchema = z.object({
  package_id: z.string(),
  name: z.string(),
  repo: z.string(),
  package_path: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  promotion_tier: z.string().optional(),
});

export const RepoSchema = z.object({
  repo_id: z.string(),
  name: z.string(),
  url: z.string(),
  description: z.string().optional(),
  default_branch: z.string().optional(),
});

export const CatalogEntrySchema = z.object({
  entry_id: z.string(),
  name: z.string(),
  type: z.string(),
  repo: z.string(),
  package_path: z.string(),
  promotion_tier: z.string(),
  description: z.string().optional(),
  version: z.string().optional(),
  owning_team: z.string().optional(),
  last_validation_date: z.string().optional(),
});

export const FailurePatternSchema = z.object({
  pattern_id: z.string(),
  name: z.string(),
  failure_type: z.string(),
  root_cause_category: z.string(),
  description: z.string().optional(),
  severity_range: z.string().optional(),
  frequency: z.number().optional(),
  first_observed: z.string().optional(),
});

export const FixPatternSchema = z.object({
  pattern_id: z.string(),
  name: z.string(),
  resolution_action: z.string(),
  description: z.string().optional(),
  success_rate: z.number().optional(),
  times_applied: z.number().optional(),
});

export type App = z.infer<typeof AppSchema>;
export type Feature = z.infer<typeof FeatureSchema>;
export type FeatureType = z.infer<typeof FeatureTypeSchema>;
export type Package = z.infer<typeof PackageSchema>;
export type Repo = z.infer<typeof RepoSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type FailurePattern = z.infer<typeof FailurePatternSchema>;
export type FixPattern = z.infer<typeof FixPatternSchema>;
