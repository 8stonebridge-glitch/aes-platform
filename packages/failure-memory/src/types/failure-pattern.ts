import { z } from "zod";

export const FailurePatternSchema = z.object({
  pattern_id: z.string(),
  name: z.string(),
  description: z.string(),
  failure_type: z.enum([
    "type_error", "test_failure", "permission_failure", "workflow_gap",
    "missing_dependency", "api_integration_failure", "ui_state_failure",
    "deployment_failure", "offline_state_gap", "fallback_gap",
  ]),
  root_cause_category: z.enum([
    "spec_gap", "bridge_gap", "catalog_mismatch", "builder_regression",
    "integration_assumption", "environment_issue", "validator_miss", "rule_missing",
  ]),
  affected_stages: z.array(z.string()),
  severity_range: z.object({
    min: z.enum(["low", "medium", "high", "critical"]),
    max: z.enum(["low", "medium", "high", "critical"]),
  }),
  frequency: z.number().default(0),
  first_observed: z.string().datetime().optional(),
  last_observed: z.string().datetime().optional(),
  tags: z.array(z.string()).default([]),
});

export type FailurePattern = z.infer<typeof FailurePatternSchema>;
