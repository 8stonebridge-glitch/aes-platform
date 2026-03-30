/**
 * P7 — Layered Validation.
 * L1: Scope + syntax per feature (runs immediately after each build)
 * L2: Feature tests (runs after L1 passes)
 * L3: Integration / cross-feature tests (runs after all features built)
 *
 * Early layers are fast and cheap. Only features that pass L1 proceed to L2.
 * L3 only runs once when all features are complete.
 */
// ─── L1: Scope + Syntax (per feature, fast) ──────────────────────────
/**
 * L1 validates scope compliance and basic structure.
 * Runs immediately after each feature build completes.
 */
export function validateLayer1(run, bridge, classConfig) {
    const start = Date.now();
    const checks = [];
    // Check file count within class budget
    const totalFiles = run.files_created.length + run.files_modified.length;
    checks.push({
        name: "file_count_budget",
        passed: totalFiles <= classConfig.max_files,
        detail: `${totalFiles} files touched (limit: ${classConfig.max_files})`,
        severity: totalFiles <= classConfig.max_files ? "info" : "error",
    });
    // Check no forbidden path violations
    const forbiddenViolations = run.scope_violations.filter(v => v.includes("forbidden") || v.includes("outside"));
    checks.push({
        name: "no_forbidden_paths",
        passed: forbiddenViolations.length === 0,
        detail: forbiddenViolations.length === 0
            ? "No forbidden path violations"
            : `${forbiddenViolations.length} violations: ${forbiddenViolations.join("; ")}`,
        severity: forbiddenViolations.length === 0 ? "info" : "error",
    });
    // Check no constraint violations
    checks.push({
        name: "no_constraint_violations",
        passed: run.constraint_violations.length === 0,
        detail: run.constraint_violations.length === 0
            ? "No constraint violations"
            : `${run.constraint_violations.length} violations`,
        severity: run.constraint_violations.length === 0 ? "info" : "error",
    });
    // Check build succeeded
    checks.push({
        name: "build_succeeded",
        passed: run.status === "build_succeeded",
        detail: `Build status: ${run.status}`,
        severity: run.status === "build_succeeded" ? "info" : "error",
    });
    // Check files were actually produced
    checks.push({
        name: "files_produced",
        passed: run.files_created.length > 0 || run.files_modified.length > 0,
        detail: `${run.files_created.length} created, ${run.files_modified.length} modified`,
        severity: (run.files_created.length > 0 || run.files_modified.length > 0) ? "info" : "warning",
    });
    // Verify write paths match bridge scope
    const allowedPaths = bridge.write_scope.allowed_repo_paths;
    if (allowedPaths.length > 0) {
        const outOfScope = [...run.files_created, ...run.files_modified].filter(f => !allowedPaths.some(p => f.startsWith(p)));
        checks.push({
            name: "write_scope_compliance",
            passed: outOfScope.length === 0,
            detail: outOfScope.length === 0
                ? "All files within write scope"
                : `${outOfScope.length} files outside scope: ${outOfScope.slice(0, 3).join(", ")}`,
            severity: outOfScope.length === 0 ? "info" : "error",
        });
    }
    return {
        layer: "L1",
        feature_id: run.feature_id,
        passed: checks.every(c => c.severity !== "error" || c.passed),
        checks,
        duration_ms: Date.now() - start,
    };
}
// ─── L2: Feature Tests (per feature, medium) ─────────────────────────
/**
 * L2 validates feature-specific test results.
 * Only runs if L1 passed.
 */
export function validateLayer2(run, bridge) {
    const start = Date.now();
    const checks = [];
    // Check test results
    const passedTests = run.test_results.filter(t => t.passed).length;
    const totalTests = run.test_results.length;
    checks.push({
        name: "test_pass_rate",
        passed: passedTests === totalTests,
        detail: `${passedTests}/${totalTests} tests passed`,
        severity: passedTests === totalTests ? "info" : "error",
    });
    // Check acceptance coverage
    if (run.acceptance_coverage) {
        const coverageMet = run.acceptance_coverage.covered >= run.acceptance_coverage.total_required;
        checks.push({
            name: "acceptance_coverage",
            passed: coverageMet,
            detail: `${run.acceptance_coverage.covered}/${run.acceptance_coverage.total_required} acceptance criteria covered`,
            severity: coverageMet ? "info" : "warning",
        });
        if (run.acceptance_coverage.missing.length > 0) {
            checks.push({
                name: "missing_acceptance",
                passed: false,
                detail: `Missing: ${run.acceptance_coverage.missing.join(", ")}`,
                severity: "warning",
            });
        }
    }
    // Check repo-level checks (typecheck, lint, build)
    for (const check of run.check_results || []) {
        if (check.skipped)
            continue;
        checks.push({
            name: `repo_check_${check.check}`,
            passed: check.passed,
            detail: `${check.check}: ${check.passed ? "passed" : "failed"} (${check.duration_ms}ms)`,
            severity: check.passed ? "info" : "error",
        });
    }
    // Verification status
    checks.push({
        name: "verification_passed",
        passed: run.verification_passed,
        detail: run.verification_passed ? "Build verification passed" : "Build verification failed",
        severity: run.verification_passed ? "info" : "error",
    });
    return {
        layer: "L2",
        feature_id: run.feature_id,
        passed: checks.filter(c => c.severity === "error").every(c => c.passed),
        checks,
        duration_ms: Date.now() - start,
    };
}
// ─── L3: Integration / Cross-Feature (whole app, slow) ──────────────
/**
 * L3 validates cross-feature concerns after all builds complete.
 * Checks for conflicting files, duplicate routes, import consistency, etc.
 */
