export function validateTestMapping(input) {
    const violations = [];
    const requiredTests = input.required_tests || [];
    const actualTests = input.actual_tests || [];
    if (requiredTests.length === 0) {
        violations.push({
            code: "TEST_NO_REQUIRED",
            message: "No required tests specified — cannot validate test mapping",
            severity: "info",
        });
        return { validator_name: "test_mapping", passed: true, violations, score: 1 };
    }
    const actualSet = new Set(actualTests);
    const requiredSet = new Set(requiredTests);
    // Check for missing required tests
    const missingTests = [];
    for (const req of requiredTests) {
        if (!actualSet.has(req)) {
            missingTests.push(req);
            violations.push({
                code: "TEST_MISSING",
                message: `Required test missing: ${req}`,
                severity: "error",
            });
        }
    }
    // Check for orphaned tests (tests that exist but aren't in the required list)
    const orphanedTests = [];
    for (const actual of actualTests) {
        if (!requiredSet.has(actual)) {
            orphanedTests.push(actual);
            violations.push({
                code: "TEST_ORPHANED",
                message: `Test '${actual}' exists but is not in the required test list`,
                severity: "info",
            });
        }
    }
    // Check acceptance test files if files are provided
    if (input.files && input.files.length > 0) {
        const testFiles = input.files.filter(f => f.path.includes(".test.") || f.path.includes(".spec.") || f.path.includes("__tests__"));
        // Verify test files have actual test content
        for (const testFile of testFiles) {
            const hasDescribe = testFile.content.includes("describe(") || testFile.content.includes("describe('");
            const hasIt = testFile.content.includes("it(") || testFile.content.includes("it('") ||
                testFile.content.includes("test(") || testFile.content.includes("test('");
            if (!hasDescribe && !hasIt) {
                violations.push({
                    code: "TEST_EMPTY_FILE",
                    message: `Test file '${testFile.path}' has no test cases`,
                    severity: "error",
                });
            }
        }
        // Check for source files without corresponding test files
        const sourceFiles = input.files.filter(f => !f.path.includes(".test.") && !f.path.includes(".spec.") && !f.path.includes("__tests__") &&
            (f.path.endsWith(".ts") || f.path.endsWith(".tsx")) &&
            !f.path.endsWith(".d.ts"));
        const testFilePaths = new Set(testFiles.map(f => f.path));
        for (const sourceFile of sourceFiles) {
            const expectedTestPath = sourceFile.path.replace(/\.tsx?$/, ".test.ts");
            const expectedSpecPath = sourceFile.path.replace(/\.tsx?$/, ".spec.ts");
            if (!testFilePaths.has(expectedTestPath) && !testFilePaths.has(expectedSpecPath)) {
                // Only warn — not all source files need dedicated test files
                violations.push({
                    code: "TEST_NO_CORRESPONDING",
                    message: `Source file '${sourceFile.path}' has no corresponding test file`,
                    severity: "warning",
                });
            }
        }
    }
    // Coverage calculation
    const covered = requiredTests.length - missingTests.length;
    const coverageRatio = requiredTests.length > 0 ? covered / requiredTests.length : 1;
    if (coverageRatio < 0.5) {
        violations.push({
            code: "TEST_LOW_COVERAGE",
            message: `Test coverage is ${Math.round(coverageRatio * 100)}% — below 50% minimum`,
            severity: "critical",
        });
    }
    else if (coverageRatio < 0.8) {
        violations.push({
            code: "TEST_MODERATE_COVERAGE",
            message: `Test coverage is ${Math.round(coverageRatio * 100)}% — below 80% target`,
            severity: "warning",
        });
    }
    const criticalOrError = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
    const score = Math.round(coverageRatio * 1000) / 1000;
    return {
        validator_name: "test_mapping",
        passed: criticalOrError === 0,
        violations,
        score,
    };
}
