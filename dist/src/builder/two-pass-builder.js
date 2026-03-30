/**
 * P1 — Two-Pass Build.
 * Plan phase produces a file list and structure → validate against scope → execute only if plan passes.
 * This avoids wasting a full build attempt on features that would violate scope.
 */
/**
 * Validate a change plan against the builder package scope and class config.
 */
export function validateChangePlan(plan, pkg, classConfig) {
    const violations = [];
    const warnings = [];
    // Check file count budget
    const fileCount = plan.planned_files.length;
    const filesWithinBudget = fileCount <= classConfig.max_files;
    if (!filesWithinBudget) {
        violations.push(`Plan has ${fileCount} files, exceeds class limit of ${classConfig.max_files}`);
    }
    // Check line count budget
    const linesWithinBudget = plan.estimated_lines <= classConfig.max_lines;
    if (!linesWithinBudget) {
        violations.push(`Plan estimates ${plan.estimated_lines} lines, exceeds class limit of ${classConfig.max_lines}`);
    }
    // Check all planned paths are within allowed scope
    let pathsWithinScope = true;
    for (const file of plan.planned_files) {
        // Check forbidden paths
        for (const forbidden of pkg.forbidden_paths) {
            if (file.path.startsWith(forbidden)) {
                violations.push(`File ${file.path} is in forbidden path ${forbidden}`);
                pathsWithinScope = false;
            }
        }
        // Check allowed paths (if specified)
        if (pkg.allowed_write_paths.length > 0) {
            const inAllowed = pkg.allowed_write_paths.some(p => file.path.startsWith(p));
            if (!inAllowed) {
                violations.push(`File ${file.path} is outside allowed write paths`);
                pathsWithinScope = false;
            }
        }
        // Check operation permissions
        if (file.action === "create" && !pkg.may_create_files) {
            violations.push(`Plan creates ${file.path} but package forbids file creation`);
        }
        if (file.action === "modify" && !pkg.may_modify_files) {
            violations.push(`Plan modifies ${file.path} but package forbids modification`);
        }
        if (file.action === "delete" && !pkg.may_delete_files) {
            violations.push(`Plan deletes ${file.path} but package forbids deletion`);
        }
    }
    // Warnings for borderline cases
    if (fileCount > classConfig.max_files * 0.8) {
        warnings.push(`File count (${fileCount}) is >80% of budget (${classConfig.max_files})`);
    }
    if (plan.estimated_lines > classConfig.max_lines * 0.8) {
        warnings.push(`Line estimate (${plan.estimated_lines}) is >80% of budget (${classConfig.max_lines})`);
    }
    if (plan.touches_shared) {
        warnings.push("Plan touches shared packages — verify cross-feature impact");
    }
    if (plan.touches_schema) {
        warnings.push("Plan touches schema — verify migration safety");
    }
    return {
        valid: violations.length === 0,
        violations,
        warnings,
        files_within_budget: filesWithinBudget,
        lines_within_budget: linesWithinBudget,
        paths_within_scope: pathsWithinScope,
    };
}
/**
 * Build the plan prompt that asks the LLM to produce a change plan before coding.
 */
export function buildPlanPrompt(pkg, classConfig) {
    return `You are planning the implementation of feature "${pkg.feature_name}".

OBJECTIVE: ${pkg.objective}

SCOPE CONSTRAINTS:
- Maximum files: ${classConfig.max_files}
- Maximum lines: ${classConfig.max_lines}
- Allowed write paths: ${pkg.allowed_write_paths.join(", ") || "any"}
- Forbidden paths: ${pkg.forbidden_paths.join(", ") || "none"}
- May create files: ${pkg.may_create_files}
- May modify files: ${pkg.may_modify_files}
- May delete files: ${pkg.may_delete_files}

INCLUDED CAPABILITIES: ${pkg.included_capabilities.join(", ")}
EXCLUDED CAPABILITIES: ${pkg.excluded_capabilities.join(", ")}

Produce a JSON change plan with this shape:
{
  "feature_id": "${pkg.feature_id}",
  "planned_files": [
    { "path": "src/...", "action": "create|modify|delete", "estimated_lines": N, "purpose": "..." }
  ],
  "estimated_lines": N,
  "touches_shared": boolean,
  "touches_schema": boolean,
  "touches_config": boolean,
  "rationale": "..."
}

Stay within the file and line budgets. Do NOT plan files outside allowed paths.`;
}
