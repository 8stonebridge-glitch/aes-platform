/**
 * manifest-to-build-program.ts — Bridge that converts the auto-build-runner's
 * BuildManifest into the AES builder infrastructure's BuildProgramInput, then
 * optionally executes it via the operator HTTP server.
 *
 * Usage:
 *   # Convert manifest to build program JSON (stdout)
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json
 *
 *   # Convert and execute via operator HTTP server
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --execute
 *
 *   # Convert with custom builder settings
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --timeout 300000 --stop-on-failure
 *
 *   # Execute against a custom URL
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --execute-url http://localhost:5500/api/build-programs/run
 *
 *   # From stdin
 *   cat build-manifest.json | npx tsx src/tools/manifest-to-build-program.ts --stdin --execute
 *
 *   # Output to file
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --output build-program.json
 */
import type { DesignConstraints } from "../types/design-evidence.js";
export interface DonorMatch {
    app_name: string;
    app_class: string;
    overall_score: number;
    matched_features: string[];
    matched_models: string[];
    matched_integrations: string[];
    matched_patterns: string[];
    reuse_suggestions: string[];
}
export interface LightBridge {
    feature_name: string;
    description: string;
    scope: {
        paths_allowed: string[];
        paths_forbidden: string[];
        max_files: number;
        max_lines: number;
    };
    dependencies: string[];
    donor_reuse: {
        app: string;
        suggestions: string[];
    }[];
    required_models: string[];
    required_integrations: string[];
    confidence: number;
    tests: string[];
    design_constraints?: DesignConstraints;
}
export interface FeatureBuildState {
    name: string;
    status: "pending" | "finding_donors" | "compiling_bridge" | "checking_vetoes" | "ready" | "blocked" | "skipped";
    donors: DonorMatch[];
    bridge: LightBridge | null;
    vetoes: string[];
    blocking_reason: string | null;
    artifact_state: string;
    started_at: string;
    completed_at: string | null;
}
export interface BuildManifest {
    intent: string;
    created_at: string;
    features: FeatureBuildState[];
    summary: {
        total: number;
        ready: number;
        blocked: number;
        skipped: number;
    };
    build_order: string[];
    critical_path: string[];
    estimated_complexity: string;
}
interface ScopeDefinition {
    paths: string[];
    description?: string;
}
interface AcceptanceCriterion {
    id: string;
    description: string;
    type: "functional" | "non_functional" | "boundary" | "security" | "runtime";
    mandatory: boolean;
}
interface TestCase {
    id: string;
    description: string;
    type: "unit" | "integration" | "contract" | "e2e" | "boundary";
    linked_criterion_id?: string;
    mandatory: boolean;
}
interface ConfidenceBreakdown {
    graph_coverage: number;
    pattern_strength: number;
    rule_consistency: number;
    evidence_level: number;
}
interface DbTouch {
    table: string;
    operations: Array<"READ" | "INSERT" | "UPDATE" | "DELETE">;
}
interface BuildProgramFeaturePrepare {
    scope: ScopeDefinition;
    read_scope?: ScopeDefinition;
    write_scope?: ScopeDefinition;
    out_of_scope?: string[];
    constraints?: string[];
    patterns?: string[];
    anti_patterns?: string[];
    data_model?: Record<string, unknown>;
    api_contracts?: {
        name: string;
        method: string;
        path: string;
    }[];
    events?: {
        name: string;
        payload_shape?: unknown;
    }[];
    db_touches?: DbTouch[];
    acceptance_criteria?: AcceptanceCriterion[];
    test_cases?: TestCase[];
    confidence_breakdown: ConfidenceBreakdown;
    artifact_refs?: {
        type: string;
        ref: string;
        label?: string;
    }[];
}
export interface BuildProgramFeatureInput {
    feature_id: string;
    intent: string;
    risk_domain_tags?: string[];
    depends_on_feature_ids?: string[];
    prepare: BuildProgramFeaturePrepare;
    diff?: {
        changed_files?: string[];
        interface_touches?: {
            apis?: string[];
            events?: string[];
            db_tables?: string[];
        };
        diff_blob_ref?: string;
    };
    test_run?: {
        test_cases_run: number;
        passed: number;
        failed: number;
        skipped: number;
        status: string;
    };
    run_validators?: boolean;
}
export interface BuildProgramInput {
    app_id?: string;
    requested_by: string;
    builder_cwd?: string;
    builder_timeout_ms?: number;
    stop_on_failure?: boolean;
    features: BuildProgramFeatureInput[];
}
export interface ConvertOptions {
    app_id?: string;
    requested_by?: string;
    builder_cwd?: string;
    builder_timeout_ms?: number;
    stop_on_failure?: boolean;
}
/**
 * Convert a BuildManifest (from auto-build-runner) into a BuildProgramInput
 * compatible with the AES builder-launch infrastructure.
 *
 * Only features with status "ready" and a non-null bridge are included.
 * Features are ordered according to the manifest's build_order.
 */
export declare function manifestToBuildProgram(manifest: BuildManifest, options?: ConvertOptions): BuildProgramInput;
export {};
