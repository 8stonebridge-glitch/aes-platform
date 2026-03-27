// ============================================================
// AES Graph — Uniqueness Constraints
// ============================================================

CREATE CONSTRAINT app_id_unique IF NOT EXISTS FOR (a:App) REQUIRE a.app_id IS UNIQUE;
CREATE CONSTRAINT feature_id_unique IF NOT EXISTS FOR (f:Feature) REQUIRE f.feature_id IS UNIQUE;
CREATE CONSTRAINT feature_type_id_unique IF NOT EXISTS FOR (ft:FeatureType) REQUIRE ft.type_id IS UNIQUE;
CREATE CONSTRAINT package_id_unique IF NOT EXISTS FOR (p:Package) REQUIRE p.package_id IS UNIQUE;
CREATE CONSTRAINT repo_id_unique IF NOT EXISTS FOR (r:Repo) REQUIRE r.repo_id IS UNIQUE;
CREATE CONSTRAINT module_id_unique IF NOT EXISTS FOR (m:Module) REQUIRE m.module_id IS UNIQUE;
CREATE CONSTRAINT rule_id_unique IF NOT EXISTS FOR (r:Rule) REQUIRE r.rule_id IS UNIQUE;
CREATE CONSTRAINT test_suite_id_unique IF NOT EXISTS FOR (ts:TestSuite) REQUIRE ts.suite_id IS UNIQUE;
CREATE CONSTRAINT pr_id_unique IF NOT EXISTS FOR (pr:PR) REQUIRE pr.pr_id IS UNIQUE;
CREATE CONSTRAINT pattern_id_unique IF NOT EXISTS FOR (p:Pattern) REQUIRE p.pattern_id IS UNIQUE;
CREATE CONSTRAINT team_id_unique IF NOT EXISTS FOR (t:Team) REQUIRE t.team_id IS UNIQUE;
CREATE CONSTRAINT job_id_unique IF NOT EXISTS FOR (j:Job) REQUIRE j.job_id IS UNIQUE;
CREATE CONSTRAINT artifact_id_unique IF NOT EXISTS FOR (a:Artifact) REQUIRE a.artifact_id IS UNIQUE;
CREATE CONSTRAINT validator_bundle_id_unique IF NOT EXISTS FOR (vb:ValidatorBundle) REQUIRE vb.bundle_id IS UNIQUE;
CREATE CONSTRAINT bridge_preset_id_unique IF NOT EXISTS FOR (bp:BridgePreset) REQUIRE bp.preset_id IS UNIQUE;
CREATE CONSTRAINT scenario_pack_id_unique IF NOT EXISTS FOR (sp:ScenarioPack) REQUIRE sp.pack_id IS UNIQUE;
CREATE CONSTRAINT catalog_entry_id_unique IF NOT EXISTS FOR (ce:CatalogEntry) REQUIRE ce.entry_id IS UNIQUE;
CREATE CONSTRAINT convex_schema_id_unique IF NOT EXISTS FOR (cs:ConvexSchema) REQUIRE cs.schema_id IS UNIQUE;
CREATE CONSTRAINT reference_schema_id_unique IF NOT EXISTS FOR (rs:ReferenceSchema) REQUIRE rs.schema_id IS UNIQUE;
CREATE CONSTRAINT failure_pattern_id_unique IF NOT EXISTS FOR (fp:FailurePattern) REQUIRE fp.pattern_id IS UNIQUE;
CREATE CONSTRAINT fix_pattern_id_unique IF NOT EXISTS FOR (fp:FixPattern) REQUIRE fp.pattern_id IS UNIQUE;
CREATE CONSTRAINT prevention_rule_id_unique IF NOT EXISTS FOR (pr:PreventionRule) REQUIRE pr.rule_id IS UNIQUE;
CREATE CONSTRAINT validator_heuristic_id_unique IF NOT EXISTS FOR (vh:ValidatorHeuristic) REQUIRE vh.heuristic_id IS UNIQUE;

// ============================================================
// AES Graph — Indexes for Common Queries
// ============================================================

CREATE INDEX app_class_idx IF NOT EXISTS FOR (a:App) ON (a.app_class);
CREATE INDEX app_status_idx IF NOT EXISTS FOR (a:App) ON (a.status);
CREATE INDEX feature_status_idx IF NOT EXISTS FOR (f:Feature) ON (f.status);
CREATE INDEX feature_app_idx IF NOT EXISTS FOR (f:Feature) ON (f.app_id);
CREATE INDEX feature_priority_idx IF NOT EXISTS FOR (f:Feature) ON (f.priority);
CREATE INDEX package_name_idx IF NOT EXISTS FOR (p:Package) ON (p.name);
CREATE INDEX package_promotion_idx IF NOT EXISTS FOR (p:Package) ON (p.promotion_tier);
CREATE INDEX repo_name_idx IF NOT EXISTS FOR (r:Repo) ON (r.name);
CREATE INDEX rule_code_idx IF NOT EXISTS FOR (r:Rule) ON (r.code);
CREATE INDEX rule_gate_idx IF NOT EXISTS FOR (r:Rule) ON (r.gate);
CREATE INDEX pattern_name_idx IF NOT EXISTS FOR (p:Pattern) ON (p.name);
CREATE INDEX pattern_type_idx IF NOT EXISTS FOR (p:Pattern) ON (p.type);
CREATE INDEX job_status_idx IF NOT EXISTS FOR (j:Job) ON (j.status);
CREATE INDEX job_type_idx IF NOT EXISTS FOR (j:Job) ON (j.type);
CREATE INDEX artifact_type_idx IF NOT EXISTS FOR (a:Artifact) ON (a.type);
CREATE INDEX catalog_entry_name_idx IF NOT EXISTS FOR (ce:CatalogEntry) ON (ce.name);
CREATE INDEX catalog_entry_type_idx IF NOT EXISTS FOR (ce:CatalogEntry) ON (ce.type);
CREATE INDEX catalog_entry_promotion_idx IF NOT EXISTS FOR (ce:CatalogEntry) ON (ce.promotion_tier);
CREATE INDEX failure_pattern_type_idx IF NOT EXISTS FOR (fp:FailurePattern) ON (fp.failure_type);
CREATE INDEX failure_pattern_root_cause_idx IF NOT EXISTS FOR (fp:FailurePattern) ON (fp.root_cause_category);
CREATE INDEX fix_pattern_action_idx IF NOT EXISTS FOR (fp:FixPattern) ON (fp.resolution_action);
CREATE INDEX prevention_rule_gate_idx IF NOT EXISTS FOR (pr:PreventionRule) ON (pr.gate);
CREATE INDEX validator_heuristic_tier_idx IF NOT EXISTS FOR (vh:ValidatorHeuristic) ON (vh.validator_tier);
