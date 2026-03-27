import { z } from "zod";

// The builder receives ONLY this. Nothing else.
export const BuilderInputSchema = z.object({
  bridge_id: z.string().uuid(),
  feature_id: z.string(),
  feature_name: z.string(),

  build_scope: z.object({
    objective: z.string(),
    included_capabilities: z.array(z.string()),
    excluded_capabilities: z.array(z.string()),
    acceptance_boundary: z.string(),
  }),

  read_scope: z.object({
    allowed_repo_paths: z.array(z.string()),
    allowed_packages: z.array(z.string()),
  }),

  write_scope: z.object({
    target_repo: z.string(),
    allowed_repo_paths: z.array(z.string()),
    forbidden_repo_paths: z.array(z.string()),
    may_create_files: z.boolean(),
    may_modify_existing_files: z.boolean(),
    may_delete_files: z.boolean(),
    may_change_shared_packages: z.boolean(),
    may_change_schema: z.boolean(),
  }),

  reuse_assets: z.array(z.object({
    name: z.string(),
    source_repo: z.string(),
    source_path: z.string(),
    description: z.string(),
    constraints: z.array(z.string()),
  })),

  applied_rules: z.array(z.object({
    rule_id: z.string(),
    title: z.string(),
    description: z.string(),
    severity: z.enum(["info", "warn", "error", "critical"]),
  })),

  required_tests: z.array(z.object({
    test_id: z.string(),
    name: z.string(),
    type: z.string(),
    pass_condition: z.string(),
  })),

  success_definition: z.object({
    user_visible_outcome: z.string(),
    technical_outcome: z.string(),
    validation_requirements: z.array(z.string()),
  }),
});

export type BuilderInput = z.infer<typeof BuilderInputSchema>;

export const BuilderOutputSchema = z.object({
  bridge_id: z.string().uuid(),
  feature_id: z.string(),

  status: z.enum(["success", "partial", "failed"]),

  branch: z.string(),
  commit_sha: z.string().optional(),
  pr_number: z.number().optional(),
  pr_url: z.string().optional(),

  files_created: z.array(z.string()),
  files_modified: z.array(z.string()),
  files_deleted: z.array(z.string()),

  reuse_assets_used: z.array(z.string()),
  reuse_assets_skipped: z.array(z.string()),

  test_results: z.array(z.object({
    test_id: z.string(),
    passed: z.boolean(),
    output: z.string().optional(),
  })),

  scope_violations: z.array(z.object({
    violation_type: z.enum(["write_outside_scope", "forbidden_path", "unauthorized_delete", "shared_package_change", "schema_change"]),
    path: z.string(),
    description: z.string(),
  })),

  error_message: z.string().optional(),
  duration_ms: z.number(),

  completed_at: z.string().datetime(),
});

export type BuilderOutput = z.infer<typeof BuilderOutputSchema>;

// Scope violation = immediate hard fail
export const SCOPE_VIOLATION_RULES = {
  write_outside_scope: "Builder wrote to a path not in allowed_repo_paths",
  forbidden_path: "Builder wrote to a path in forbidden_repo_paths",
  unauthorized_delete: "Builder deleted a file when may_delete_files is false",
  shared_package_change: "Builder modified shared packages when may_change_shared_packages is false",
  schema_change: "Builder modified schema when may_change_schema is false",
} as const;
