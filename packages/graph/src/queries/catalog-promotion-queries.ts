/**
 * Queries for catalog promotion — finding promotion candidates,
 * counting successful uses, and managing promotion tiers.
 */

export function getCandidatesForPromotion(): string {
  return `
    MATCH (ce:CatalogEntry)
    WHERE ce.promotion_tier = 'DERIVED'
    AND EXISTS { MATCH (a:App)-[:USES]->(:Package {package_id: ce.entry_id}) }
    RETURN ce
  `;
}

export function countSuccessfulUses(entryId: string): string {
  return `
    MATCH (ce:CatalogEntry {entry_id: $entryId})<-[:CATALOG_MATCH]-(f:Feature)
    WHERE f.status = 'passed'
    RETURN count(f) as use_count
  `;
}

export function getPromotionHistory(entryId: string): string {
  return `
    MATCH (ce:CatalogEntry {entry_id: $entryId})
    OPTIONAL MATCH (ce)<-[:CATALOG_MATCH]-(f:Feature)
    OPTIONAL MATCH (f)<-[:FAILS_WITH]-(fp:FailurePattern)
    RETURN ce,
           count(DISTINCT f) as total_uses,
           count(DISTINCT CASE WHEN f.status = 'passed' THEN f END) as successful_uses,
           count(DISTINCT fp) as failure_count
  `;
}

export function getEntriesByPromotionTier(tier: string): string {
  return `
    MATCH (ce:CatalogEntry {promotion_tier: $tier})
    OPTIONAL MATCH (t:Team)-[:OWNS]->(:Package {package_id: ce.entry_id})
    RETURN ce, t.name as owning_team
    ORDER BY ce.name
  `;
}

export function getPackagePromotionReadiness(packageId: string): string {
  return `
    MATCH (p:Package {package_id: $packageId})
    OPTIONAL MATCH (p)-[:LIVES_IN]->(r:Repo)
    OPTIONAL MATCH (t:Team)-[:OWNS]->(p)
    OPTIONAL MATCH (m:Module {package_id: $packageId})<-[:COVERED_BY]-(ts:TestSuite)
    RETURN p, r, t,
           count(DISTINCT ts) as test_suite_count,
           avg(ts.coverage) as avg_coverage
  `;
}

export function findUnverifiedDependencies(packageId: string): string {
  return `
    MATCH (p:Package {package_id: $packageId})-[:REQUIRES*1..3]->(dep:Package)
    WHERE dep.promotion_tier NOT IN ['VERIFIED', 'CANONICAL']
    RETURN dep
  `;
}
