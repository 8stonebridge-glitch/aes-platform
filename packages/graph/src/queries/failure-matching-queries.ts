/**
 * Queries for failure matching — finding similar past failures,
 * known fixes, and prevention rules to accelerate recovery.
 */

export function findSimilarFailures(failureType: string, rootCause: string): string {
  return `
    MATCH (fp:FailurePattern)
    WHERE fp.failure_type = $failureType
    AND fp.root_cause_category = $rootCause
    OPTIONAL MATCH (fp)-[:FIXED_BY]->(fix:FixPattern)
    RETURN fp, fix
    ORDER BY fix.success_rate DESC
    LIMIT 5
  `;
}

export function findFailuresForApp(appId: string): string {
  return `
    MATCH (fp:FailurePattern)-[:OBSERVED_IN]->(a:App {app_id: $appId})
    OPTIONAL MATCH (fp)-[:FIXED_BY]->(fix:FixPattern)
    OPTIONAL MATCH (fp)-[:PREVENTED_BY]->(pr:PreventionRule)
    RETURN fp, collect(DISTINCT fix) as fixes, collect(DISTINCT pr) as preventions
    ORDER BY fp.frequency DESC
  `;
}

export function findRelatedFailures(patternId: string): string {
  return `
    MATCH (fp:FailurePattern {pattern_id: $patternId})-[:SIMILAR_TO]-(related:FailurePattern)
    OPTIONAL MATCH (related)-[:FIXED_BY]->(fix:FixPattern)
    RETURN related, fix
    ORDER BY related.frequency DESC
    LIMIT 10
  `;
}

export function getFailureToRuleMapping(failureType: string): string {
  return `
    MATCH (fp:FailurePattern {failure_type: $failureType})-[:TRIGGERED_BY]->(r:Rule)
    RETURN fp, r
  `;
}

export function getMostEffectiveFixes(failureType: string): string {
  return `
    MATCH (fp:FailurePattern {failure_type: $failureType})-[rel:FIXED_BY]->(fix:FixPattern)
    RETURN fix, rel.success_rate as success_rate, count(fp) as pattern_count
    ORDER BY fix.success_rate DESC, pattern_count DESC
    LIMIT 5
  `;
}

export function getDetectionCoverage(failureType: string): string {
  return `
    MATCH (fp:FailurePattern {failure_type: $failureType})
    OPTIONAL MATCH (fp)-[:DETECTED_BY]->(vh:ValidatorHeuristic)
    OPTIONAL MATCH (fp)-[:PREVENTED_BY]->(pr:PreventionRule)
    RETURN fp.pattern_id as pattern_id,
           fp.name as name,
           count(DISTINCT vh) as heuristic_count,
           count(DISTINCT pr) as prevention_count
  `;
}
