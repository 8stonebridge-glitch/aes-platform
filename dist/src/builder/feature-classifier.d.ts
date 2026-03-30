/**
 * P0 — Feature Classification.
 * Classifies features into build classes so the dispatcher can assign
 * appropriate timeouts, concurrency tiers, and file-count limits.
 */
export type BuildClass = "ui_only" | "crud" | "stateful" | "auth_sensitive" | "infra_config";
export interface BuildClassConfig {
    build_class: BuildClass;
    timeout_ms: number;
    max_concurrency: number;
    max_files: number;
    max_lines: number;
    requires_isolation: boolean;
}
export declare function classifyFeature(feature: {
    name: string;
    summary?: string;
    description?: string;
    actor_ids?: string[];
    destructive_actions?: {
        action_name: string;
    }[];
    audit_required?: boolean;
}): BuildClassConfig;
export declare function classifyAllFeatures(features: {
    feature_id: string;
    name: string;
    summary?: string;
    description?: string;
    actor_ids?: string[];
    destructive_actions?: {
        action_name: string;
    }[];
    audit_required?: boolean;
}[]): Map<string, BuildClassConfig>;
export declare function getClassConfig(buildClass: BuildClass): BuildClassConfig;
