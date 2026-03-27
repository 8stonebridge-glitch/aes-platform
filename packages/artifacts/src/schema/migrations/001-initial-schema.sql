-- AES v12 Artifact Store
-- All artifacts are immutable. New versions reference parents via parent_id.
-- No UPDATE or DELETE operations on artifact tables (enforced by application layer).

-- ─── Intent Briefs (Gate 0) ───────────────────────────────────────────

CREATE TABLE intent_briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      UUID NOT NULL,
  raw_request     TEXT NOT NULL,

  inferred_app_class    TEXT NOT NULL,
  inferred_primary_users TEXT[] NOT NULL DEFAULT '{}',
  inferred_core_outcome TEXT NOT NULL,
  inferred_platforms    TEXT[] NOT NULL DEFAULT '{}',
  inferred_risk_class   TEXT NOT NULL,
  inferred_integrations TEXT[] DEFAULT '{}',

  explicit_inclusions   TEXT[] DEFAULT '{}',
  explicit_exclusions   TEXT[] DEFAULT '{}',

  ambiguity_flags       TEXT[] DEFAULT '{}',
  assumptions           TEXT[] DEFAULT '{}',

  confirmation_statement TEXT NOT NULL,
  confirmation_status    TEXT NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intent_briefs_request_id ON intent_briefs(request_id);
CREATE INDEX idx_intent_briefs_status ON intent_briefs(confirmation_status);

-- ─── App Specs (Gate 1) ───────────────────────────────────────────────

CREATE TABLE app_specs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  request_id      UUID NOT NULL,
  intent_brief_id UUID NOT NULL REFERENCES intent_briefs(id),

  title           TEXT NOT NULL,
  summary         TEXT NOT NULL,
  app_class       TEXT NOT NULL,
  risk_class      TEXT NOT NULL,

  spec_data       JSONB NOT NULL,

  confidence_overall FLOAT NOT NULL,

  parent_id       UUID REFERENCES app_specs(id),
  version         INTEGER NOT NULL DEFAULT 1,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_app_specs_app_id ON app_specs(app_id);
CREATE INDEX idx_app_specs_request_id ON app_specs(request_id);

-- ─── Feature Bridges (Gate 2) ─────────────────────────────────────────

CREATE TABLE feature_bridges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id       UUID NOT NULL,
  app_id          UUID NOT NULL,
  app_spec_id     UUID NOT NULL REFERENCES app_specs(id),
  feature_id      TEXT NOT NULL,
  feature_name    TEXT NOT NULL,

  status          TEXT NOT NULL DEFAULT 'draft',

  bridge_data     JSONB NOT NULL,

  confidence_overall FLOAT NOT NULL,

  parent_id       UUID REFERENCES feature_bridges(id),
  version         INTEGER NOT NULL DEFAULT 1,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridges_app_id ON feature_bridges(app_id);
CREATE INDEX idx_bridges_feature_id ON feature_bridges(feature_id);
CREATE INDEX idx_bridges_status ON feature_bridges(status);

-- ─── Veto Results (Gate 3) ────────────────────────────────────────────

CREATE TABLE veto_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id       UUID NOT NULL REFERENCES feature_bridges(id),

  any_triggered   BOOLEAN NOT NULL,
  triggered_codes TEXT[] DEFAULT '{}',

  result_data     JSONB NOT NULL,

  evaluated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_veto_results_bridge_id ON veto_results(bridge_id);

-- ─── Validator Results ────────────────────────────────────────────────

