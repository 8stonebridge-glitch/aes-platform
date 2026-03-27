import { z } from "zod";

export const PreventionRuleSchema = z.object({
  rule_id: z.string(),
  name: z.string(),
  description: z.string(),
  target_failure_patterns: z.array(z.string()),
  gate: z.enum(["gate_0", "gate_1", "gate_2", "gate_3", "gate_4", "gate_5"]),
  check_logic: z.string(),
  added_after_incident: z.string().optional(),
});

export type PreventionRule = z.infer<typeof PreventionRuleSchema>;
