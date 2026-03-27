import type { FixPattern } from "../types/fix-pattern.js";
import type { SimilarityMatch } from "./similarity-matcher.js";

export interface FixSuggestion {
  fix: FixPattern;
  confidence: number;
  reasoning: string;
}

/**
 * Suggest fixes based on matched failure patterns.
 */
export function suggestFixes(
  matches: SimilarityMatch[],
  knownFixes: FixPattern[]
): FixSuggestion[] {
  const suggestions: FixSuggestion[] = [];

  for (const match of matches) {
    const applicableFixes = knownFixes.filter((fix) =>
      fix.target_failure_patterns.includes(match.pattern.pattern_id)
    );

    for (const fix of applicableFixes) {
      suggestions.push({
        fix,
        confidence: match.score * fix.success_rate,
        reasoning: `Pattern "${match.pattern.name}" (score: ${match.score.toFixed(2)}) fixed by "${fix.name}" (success rate: ${(fix.success_rate * 100).toFixed(0)}%)`,
      });
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
