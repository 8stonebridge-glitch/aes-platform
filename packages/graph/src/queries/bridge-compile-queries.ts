/**
 * Queries for bridge compilation — finding reuse candidates,
 * checking dependencies, and resolving package requirements.
 */

export function findReuseCandidates(featureType: string, tags: string[]): string {
  return `
    MATCH (ce:CatalogEntry)
    WHERE ce.type IN ['package', 'component', 'module', 'workflow']
    AND ANY(tag IN ce.tags WHERE tag IN $tags)
    AND ce.promotion_tier IN ['VERIFIED', 'CANONICAL']
    RETURN ce
    ORDER BY
      CASE ce.promotion_tier WHEN 'CANONICAL' THEN 0 WHEN 'VERIFIED' THEN 1 ELSE 2 END
    LIMIT 20
  `;
}

export function checkDependencySatisfied(featureId: string): string {
  return `
    MATCH (f:Feature {feature_id: $featureId})-[:DEPENDS_ON]->(dep:Feature)
    WHERE dep.status <> 'passed'
    RETURN dep
  `;
}

export function resolvePackageDependencies(packageId: string): string {
  return `
    MATCH path = (p:Package {package_id: $packageId})-[:REQUIRES*1..5]->(dep:Package)
    RETURN path
  `;
}

export function findPackagesForFeatureType(featureType: string): string {
  return `
    MATCH (ft:FeatureType {type_id: $featureType})<-[:VALIDATES]-(vb:ValidatorBundle)
    OPTIONAL MATCH (pat:Pattern {type: $featureType})-[:SOURCED_FROM]->(ce:CatalogEntry)
    WITH ft, vb, collect(ce) as catalog_entries
    RETURN ft, vb, catalog_entries
  `;
}

export function getBridgePresetWithDependencies(featureType: string): string {
  return `
    MATCH (bp:BridgePreset {feature_type: $featureType})
    OPTIONAL MATCH (pat:Pattern {type: $featureType})-[:SOURCED_FROM]->(ce:CatalogEntry)
    OPTIONAL MATCH (ce)-[:LIVES_IN]->(r:Repo)
    RETURN bp, collect(DISTINCT {entry: ce, repo: r}) as catalog_sources
  `;
}

export function findBlockingFeatures(featureId: string): string {
  return `
    MATCH (blocker:Feature)-[:BLOCKS]->(f:Feature {feature_id: $featureId})
    WHERE blocker.status <> 'passed'
    RETURN blocker
  `;
}

export function getPackageOwnership(packageId: string): string {
  return `
    MATCH (t:Team)-[:OWNS]->(p:Package {package_id: $packageId})
    OPTIONAL MATCH (p)-[:LIVES_IN]->(r:Repo)
    RETURN t, p, r
  `;
}
