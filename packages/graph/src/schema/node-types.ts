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
