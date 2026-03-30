/**
 * Catalog Usage Validator — Tier A (always runs)
 *
 * Checks that built code uses catalog assets instead of custom implementations.
 * Any raw HTML primitive that has an @aes/ui equivalent is a FAIL.
 */
export interface CatalogViolation {
    file: string;
    line: number;
    violation: string;
    expected: string;
    severity: "error" | "warning";
}
export interface CatalogValidatorResult {
    verdict: "PASS" | "FAIL";
    violations: CatalogViolation[];
    stats: {
        files_checked: number;
        aes_imports_found: number;
        raw_elements_found: number;
        violation_count: number;
    };
}
export declare function validateCatalogUsage(files: {
    path: string;
    content: string;
}[], reuseRequirements: {
    package: string;
    components: string[];
}[]): CatalogValidatorResult;
