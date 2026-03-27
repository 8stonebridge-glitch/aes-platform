import type { FailurePattern } from "../types/failure-pattern.js";
import type { FixPattern } from "../types/fix-pattern.js";
import type { IncidentExample } from "../types/incident-example.js";
import type { SimilarityMatch } from "../matching/similarity-matcher.js";
import { findSimilarPatterns } from "../matching/similarity-matcher.js";

export interface IncidentLink {
  incident: IncidentExample;
  matched_pattern: FailurePattern | null;
  match_score: number;
  suggested_fix_pattern_id: string | null;
}

/**
 * Link an incident to known failure patterns and optionally suggest a fix.
 * Uses the similarity matcher to find the best pattern match, then
 * checks if any known fix targets that pattern.
 */
export function linkIncident(
  incident: IncidentExample,
  knownPatterns: FailurePattern[],
  knownFixes: FixPattern[]
): IncidentLink {
  // If the incident already has a failure_pattern_id, find it directly
  const directMatch = knownPatterns.find(
    (p) => p.pattern_id === incident.failure_pattern_id
  );

  if (directMatch) {
    const applicableFix = knownFixes.find((f) =>
      f.target_failure_patterns.includes(directMatch.pattern_id)
    );

    return {
      incident,
      matched_pattern: directMatch,
      match_score: 1.0,
      suggested_fix_pattern_id: applicableFix?.pattern_id ?? null,
    };
  }

  // Otherwise, try similarity matching from tags
  const matches: SimilarityMatch[] = findSimilarPatterns(
    "", // unknown failure type
    "", // unknown root cause
    incident.tags,
    knownPatterns
  );

  if (matches.length === 0) {
    return {
      incident,
      matched_pattern: null,
      match_score: 0,
      suggested_fix_pattern_id: null,
    };
  }

  const bestMatch = matches[0];
  const applicableFix = knownFixes.find((f) =>
    f.target_failure_patterns.includes(bestMatch.pattern.pattern_id)
  );

  return {
    incident,
    matched_pattern: bestMatch.pattern,
    match_score: bestMatch.score,
    suggested_fix_pattern_id: applicableFix?.pattern_id ?? null,
  };
}

/**
 * Update failure pattern frequency and observation timestamps
 * based on a linked incident.
 */
export function updatePatternFromIncident(
  pattern: FailurePattern,
  incident: IncidentExample
): FailurePattern {
  return {
    ...pattern,
    frequency: pattern.frequency + 1,
    first_observed: pattern.first_observed ?? incident.occurred_at,
    last_observed: incident.occurred_at,
  };
}

/**
 * Update fix pattern application count when a fix is used to resolve an incident.
 */
export function recordFixApplication(
  fix: FixPattern,
  success: boolean
): FixPattern {
  const newTimesApplied = fix.times_applied + 1;
  const newSuccessRate =
    (fix.success_rate * fix.times_applied + (success ? 1 : 0)) / newTimesApplied;

  return {
    ...fix,
    times_applied: newTimesApplied,
    success_rate: newSuccessRate,
  };
}
