import { z } from "zod";
import {
  FailureType,
  RootCauseCategory,
  ResolutionAction,
  BuildStage,
  Severity,
  FirstDetector,
  ValidationAfterFix,
} from "./enums.js";

// ─── FixTrail Schema — Gate 5 Output ──────────────────────────────────

export const FixTrailSchema = z.object({
  failure_id: z.string().uuid(),
  app_id: z.string().uuid(),
  feature_id: z.string(),
  build_id: z.string().uuid(),

  stage: BuildStage,

  failure_type: FailureType,
  root_cause_category: RootCauseCategory,
  symptom: z.string().min(1),
  affected_surface: z.string().min(1),
  severity: Severity,

  first_detector: FirstDetector,

  resolution_action: ResolutionAction,
  resolution_detail: z.string().min(1),
  reused_fix_pattern: z.boolean(),

  validation_after_fix: ValidationAfterFix,

  promoted_to_catalog_candidate: z.boolean(),
  prevented_by_existing_rule: z.boolean(),

  // Links to previous FixTrail entries with same failure_type + root_cause combo
  similar_past_failures: z.array(z.string().uuid()).default([]),

  created_at: z.string().datetime(),
  resolved_at: z.string().datetime().nullable(),
});

export type FixTrail = z.infer<typeof FixTrailSchema>;
