import { z } from "zod";

export const IncidentExampleSchema = z.object({
  incident_id: z.string(),
  title: z.string(),
  description: z.string(),
  failure_pattern_id: z.string(),
  fix_pattern_id: z.string().optional(),
  occurred_at: z.string().datetime(),
  resolved_at: z.string().datetime().optional(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  affected_feature: z.string(),
  affected_files: z.array(z.string()).default([]),
  resolution_notes: z.string().optional(),
  led_to_prevention_rule: z.string().optional(),
  led_to_heuristic: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export type IncidentExample = z.infer<typeof IncidentExampleSchema>;
