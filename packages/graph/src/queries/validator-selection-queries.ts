/**
 * Queries for validator selection — finding which validators apply
 * to a feature type, which rules govern modules, and test coverage.
 */

export function getValidatorsForFeature(featureType: string): string {
  return `
    MATCH (ft:FeatureType {type_id: $featureType})<-[:VALIDATES]-(vb:ValidatorBundle)
    RETURN vb
  `;
}

export function getRulesForFeatureType(featureType: string): string {
  return `
    MATCH (r:Rule)-[:APPLIES_TO]->(ft:FeatureType {type_id: $featureType})
    RETURN r
    ORDER BY
      CASE r.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
  `;
}

export function getHeuristicsForFailureType(failureType: string): string {
  return `
    MATCH (vh:ValidatorHeuristic {target_failure_type: $failureType})
    RETURN vh
    ORDER BY vh.false_positive_rate ASC
  `;
}

export function getPreventionRulesForGate(gate: string): string {
  return `
    MATCH (pr:PreventionRule {gate: $gate})
    RETURN pr
  `;
}

export function getTestCoverageForModule(moduleId: string): string {
  return `
    MATCH (m:Module {module_id: $moduleId})<-[:COVERED_BY]-(ts:TestSuite)
    RETURN m, ts, ts.coverage as coverage_pct
    ORDER BY ts.coverage DESC
  `;
}

export function getValidatorBundleWithScenarios(featureType: string): string {
  return `
    MATCH (vb:ValidatorBundle {feature_type: $featureType})
    OPTIONAL MATCH (sp:ScenarioPack {feature_type: $featureType})
    RETURN vb, sp
  `;
}
