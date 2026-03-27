// ─── Intent Briefs (Gate 0) ───────────────────────────────────────────

export interface IntentBriefRecord {
  id: string;
  request_id: string;
  raw_request: string;
  inferred_app_class: string;
  inferred_primary_users: string[];
  inferred_core_outcome: string;
  inferred_platforms: string[];
  inferred_risk_class: string;
  inferred_integrations: string[];
  explicit_inclusions: string[];
  explicit_exclusions: string[];
  ambiguity_flags: string[];
  assumptions: string[];
  confirmation_statement: string;
  confirmation_status: string;
  created_at: Date;
  updated_at: Date;
}

// ─── App Specs (Gate 1) ───────────────────────────────────────────────

export interface AppSpecRecord {
  id: string;
  app_id: string;
  request_id: string;
  intent_brief_id: string;
  title: string;
  summary: string;
  app_class: string;
  risk_class: string;
  spec_data: Record<string, unknown>;
  confidence_overall: number;
  parent_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

// ─── Feature Bridges (Gate 2) ─────────────────────────────────────────

export interface FeatureBridgeRecord {
  id: string;
  bridge_id: string;
  app_id: string;
  app_spec_id: string;
  feature_id: string;
  feature_name: string;
  status: string;
  bridge_data: Record<string, unknown>;
  confidence_overall: number;
  parent_id: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

// ─── Veto Results (Gate 3) ────────────────────────────────────────────

export interface VetoResultRecord {
  id: string;
  bridge_id: string;
  any_triggered: boolean;
  triggered_codes: string[];
  result_data: Record<string, unknown>;
  evaluated_at: Date;
}

// ─── Validator Results ────────────────────────────────────────────────

export interface ValidatorResultRecord {
  id: string;
  bridge_id: string;
  build_run_id: string;
  validator_name: string;
  validator_tier: string;
  verdict: string;
  evidence: Record<string, unknown>;
  concerns: string[];
  execution_time_ms: number | null;
  created_at: Date;
}

// ─── Catalog Admissions (Gate 4) ──────────────────────────────────────

export interface CatalogAdmissionRecord {
  id: string;
  candidate_id: string;
  source_app_id: string;
  source_feature_id: string;
  asset_type: string;
  asset_name: string;
  decision: string;
  reasons: string[];
  missing_requirements: string[];
  next_actions: string[];
  reviewed_at: Date;
}

// ─── Fix Trails (Gate 5) ─────────────────────────────────────────────

export interface FixTrailRecord {
  id: string;
  failure_id: string;
  app_id: string;
  feature_id: string;
  build_id: string;
  stage: string;
  failure_type: string;
  root_cause_category: string;
  symptom: string;
  affected_surface: string;
  severity: string;
  first_detector: string;
  resolution_action: string;
  resolution_detail: string;
  reused_fix_pattern: boolean;
  validation_after_fix: string;
  promoted_to_catalog_candidate: boolean;
  prevented_by_existing_rule: boolean;
  similar_past_failures: string[];
  created_at: Date;
  resolved_at: Date | null;
}

// ─── Deployments ──────────────────────────────────────────────────────

export interface DeploymentRecord {
  id: string;
  app_id: string;
  app_spec_id: string;
  environment: string;
  url: string;
  vercel_deployment_id: string | null;
  status: string;
  commit_sha: string;
  branch: string;
  deployed_at: Date | null;
  rolled_back_at: Date | null;
  created_at: Date;
}

// ─── Build Runs ───────────────────────────────────────────────────────

export interface BuildRunRecord {
  id: string;
  job_id: string;
  app_id: string;
  bridge_id: string;
  feature_id: string;
  status: string;
  pr_number: number | null;
  pr_url: string | null;
  branch: string;
  commit_sha: string | null;
  builder_model: string | null;
  builder_duration_ms: number | null;
  reuse_assets_used: string[];
  files_created: string[];
  files_modified: string[];
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

// ─── User Approvals ──────────────────────────────────────────────────

export interface UserApprovalRecord {
  id: string;
  app_id: string;
  app_spec_id: string;
  approval_type: string;
  approved: boolean;
  user_comment: string | null;
  presented_data: Record<string, unknown>;
  created_at: Date;
}
