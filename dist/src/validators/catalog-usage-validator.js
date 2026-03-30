/**
 * Catalog Usage Validator — Tier A (always runs)
 *
 * Checks that built code uses catalog assets instead of custom implementations.
 * Any raw HTML primitive that has an @aes/ui equivalent is a FAIL.
 */
const FORBIDDEN_PATTERNS = [
    { pattern: /<button[\s>]/g, element: "<button>", replacement: "@aes/ui Button", severity: "error" },
    { pattern: /<input[\s>]/g, element: "<input>", replacement: "@aes/ui Input", severity: "error" },
    { pattern: /<textarea[\s>]/g, element: "<textarea>", replacement: "@aes/ui Textarea", severity: "error" },
    { pattern: /<table[\s>]/g, element: "<table>", replacement: "@aes/ui Table", severity: "error" },
    { pattern: /<select[\s>]/g, element: "<select>", replacement: "@aes/ui Select", severity: "error" },
    { pattern: /animate-pulse/g, element: "custom loading spinner", replacement: "@aes/ui LoadingState", severity: "warning" },
];
const REQUIRED_IMPORT_PATTERN = /@aes\//;
export function validateCatalogUsage(files, reuseRequirements) {
    const violations = [];
    let aesImportsFound = 0;
    let rawElementsFound = 0;
    for (const file of files) {
        // Only check TSX/JSX files
        if (!file.path.endsWith(".tsx") && !file.path.endsWith(".jsx"))
            continue;
        // Skip node_modules, _generated, etc.
        if (file.path.includes("node_modules") || file.path.includes("_generated"))
            continue;
        const lines = file.content.split("\n");
        // Check for @aes/* imports
        if (REQUIRED_IMPORT_PATTERN.test(file.content)) {
            aesImportsFound++;
        }
        // Check for forbidden raw elements
        for (const forbidden of FORBIDDEN_PATTERNS) {
            for (let i = 0; i < lines.length; i++) {
                if (forbidden.pattern.test(lines[i])) {
                    rawElementsFound++;
                    violations.push({
                        file: file.path,
                        line: i + 1,
                        violation: `Raw ${forbidden.element} found`,
                        expected: `Use ${forbidden.replacement} instead`,
                        severity: forbidden.severity,
                    });
                }
                // Reset regex lastIndex since we're using /g flag
                forbidden.pattern.lastIndex = 0;
            }
        }
    }
    // Check required packages were imported
    const tsxFiles = files.filter(f => (f.path.endsWith(".tsx") || f.path.endsWith(".jsx")) &&
        !f.path.includes("node_modules") &&
        !f.path.includes("_generated"));
    for (const req of reuseRequirements) {
        const anyFileImports = tsxFiles.some(f => f.content.includes(req.package));
        if (!anyFileImports && tsxFiles.length > 0) {
            violations.push({
                file: "(project-wide)",
                line: 0,
                violation: `Required package ${req.package} not imported in any file`,
                expected: `At least one file must import from ${req.package}`,
                severity: "error",
            });
        }
    }
    const errorCount = violations.filter(v => v.severity === "error").length;
    return {
        verdict: errorCount > 0 ? "FAIL" : "PASS",
        violations,
        stats: {
            files_checked: tsxFiles.length,
            aes_imports_found: aesImportsFound,
            raw_elements_found: rawElementsFound,
            violation_count: violations.length,
        },
    };
}
