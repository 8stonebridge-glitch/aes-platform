/**
 * Queries for feature decomposition — finding similar features,
 * existing patterns, and feature-type metadata during planning.
 */

export function findSimilarFeatures(featureName: string, appClass: string): string {
  return `
    MATCH (f:Feature)-[:IMPLEMENTED_BY]->(p:Package)
    WHERE f.name CONTAINS $featureName
    AND EXISTS { MATCH (a:App)-[:USES]->(p) WHERE a.app_class = $appClass }
    RETURN f, p
    ORDER BY f.priority
    LIMIT 10
  `;
}

export function findExistingPatterns(featureType: string): string {
  return `
    MATCH (ft:FeatureType {type_id: $featureType})<-[:VALIDATES]-(vb:ValidatorBundle)
    OPTIONAL MATCH (ft)<-[:APPLIES_TO]-(r:Rule)
    RETURN ft, vb, collect(r) as rules
  `;
}

export function findPatternsForFeatureType(featureType: string): string {
  return `
    MATCH (pat:Pattern {type: $featureType})
    OPTIONAL MATCH (pat)-[:SOURCED_FROM]->(ce:CatalogEntry)
    RETURN pat, ce
    ORDER BY
      CASE pat.promotion_tier WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END
  `;
}

export function getFeatureTypeMetadata(featureType: string): string {
  return `
    MATCH (ft:FeatureType {type_id: $featureType})
    OPTIONAL MATCH (ft)<-[:VALIDATES]-(vb:ValidatorBundle)
    OPTIONAL MATCH (bp:BridgePreset {feature_type: $featureType})
    OPTIONAL MATCH (sp:ScenarioPack {feature_type: $featureType})
    RETURN ft, vb, bp, sp
  `;
}

export function findFeaturesForApp(appId: string): string {
  return `
    MATCH (f:Feature {app_id: $appId})
    OPTIONAL MATCH (f)-[:DEPENDS_ON]->(dep:Feature)
    OPTIONAL MATCH (f)-[:IMPLEMENTED_BY]->(p:Package)
    RETURN f, collect(DISTINCT dep) as dependencies, collect(DISTINCT p) as packages
    ORDER BY f.priority
  `;
}

export function findFeatureDependencyChain(featureId: string): string {
  return `
    MATCH path = (f:Feature {feature_id: $featureId})-[:DEPENDS_ON*1..5]->(dep:Feature)
    RETURN path
  `;
}
