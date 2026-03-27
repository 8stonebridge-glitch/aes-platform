import { z } from "zod";
import {
  BridgeStatus,
  ReuseAssetType,
  RuleSeverity,
  TestType,
  DependencyStatus,
  HardVetoCode,
} from "./enums.js";

// ─── Sub-Schemas ──────────────────────────────────────────────────────

export const BuildScopeSchema = z.object({
  objective: z.string().min(1),
  included_capabilities: z.array(z.string()).min(1),
  excluded_capabilities: z.array(z.string()).default([]),
  acceptance_boundary: z.string().min(1),
});
export type BuildScope = z.infer<typeof BuildScopeSchema>;

export const ReadScopeSchema = z.object({
  allowed_repo_paths: z.array(z.string()).default([]),
  allowed_packages: z.array(z.string()).default([]),
  allowed_features: z.array(z.string()).default([]),
  allowed_graph_nodes: z.array(z.string()).default([]),
  allowed_artifacts: z.array(z.string()).default([]),
});
export type ReadScope = z.infer<typeof ReadScopeSchema>;

export const WriteScopeSchema = z.object({
  target_repo: z.string().min(1),
  allowed_repo_paths: z.array(z.string()).default([]),
  forbidden_repo_paths: z.array(z.string()).default([]),
  may_create_files: z.boolean(),
  may_modify_existing_files: z.boolean(),
  may_delete_files: z.boolean().default(false),
  may_change_shared_packages: z.boolean().default(false),
  may_change_schema: z.boolean().default(false),
});
export type WriteScope = z.infer<typeof WriteScopeSchema>;

export const ReuseCandidateSchema = z.object({
  candidate_id: z.string(),
  asset_type: ReuseAssetType,
  source_repo: z.string(),
  source_path: z.string(),
  name: z.string(),
  description: z.string(),
  fit_reason: z.string(),
  constraints: z.array(z.string()).default([]),
  selected: z.boolean().default(false),
});
export type ReuseCandidate = z.infer<typeof ReuseCandidateSchema>;

export const AppliedRuleSchema = z.object({
  rule_id: z.string(),
  title: z.string(),
  description: z.string(),
  severity: RuleSeverity,
  rationale: z.string(),
});
export type AppliedRule = z.infer<typeof AppliedRuleSchema>;

export const RequiredTestSchema = z.object({
  test_id: z.string(),
  name: z.string(),
  type: TestType,
  description: z.string(),
  pass_condition: z.string(),
});
export type RequiredTest = z.infer<typeof RequiredTestSchema>;

export const BridgeDependencySchema = z.object({
  dependency_id: z.string(),
  feature_id: z.string(),
  reason: z.string(),
  status: DependencyStatus,
});
export type BridgeDependency = z.infer<typeof BridgeDependencySchema>;

export const HardVetoTriggerSchema = z.object({
  code: HardVetoCode,
  triggered: z.boolean(),
  reason: z.string(),
  required_fix: z.string(),
});
export type HardVetoTrigger = z.infer<typeof HardVetoTriggerSchema>;

export const SuccessDefinitionSchema = z.object({
  user_visible_outcome: z.string().min(1),
  technical_outcome: z.string().min(1),
  validation_requirements: z.array(z.string()).default([]),
});
export type SuccessDefinition = z.infer<typeof SuccessDefinitionSchema>;

export const ConfidenceBreakdownSchema = z.object({
  scope_clarity: z.number().min(0).max(1),
  reuse_fit: z.number().min(0).max(1),
  dependency_clarity: z.number().min(0).max(1),
  rule_coverage: z.number().min(0).max(1),
  test_coverage: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
  notes: z.array(z.string()).default([]),
});
export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;

// ─── FeatureBridge — Gate 2 Output ────────────────────────────────────
// This is the ONLY artifact the builder sees.

export const FeatureBridgeSchema = z.object({
  bridge_id: z.string().uuid(),
  app_id: z.string().uuid(),
  app_spec_id: z.string().uuid(),
  feature_id: z.string(),
  feature_name: z.string(),

  status: BridgeStatus,

  build_scope: BuildScopeSchema,
  read_scope: ReadScopeSchema,
  write_scope: WriteScopeSchema,

  reuse_candidates: z.array(ReuseCandidateSchema).default([]),
  selected_reuse_assets: z.array(z.string()).default([]),

  applied_rules: z.array(AppliedRuleSchema).default([]),
  required_tests: z.array(RequiredTestSchema).default([]),
  dependencies: z.array(BridgeDependencySchema).default([]),

  hard_vetoes: z.array(HardVetoTriggerSchema).default([]),

  blocked_reason: z.string().nullable().default(null),

  success_definition: SuccessDefinitionSchema,

  confidence: ConfidenceBreakdownSchema,

  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type FeatureBridge = z.infer<typeof FeatureBridgeSchema>;