CREATE TABLE validator_results (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_id       UUID NOT NULL REFERENCES feature_bridges(id),
  build_run_id    UUID NOT NULL,

  validator_name  TEXT NOT NULL,
  validator_tier  TEXT NOT NULL,

  verdict         TEXT NOT NULL,

  evidence        JSONB NOT NULL,
  concerns        TEXT[] DEFAULT '{}',

  execution_time_ms INTEGER,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_validator_results_bridge_id ON validator_results(bridge_id);
CREATE INDEX idx_validator_results_build_run_id ON validator_results(build_run_id);
CREATE INDEX idx_validator_results_verdict ON validator_results(verdict);

-- ─── Catalog Admission Results (Gate 4) ───────────────────────────────

CREATE TABLE catalog_admissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    TEXT NOT NULL,
  source_app_id   UUID NOT NULL,
  source_feature_id TEXT NOT NULL,

  asset_type      TEXT NOT NULL,
  asset_name      TEXT NOT NULL,

  decision        TEXT NOT NULL,
  reasons         TEXT[] DEFAULT '{}',
  missing_requirements TEXT[] DEFAULT '{}',
  next_actions    TEXT[] DEFAULT '{}',

  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_catalog_admissions_decision ON catalog_admissions(decision);

-- ─── Fix Trail (Gate 5) ──────────────────────────────────────────────

CREATE TABLE fix_trails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_id      UUID NOT NULL,
  app_id          UUID NOT NULL,
  feature_id      TEXT NOT NULL,
  build_id        UUID NOT NULL,

  stage           TEXT NOT NULL,
  failure_type    TEXT NOT NULL,
  root_cause_category TEXT NOT NULL,
  symptom         TEXT NOT NULL,
  affected_surface TEXT NOT NULL,
  severity        TEXT NOT NULL,

  first_detector  TEXT NOT NULL,

  resolution_action TEXT NOT NULL,
  resolution_detail TEXT NOT NULL,
  reused_fix_pattern BOOLEAN NOT NULL DEFAULT false,

  validation_after_fix TEXT NOT NULL,

  promoted_to_catalog_candidate BOOLEAN NOT NULL DEFAULT false,
  prevented_by_existing_rule BOOLEAN NOT NULL DEFAULT false,

  similar_past_failures UUID[] DEFAULT '{}',

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE INDEX idx_fix_trails_app_id ON fix_trails(app_id);
CREATE INDEX idx_fix_trails_failure_type ON fix_trails(failure_type);
CREATE INDEX idx_fix_trails_root_cause ON fix_trails(root_cause_category);
CREATE INDEX idx_fix_trails_stage ON fix_trails(stage);

-- ─── Deployment Records ───────────────────────────────────────────────

CREATE TABLE deployments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  app_spec_id     UUID NOT NULL REFERENCES app_specs(id),

  environment     TEXT NOT NULL,
  url             TEXT NOT NULL,
  vercel_deployment_id TEXT,

  status          TEXT NOT NULL,

  commit_sha      TEXT NOT NULL,
  branch          TEXT NOT NULL,

  deployed_at     TIMESTAMPTZ,
  rolled_back_at  TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deployments_app_id ON deployments(app_id);
CREATE INDEX idx_deployments_status ON deployments(status);

-- ─── Build Runs ───────────────────────────────────────────────────────

CREATE TABLE build_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL,
  app_id          UUID NOT NULL,
  bridge_id       UUID NOT NULL REFERENCES feature_bridges(id),
  feature_id      TEXT NOT NULL,

  status          TEXT NOT NULL,

  pr_number       INTEGER,
  pr_url          TEXT,
  branch          TEXT NOT NULL,
  commit_sha      TEXT,

  builder_model   TEXT,
  builder_duration_ms INTEGER,

  reuse_assets_used TEXT[] DEFAULT '{}',
  files_created   TEXT[] DEFAULT '{}',
  files_modified  TEXT[] DEFAULT '{}',

  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_build_runs_app_id ON build_runs(app_id);
CREATE INDEX idx_build_runs_status ON build_runs(status);
CREATE INDEX idx_build_runs_bridge_id ON build_runs(bridge_id);

-- ─── User Approvals ──────────────────────────────────────────────────

CREATE TABLE user_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  app_id          UUID NOT NULL,
  app_spec_id     UUID NOT NULL REFERENCES app_specs(id),

  approval_type   TEXT NOT NULL,

  approved        BOOLEAN NOT NULL,
  user_comment    TEXT,

  presented_data  JSONB NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_approvals_app_id ON user_approvals(app_id);
