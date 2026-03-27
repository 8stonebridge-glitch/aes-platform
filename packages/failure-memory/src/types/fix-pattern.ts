import { z } from "zod";

export const FixPatternSchema = z.object({
  pattern_id: z.string(),
  name: z.string(),
  description: z.string(),
  target_failure_patterns: z.array(z.string()),
  resolution_action: z.enum([
    "update_spec", "patch_bridge", "replace_reuse_candidate", "add_fallback",
    "add_offline_state", "add_test", "narrow_scope", "add_rule", "fix_template", "rollback_change",
  ]),
  resolution_template: z.string(),
  success_rate: z.number().min(0).max(1).default(0),
  times_applied: z.number().default(0),
});

export type FixPattern = z.infer<typeof FixPatternSchema>;
