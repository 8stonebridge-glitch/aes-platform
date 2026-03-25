export interface PriorityCandidate {
  id: string;
  name: string;
  business_value: number;      // 0-1, how important is this feature
  readiness: number;           // 0-1, how ready is this to build (deps met, evidence exists)
  evidence_strength: number;   // 0-1, how strong is the supporting evidence
  estimated_effort: number;    // 0-1, how much work (1=huge, 0=trivial) — INVERTED in score
  blast_radius: number;        // 0-1, how much does changing this affect (1=everything)
  is_blocked: boolean;
  blocking_reason?: string;
}

export const PRIORITY_WEIGHTS = {
  business_value: 0.30,
  readiness: 0.25,
  evidence_strength: 0.20,
  effort_inverse: 0.15,    // Lower effort = higher priority
  blast_radius_inverse: 0.10, // Lower blast radius = higher priority (safer first)
} as const;

export interface PriorityResult {
  id: string;
  name: string;
  score: number;
  rank: number;
  is_blocked: boolean;
  breakdown: {
    business_value: number;
    readiness: number;
    evidence_strength: number;
    effort_inverse: number;
    blast_radius_inverse: number;
  };
}

export function rankPriorities(candidates: PriorityCandidate[]): PriorityResult[] {
  const scored = candidates.map(c => {
    const effortInverse = 1 - c.estimated_effort;
    const blastInverse = 1 - c.blast_radius;

    const score = c.is_blocked ? 0 :
      c.business_value * PRIORITY_WEIGHTS.business_value +
      c.readiness * PRIORITY_WEIGHTS.readiness +
      c.evidence_strength * PRIORITY_WEIGHTS.evidence_strength +
      effortInverse * PRIORITY_WEIGHTS.effort_inverse +
      blastInverse * PRIORITY_WEIGHTS.blast_radius_inverse;

    return {
      id: c.id,
      name: c.name,
      score: Math.round(score * 1000) / 1000,
      rank: 0,
      is_blocked: c.is_blocked,
      breakdown: {
        business_value: c.business_value,
        readiness: c.readiness,
        evidence_strength: c.evidence_strength,
        effort_inverse: effortInverse,
        blast_radius_inverse: blastInverse,
      },
    };
  });

  // Sort by score descending, blocked items go to bottom
  scored.sort((a, b) => {
    if (a.is_blocked && !b.is_blocked) return 1;
    if (!a.is_blocked && b.is_blocked) return -1;
    return b.score - a.score;
  });

  // Assign ranks
  scored.forEach((item, i) => { item.rank = i + 1; });

  return scored;
}
