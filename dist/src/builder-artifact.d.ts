/**
 * Builder-ready artifact compiler.
 * Takes a completed, approved, veto-clean FeatureBridge and produces
 * a BuilderPackage — the exact input a builder agent needs.
 */
import type { JobRecord } from "./store.js";
import type { PatternRequirement } from "./types/pattern-requirements.js";
export interface BuilderPackage {
    package_id: string;
    job_id: string;
    bridge_id: string;
    feature_id: string;
    feature_name: string;
    objective: string;
    included_capabilities: string[];
    excluded_capabilities: string[];
    target_repo: string;
    allowed_write_paths: string[];
    forbidden_paths: string[];
    may_create_files: boolean;
    may_modify_files: boolean;
    may_delete_files: boolean;
    reuse_assets: {
        name: string;
        source_path: string;
        description: string;
    }[];
    reuse_requirements: {
        package: string;
        components: string[];
    }[];
    source_files: Record<string, {
        repo: string;
        path: string;
        files: {
            path: string;
            content: string;
        }[];
    }>;
    pattern_requirements: PatternRequirement[];
    catalog_enforcement_rules: string;
    rules: {
        rule_id: string;
        title: string;
        severity: string;
    }[];
    required_tests: {
        test_id: string;
        name: string;
        pass_condition: string;
    }[];
    success_definition: {
        user_visible_outcome: string;
        technical_outcome: string;
        validation_requirements: string[];
    };
    graph_hints?: {
        relevant_models: {
            name: string;
            fields: string;
            source: string;
        }[];
        relevant_integrations: {
            name: string;
            type: string;
            description: string;
        }[];
        prevention_constraints: {
            rule: string;
            condition: string;
            action: string;
            severity: string;
        }[];
        domain_reference: {
            domain: string;
            bestApp: string;
            features: string;
            models: string;
            integrations: string;
        } | null;
        proven_models: {
            name: string;
            fields: string;
            appClass: string;
        }[];
    };
    schema_version: number;
    created_at: string;
}
/**
 * Compile a BuilderPackage from a completed job and feature ID.
 * Returns null if the bridge is not ready (not approved, has triggered vetoes, blocked).
 * @param reusableSourceFiles — fetched source files from GitHub, keyed by candidate_id
 */
export declare function compileBuilderPackage(job: JobRecord, featureId: string, reusableSourceFiles?: Record<string, {
    repo: string;
    path: string;
    files: {
        path: string;
        content: string;
    }[];
}>): BuilderPackage | null;
