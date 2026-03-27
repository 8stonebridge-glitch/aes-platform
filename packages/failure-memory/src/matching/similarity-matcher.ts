import type { FailurePattern } from "../types/failure-pattern.js";

export interface SimilarityMatch {
  pattern: FailurePattern;
  score: number;
  match_reasons: string[];
}

/**
 * Find similar failure patterns based on failure_type + root_cause_category + tags.
 * Score: 1.0 = exact match on type+cause, 0.5 = partial match, 0.0 = no match.
 */
export function findSimilarPatterns(
  failureType: string,
  rootCause: string,
  tags: string[],
  knownPatterns: FailurePattern[]
): SimilarityMatch[] {
  return knownPatterns
    .map((pattern) => {
      let score = 0;
      const reasons: string[] = [];

      if (pattern.failure_type === failureType) {
        score += 0.4;
        reasons.push("Same failure type");
      }
      if (pattern.root_cause_category === rootCause) {
        score += 0.4;
        reasons.push("Same root cause");
      }

      const tagOverlap = tags.filter((t) => pattern.tags.includes(t));
      if (tagOverlap.length > 0) {
        score += 0.2 * (tagOverlap.length / Math.max(tags.length, 1));
        reasons.push(`Matching tags: ${tagOverlap.join(", ")}`);
      }

      return { pattern, score, match_reasons: reasons };
    })
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score);
}
