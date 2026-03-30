/**
 * Layer 4 — Composition Validator (Tier B)
 *
 * Checks that built pages conform to expected patterns, not just that
 * they use the right components. Validates section presence, state handling,
 * interaction support, and visual richness.
 *
 * Layer 1-3 check: "Did you use @aes/ui/Button?"
 * Layer 4 checks: "Did you build a proper data-table-page with all
 *   required sections, states, and interactions?"
 */
import { PAGE_PATTERNS, FEATURE_TO_PATTERN, } from "../types/pattern-requirements.js";
function checkMarkers(content, markers) {
    return markers.some((m) => content.includes(m));
}
/**
 * Resolve which pattern IDs apply to a file based on its path.
 */
function inferPatternFromPath(filePath) {
    const p = filePath.toLowerCase();
    if (p.includes("review-queue"))
        return "data-table-page";
    if (p.includes("audit"))
        return "audit-log-page";
    if (p.includes("select-role"))
        return "role-selection-page";
    if (p.includes("requests/page") || p.includes("submit"))
        return "form-page";
    if (p.includes("[id]"))
        return "detail-page";
    if (p.endsWith("app/page.tsx") || p.endsWith("app/(dashboard)/page.tsx"))
        return "dashboard-overview";
    return null;
}
export function validateComposition(files, featureNames) {
    const violations = [];
    let sectionsFound = 0, sectionsRequired = 0;
    let statesFound = 0, statesRequired = 0;
    let interactionsFound = 0, interactionsRequired = 0;
    let richnessPass = 0, richnessTotal = 0;
    let patternsChecked = 0;
    // Determine which patterns to check based on feature names
    const patternsToCheck = new Set();
    for (const feature of featureNames) {
        const normalized = feature.toLowerCase().replace(/[^a-z]/g, "-");
        for (const [keyword, patterns] of Object.entries(FEATURE_TO_PATTERN)) {
            if (normalized.includes(keyword)) {
                patterns.forEach((p) => patternsToCheck.add(p));
            }
        }
    }
    // Also check page files against their likely patterns
    for (const file of files) {
        if (!file.path.endsWith(".tsx") && !file.path.endsWith(".jsx"))
            continue;
        if (!file.path.includes("app/"))
            continue;
        if (file.path.includes("layout.tsx") || file.path.includes("header.tsx"))
            continue;
        if (file.path.includes("components/"))
            continue;
        const inferred = inferPatternFromPath(file.path);
        if (inferred)
            patternsToCheck.add(inferred);
    }
    for (const patternId of patternsToCheck) {
        const pattern = PAGE_PATTERNS[patternId];
        if (!pattern)
            continue;
        patternsChecked++;
        // Find the most relevant file(s) for this pattern
        const relevantFiles = files.filter((f) => {
            if (!f.path.endsWith(".tsx"))
                return false;
            return inferPatternFromPath(f.path) === patternId;
        });
        // Combine content of relevant files + their imported components
        const combinedContent = relevantFiles.map((f) => f.content).join("\n");
        // Also include shared components that might be imported
        const componentFiles = files.filter((f) => f.path.includes("components/") && f.path.endsWith(".tsx"));
        const fullContent = combinedContent + "\n" + componentFiles.map((f) => f.content).join("\n");
        // Check required sections
        for (const section of pattern.required_sections) {
            sectionsRequired++;
            if (checkMarkers(fullContent, section.markers)) {
                sectionsFound++;
            }
            else {
                violations.push({
                    file: relevantFiles[0]?.path || "(unknown)",
                    pattern: pattern.pattern_name,
                    category: "section",
                    check: section.id,
                    description: `Missing section: ${section.name} — ${section.description}`,
                    severity: "error",
                });
            }
        }
        // Check required states
        for (const state of pattern.required_states) {
            statesRequired++;
            if (checkMarkers(fullContent, state.markers)) {
                statesFound++;
            }
            else {
                violations.push({
                    file: relevantFiles[0]?.path || "(unknown)",
                    pattern: pattern.pattern_name,
                    category: "state",
                    check: state.state,
                    description: `Missing state: ${state.state} — ${state.description}`,
                    severity: "error",
                });
            }
        }
        // Check required interactions
        for (const interaction of pattern.required_interactions) {
            interactionsRequired++;
            if (checkMarkers(fullContent, interaction.markers)) {
                interactionsFound++;
            }
            else {
                violations.push({
                    file: relevantFiles[0]?.path || "(unknown)",
                    pattern: pattern.pattern_name,
                    category: "interaction",
                    check: interaction.interaction,
                    description: `Missing interaction: ${interaction.interaction} — ${interaction.description}`,
                    severity: "error",
                });
            }
        }
        // Check richness
        for (const check of pattern.richness_checks) {
            richnessTotal++;
            if (checkMarkers(fullContent, check.markers)) {
                richnessPass++;
            }
            else {
                violations.push({
                    file: relevantFiles[0]?.path || "(unknown)",
                    pattern: pattern.pattern_name,
                    category: "richness",
                    check: check.check,
                    description: `Missing richness: ${check.check} — ${check.description}`,
                    severity: check.severity,
                });
            }
        }
    }
    // Calculate score
    const totalChecks = sectionsRequired + statesRequired + interactionsRequired + richnessTotal;
    const totalPassed = sectionsFound + statesFound + interactionsFound + richnessPass;
    const score = totalChecks > 0 ? totalPassed / totalChecks : 1;
    // Determine verdict
    const errorCount = violations.filter((v) => v.severity === "error").length;
    const warningCount = violations.filter((v) => v.severity === "warning").length;
    let verdict;
    if (errorCount > 0 && score < 0.6) {
        verdict = "FAIL";
    }
    else if (errorCount > 0 || warningCount > 3) {
        verdict = "PASS_WITH_CONCERNS";
    }
    else {
        verdict = "PASS";
    }
    return {
        verdict,
        score,
        violations,
        stats: {
            patterns_checked: patternsChecked,
            sections_found: sectionsFound,
            sections_required: sectionsRequired,
            states_found: statesFound,
            states_required: statesRequired,
            interactions_found: interactionsFound,
            interactions_required: interactionsRequired,
            richness_passed: richnessPass,
            richness_total: richnessTotal,
        },
    };
}
