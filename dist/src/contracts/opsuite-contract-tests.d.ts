/**
 * OpSuite Contract Test Registry
 *
 * Canonical contract test definitions for the OpSuite migration
 * (Clerk+Convex+Vercel → Supabase+Prisma+Caddy).
 *
 * These are used by the AES validator-runner to verify that every API route,
 * role visibility rule, and state machine transition works correctly after
 * a build or migration.
 *
 * Total: ~50 contract tests
 *   - 22 API route tests
 *   - 15 role visibility tests
 *   - 13 task state machine tests
 */
import type { RequiredTest } from "../types/artifacts.js";
export declare const API_ROUTE_TESTS: RequiredTest[];
export declare const ROLE_VISIBILITY_TESTS: RequiredTest[];
export declare const ROLE_ISOLATION_TESTS: RequiredTest[];
export declare const ROLE_PAGE_DESIGN_TESTS: RequiredTest[];
export declare const STATE_MACHINE_TESTS: RequiredTest[];
export declare const ALL_CONTRACT_TESTS: RequiredTest[];
export type ContractTestCategory = "api_routes" | "role_visibility" | "role_isolation" | "role_page_design" | "state_machine" | "all";
export declare function getTestsByCategory(category: ContractTestCategory): RequiredTest[];
export interface SeedRequirement {
    test_id: string;
    needs: string[];
}
export declare const SEED_REQUIREMENTS: SeedRequirement[];
export interface FeatureAudit {
    feature_id: string;
    name: string;
    user_expectation: string;
    mapped_tests: string[];
    audit_gate: number;
}
export declare const FEATURE_AUDIT_MAP: FeatureAudit[];
/**
 * Check if all features from a build have test mappings.
 * Returns list of unmapped features that block the build.
 */
export declare function checkBuildFeatureCoverage(buildFeatureIds: string[]): {
    covered: string[];
    unmapped: string[];
    blocked: boolean;
};
/**
 * Register a new feature discovered during a build.
 * Returns the feature stub that must be filled with tests before the build can proceed.
 */
export declare function createFeatureStub(featureId: string, name: string, userExpectation: string): FeatureAudit;
/**
 * Run a feature-level audit. Returns pass/fail per feature based on test results.
 */
export interface FeatureAuditResult {
    feature_id: string;
    name: string;
    passed: boolean;
    tests_passed: number;
    tests_failed: number;
    tests_total: number;
    failed_test_ids: string[];
    coverage_percent: number;
}
export declare function runFeatureAudit(testResults: Record<string, {
    passed: boolean;
}>): FeatureAuditResult[];
/**
 * Get the overall audit summary across all features.
 */
export declare function getAuditSummary(auditResults: FeatureAuditResult[]): {
    total_features: number;
    features_passed: number;
    features_failed: number;
    features_blocked: number;
    overall_passed: boolean;
    failed_features: string[];
    blocked_features: string[];
};
export declare const CONTRACT_TEST_SUMMARY: {
    total: number;
    api_routes: number;
    role_visibility: number;
    role_isolation: number;
    role_page_design: number;
    state_machine: number;
    features: number;
    categories: readonly ["api_routes", "role_visibility", "role_isolation", "role_page_design", "state_machine"];
};