export function validateLayer3(runs, bridges) {
    const start = Date.now();
    const checks = [];
    const allCreated = new Map(); // file -> feature_id
    const allModified = new Map(); // file -> feature_ids
    // Check for file conflicts
    for (const [featureId, run] of Object.entries(runs)) {
        if (featureId === "__app__")
            continue;
        for (const file of run.files_created) {
            if (allCreated.has(file)) {
                checks.push({
                    name: "file_conflict",
                    passed: false,
                    detail: `File ${file} created by both ${allCreated.get(file)} and ${featureId}`,
                    severity: "error",
                });
            }
            allCreated.set(file, featureId);
        }
        for (const file of run.files_modified) {
            const existing = allModified.get(file) || [];
            existing.push(featureId);
            allModified.set(file, existing);
        }
    }
    // Check for multiple features modifying the same file
    for (const [file, features] of allModified) {
        if (features.length > 1) {
            checks.push({
                name: "concurrent_modify",
                passed: true, // Warning only
                detail: `File ${file} modified by ${features.length} features: ${features.join(", ")}`,
                severity: "warning",
            });
        }
    }
    // Check overall success rate
    const featureRuns = Object.entries(runs).filter(([id]) => id !== "__app__");
    const successRate = featureRuns.filter(([, r]) => r.status === "build_succeeded").length / Math.max(featureRuns.length, 1);
    checks.push({
        name: "overall_success_rate",
        passed: successRate >= 0.5,
        detail: `${Math.round(successRate * 100)}% of features built successfully`,
        severity: successRate >= 0.5 ? "info" : "error",
    });
    // Check all dependencies were actually built
    for (const [featureId, bridge] of Object.entries(bridges)) {
        for (const dep of bridge.dependencies || []) {
            if (dep.status === "required" && !runs[dep.feature_id]) {
                checks.push({
                    name: "dependency_built",
                    passed: false,
                    detail: `${featureId} depends on ${dep.feature_id} which was not built`,
                    severity: "error",
                });
            }
        }
    }
    // No conflicts found
    if (checks.length === 0) {
        checks.push({
            name: "no_issues",
            passed: true,
            detail: "No cross-feature issues detected",
            severity: "info",
        });
    }
    return {
        layer: "L3",
        feature_id: "__all__",
        passed: checks.filter(c => c.severity === "error").every(c => c.passed),
        checks,
        duration_ms: Date.now() - start,
    };
}
/**
 * Run the full validation pipeline across all built features.
 */
export function runValidationPipeline(runs, bridges, classConfigs) {
    const l1Results = new Map();
    const l2Results = new Map();
    // L1: Per-feature scope checks
    for (const [featureId, run] of Object.entries(runs)) {
        if (featureId === "__app__")
            continue;
        const bridge = bridges[featureId];
        if (!bridge)
            continue;
        const config = classConfigs.get(featureId) || {
            build_class: "crud",
            timeout_ms: 90_000,
            max_concurrency: 4,
            max_files: 20,
            max_lines: 2000,
            requires_isolation: false,
        };
        const l1 = validateLayer1(run, bridge, config);
        l1Results.set(featureId, l1);
        // Only run L2 if L1 passed
        if (l1.passed) {
            const l2 = validateLayer2(run, bridge);
            l2Results.set(featureId, l2);
        }
    }
    // L3: Cross-feature checks (only if at least some L1 passed)
    let l3Result = null;
    if (l1Results.size > 0) {
        l3Result = validateLayer3(runs, bridges);
    }
    const l1Passed = [...l1Results.values()].filter(r => r.passed).length;
    const l2Passed = [...l2Results.values()].filter(r => r.passed).length;
    const l3Passed = l3Result?.passed ?? false;
    return {
        l1Results,
        l2Results,
        l3Result,
        summary: {
            total_features: l1Results.size,
            l1_passed: l1Passed,
            l2_passed: l2Passed,
            l3_passed: l3Passed,
            overall_passed: l1Passed === l1Results.size && l3Passed,
        },
    };
}
