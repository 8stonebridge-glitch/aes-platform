-- AES v12 Platform — Full schema migration.
-- Idempotent: uses CREATE TABLE IF NOT EXISTS so safe to run against existing databases.

-- ─── Intent Briefs (Gate 0 output) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS intent_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  raw_request TEXT NOT NULL,
  inferred_app_class TEXT,
  inferred_primary_users TEXT[],
  inferred_core_outcome TEXT,
  inferred_platforms TEXT[],
  inferred_risk_class TEXT,
  inferred_integrations TEXT[],
  explicit_inclusions TEXT[],
  explicit_exclusions TEXT[],
  ambiguity_flags TEXT[],
  assumptions TEXT[],
  confirmation_statement TEXT,
  confirmation_status TEXT NOT NULL DEFAULT 'pending',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intent_briefs_request_id ON intent_briefs(request_id);
CREATE INDEX IF NOT EXISTS idx_intent_briefs_status ON intent_briefs(confirmation_status);

-- ─── App Specs (Gate 1 output) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS app_specs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  request_id UUID NOT NULL,
  intent_brief_id UUID REFERENCES intent_briefs(id),
  title TEXT NOT NULL,
  summary TEXT,
  app_class TEXT,
  risk_class TEXT,
  spec_data JSONB NOT NULL,
  confidence_overall NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_specs_app_id ON app_specs(app_id);
CREATE INDEX IF NOT EXISTS idx_app_specs_request_id ON app_specs(request_id);

-- ─── Feature Bridges (Gate 2 output) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id UUID NOT NULL UNIQUE,
  app_id UUID NOT NULL,
  app_spec_id UUID REFERENCES app_specs(id),
  feature_id TEXT NOT NULL,
  feature_name TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  bridge_data JSONB NOT NULL,
  confidence_overall NUMERIC,
  version INTEGER NOT NULL DEFAULT 1,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_bridges_app_id ON feature_bridges(app_id);
CREATE INDEX IF NOT EXISTS idx_feature_bridges_bridge_id ON feature_bridges(bridge_id);
CREATE INDEX IF NOT EXISTS idx_feature_bridges_feature_id ON feature_bridges(feature_id);

-- ─── Veto Results (Gate 3 output) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS veto_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id UUID NOT NULL REFERENCES feature_bridges(id),
  any_triggered BOOLEAN NOT NULL DEFAULT false,
  triggered_codes TEXT[],
  result_data JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_veto_results_bridge_id ON veto_results(bridge_id);

-- ─── User Approvals ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id UUID NOT NULL,
  app_spec_id UUID REFERENCES app_specs(id),
  approval_type TEXT NOT NULL,
  approved BOOLEAN NOT NULL,
  user_comment TEXT,
  presented_data JSONB,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_approvals_app_id ON user_approvals(app_id);

-- ─── Build Logs ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS build_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT NOT NULL,
  gate TEXT,
  feature_id TEXT,
  message TEXT NOT NULL,
  level TEXT NOT NULL DEFAULT 'info',
  error_code TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_build_logs_job_id ON build_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_gate ON build_logs(job_id, gate);

-- ─── Job Snapshots (runtime state) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_snapshots (
  job_id TEXT PRIMARY KEY,
  request_id TEXT,
  raw_request TEXT,
  current_gate TEXT,
  intent_confirmed BOOLEAN,
  user_approved BOOLEAN,
  deploy_target TEXT,
  autonomous BOOLEAN,
  target_path TEXT,
  preview_url TEXT,
  deployment_url TEXT,
  error_message TEXT,
  design_mode TEXT,
  design_brief JSONB,
  design_evidence JSONB,
  feature_build_order TEXT[],
  feature_build_index INTEGER,
  feature_bridges JSONB,
  validator_results JSONB,
  build_results JSONB,
  last_log_at TIMESTAMPTZ,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_snapshots_updated_at ON job_snapshots(updated_at DESC);

-- ─── Job Checkpoints (resume metadata) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS job_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checkpoint_id TEXT NOT NULL UNIQUE,
  job_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  last_successful_gate TEXT,
  workspace_path TEXT,
  feature_ids TEXT[] DEFAULT '{}',
  contract_packs TEXT[] DEFAULT '{}',
  archetypes TEXT[] DEFAULT '{}',
  env_snapshot JSONB,
  artifacts JSONB,
  raw_error TEXT,
  summarized_error TEXT,
  resume_eligible BOOLEAN DEFAULT false,
  resume_reason TEXT,
  invalidation_scope TEXT[] DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_checkpoints_job_id ON job_checkpoints(job_id);
CREATE INDEX IF NOT EXISTS idx_job_checkpoints_gate ON job_checkpoints(gate);
CREATE INDEX IF NOT EXISTS idx_job_checkpoints_created_at ON job_checkpoints(created_at DESC);

-- ─── Fix Trails ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fix_trails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  gate TEXT NOT NULL,
  error_code TEXT NOT NULL,
  issue_summary TEXT NOT NULL,
  root_cause TEXT NOT NULL,
  repair_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'detected',
  related_artifact_ids TEXT[] DEFAULT '{}',
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fix_trails_job_id ON fix_trails(job_id);
CREATE INDEX IF NOT EXISTS idx_fix_trails_error_code ON fix_trails(error_code);
CREATE INDEX IF NOT EXISTS idx_fix_trails_status ON fix_trails(status);

-- ─── Builder Runs ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS builder_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  bridge_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  feature_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready_for_build',
  input_package_hash TEXT NOT NULL,
  builder_package JSONB NOT NULL,
  files_created TEXT[] DEFAULT '{}',
  files_modified TEXT[] DEFAULT '{}',
  files_deleted TEXT[] DEFAULT '{}',
  test_results JSONB DEFAULT '[]',
  acceptance_coverage JSONB DEFAULT '{}',
  scope_violations TEXT[] DEFAULT '{}',
  constraint_violations TEXT[] DEFAULT '{}',
  verification_passed BOOLEAN DEFAULT false,
  failure_reason TEXT,
  builder_model TEXT,
  duration_ms INTEGER DEFAULT 0,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_builder_runs_job_id ON builder_runs(job_id);
CREATE INDEX IF NOT EXISTS idx_builder_runs_status ON builder_runs(status);
CREATE INDEX IF NOT EXISTS idx_builder_runs_feature_id ON builder_runs(feature_id);

-- Workspace columns for code-builder
DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS workspace_id TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS branch TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS base_commit TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS final_commit TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS diff_summary TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS pr_summary TEXT;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── Schema version migration for pre-existing tables ──────────────────
-- These are safe no-ops if the column already exists (Postgres 11+).

DO $$ BEGIN
  ALTER TABLE intent_briefs ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE app_specs ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE feature_bridges ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE veto_results ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE user_approvals ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE build_logs ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── Check results column for builder_runs ──────────────────────────────
DO $$ BEGIN
  ALTER TABLE builder_runs ADD COLUMN IF NOT EXISTS check_results JSONB DEFAULT '[]';
EXCEPTION WHEN OTHERS THEN NULL; END $$;
