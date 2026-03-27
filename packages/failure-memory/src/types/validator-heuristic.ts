import { z } from "zod";

export const ValidatorHeuristicSchema = z.object({
  heuristic_id: z.string(),
  name: z.string(),
  description: z.string(),
  target_failure_patterns: z.array(z.string()),
  validator_tier: z.enum(["tier_a", "tier_b", "tier_c"]),
  detection_logic: z.string(),
  false_positive_rate: z.number().min(0).max(1).default(0),
});

export type ValidatorHeuristic = z.infer<typeof ValidatorHeuristicSchema>;
