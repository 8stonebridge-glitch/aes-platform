/**
 * P0 — Feature Classification.
 * Classifies features into build classes so the dispatcher can assign
 * appropriate timeouts, concurrency tiers, and file-count limits.
 */
const CLASS_CONFIGS = {
    ui_only: { timeout_ms: 60_000, max_concurrency: 6, max_files: 15, max_lines: 1500, requires_isolation: false },
    crud: { timeout_ms: 90_000, max_concurrency: 4, max_files: 20, max_lines: 2000, requires_isolation: false },
    stateful: { timeout_ms: 120_000, max_concurrency: 3, max_files: 25, max_lines: 2500, requires_isolation: false },
    auth_sensitive: { timeout_ms: 150_000, max_concurrency: 1, max_files: 20, max_lines: 2000, requires_isolation: true },
    infra_config: { timeout_ms: 90_000, max_concurrency: 2, max_files: 10, max_lines: 1000, requires_isolation: true },
};
// Keywords that signal each class
const CLASS_SIGNALS = {
    ui_only: ["dashboard", "page", "layout", "sidebar", "navigation", "widget", "display", "view", "chart", "report"],
    crud: ["create", "read", "update", "delete", "list", "form", "table", "manage", "catalog", "directory"],
    stateful: ["workflow", "state machine", "approval", "pipeline", "queue", "notification", "real-time", "subscription"],
    auth_sensitive: ["auth", "login", "signup", "permission", "role", "access control", "rbac", "session", "token", "password", "mfa", "2fa"],
    infra_config: ["config", "settings", "environment", "deploy", "database", "migration", "schema", "seed", "setup"],
};
export function classifyFeature(feature) {
    const text = `${feature.name} ${feature.summary || ""} ${feature.description || ""}`.toLowerCase();
    // Auth-sensitive takes priority if detected
    if (feature.audit_required || (feature.destructive_actions && feature.destructive_actions.length > 0)) {
        return { build_class: "auth_sensitive", ...CLASS_CONFIGS.auth_sensitive };
    }
    // Score each class
    const scores = {
        ui_only: 0, crud: 0, stateful: 0, auth_sensitive: 0, infra_config: 0,
    };
    for (const [cls, keywords] of Object.entries(CLASS_SIGNALS)) {
        for (const kw of keywords) {
            if (text.includes(kw))
                scores[cls] += 1;
        }
    }
    // Auth signals override
    if (scores.auth_sensitive > 0) {
        return { build_class: "auth_sensitive", ...CLASS_CONFIGS.auth_sensitive };
    }
    // Pick highest scoring class, default to crud
    let best = "crud";
    let bestScore = 0;
    for (const [cls, score] of Object.entries(scores)) {
        if (score > bestScore) {
            best = cls;
            bestScore = score;
        }
    }
    return { build_class: best, ...CLASS_CONFIGS[best] };
}
export function classifyAllFeatures(features) {
    const result = new Map();
    for (const f of features) {
        result.set(f.feature_id, classifyFeature(f));
    }
    return result;
}
export function getClassConfig(buildClass) {
    return { build_class: buildClass, ...CLASS_CONFIGS[buildClass] };
}
