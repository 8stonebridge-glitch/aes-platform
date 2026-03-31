/**
 * design-evidence-loader.ts — Loads and matches design evidence for AES pipeline.
 *
 * Sources (in priority order):
 * 1. Pipeline state (if already loaded, e.g. from API submission)
 * 2. Design evidence JSON files on disk (from Paper MCP extractions)
 * 3. Neo4j graph (if design evidence was persisted there)
 */
import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { normalizeDesignEvidence } from "../tools/design-normalize.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// At runtime, __dirname is dist/src/services/ — platform root is 3 levels up
const PLATFORM_ROOT = join(__dirname, "..", "..", "..");
/**
 * Load the most recent design evidence JSON from disk.
 * Looks for files matching `design-evidence-*.json` in the platform root.
 */
export async function loadDesignEvidenceFromDisk() {
    try {
        const files = await readdir(PLATFORM_ROOT);
        const evidenceFiles = files
            .filter(f => f.startsWith("design-evidence-") && f.endsWith(".json"))
            .sort()
            .reverse(); // Most recent first (filenames include ISO timestamps)
        if (evidenceFiles.length === 0)
            return null;
        const latest = evidenceFiles[0];
        const raw = await readFile(join(PLATFORM_ROOT, latest), "utf-8");
        const parsed = JSON.parse(raw);
        // Basic validation
        if (!Array.isArray(parsed.screens) || !parsed.source) {
            console.warn(`[design-loader] ${latest} missing required fields, skipping`);
            return null;
        }
        const normalized = normalizeDesignEvidence(parsed);
        console.log(`[design-loader] Loaded design evidence from ${latest} (${normalized.screens.length} screens, ${normalized.components.length} components)`);
        return normalized;
    }
    catch (err) {
        console.warn(`[design-loader] Failed to load design evidence: ${err.message}`);
        return null;
    }
}
function asTrimmedString(value, fallback = "") {
    return typeof value === "string" ? value.trim() || fallback : fallback;
}
function listOfStrings(value) {
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : [];
}
/**
 * Extract design constraints for a specific feature by matching feature name
 * against screen names in the design evidence.
 *
 * Matching strategy:
 * - Feature name substring match against screen name (bidirectional)
 * - Feature name keyword match against screen purpose
 * - Falls back to undefined if no screens match
 */
export function extractDesignConstraintsForFeature(design, featureName) {
    const featureNameLower = asTrimmedString(featureName, "feature").toLowerCase();
    const featureWords = featureNameLower.split(/[\s_-]+/).filter(w => w.length > 2);
    const screens = Array.isArray(design.screens) ? design.screens : [];
    const components = Array.isArray(design.components) ? design.components : [];
    const dataViews = Array.isArray(design.data_views) ? design.data_views : [];
    const forms = Array.isArray(design.forms) ? design.forms : [];
    const actions = Array.isArray(design.actions) ? design.actions : [];
    const states = Array.isArray(design.states) ? design.states : [];
    const primaryNav = Array.isArray(design.navigation?.primary_items)
        ? design.navigation.primary_items
        : [];
    const matchingScreens = screens.filter(s => {
        const screenNameLower = asTrimmedString(s?.name, asTrimmedString(s?.screen_id, "screen")).toLowerCase();
        const purposeLower = asTrimmedString(s?.purpose).toLowerCase();
        // Direct substring match
        if (featureNameLower.includes(screenNameLower) || screenNameLower.includes(featureNameLower)) {
            return true;
        }
        // Keyword match: at least 2 words from the feature name appear in screen name or purpose
        const matchCount = featureWords.filter(w => screenNameLower.includes(w) || purposeLower.includes(w)).length;
        return matchCount >= 2 || (featureWords.length === 1 && matchCount === 1);
    });
    if (matchingScreens.length === 0)
        return undefined;
    const screenIds = new Set(matchingScreens
        .map((s, index) => asTrimmedString(s?.screen_id, `screen-${index + 1}`))
        .filter(Boolean));
    return {
        required_screens: matchingScreens.map(s => ({
            screen_id: asTrimmedString(s?.screen_id, "screen"),
            name: asTrimmedString(s?.name, asTrimmedString(s?.screen_id, "Screen")),
            purpose: asTrimmedString(s?.purpose),
        })),
        required_components: components
            .filter(c => {
            const componentScreens = listOfStrings(c?.screen_ids);
            return componentScreens.some(id => screenIds.has(id));
        })
            .map(c => ({
            component_id: asTrimmedString(c?.component_id, "component"),
            name: asTrimmedString(c?.name, asTrimmedString(c?.component_id, "Component")),
            category: asTrimmedString(c?.category, "other"),
        })),
        required_data_views: dataViews
            .filter(d => screenIds.has(asTrimmedString(d?.screen_id)))
            .map(d => ({
            view_id: asTrimmedString(d?.view_id, "view"),
            name: asTrimmedString(d?.name, asTrimmedString(d?.view_id, "View")),
            type: asTrimmedString(d?.type, "custom"),
            columns: (Array.isArray(d?.columns) ? d.columns : [])
                .map(c => asTrimmedString(c?.name))
                .filter(Boolean),
            capabilities: listOfStrings(d?.capabilities),
        })),
        required_forms: forms
            .filter(f => screenIds.has(asTrimmedString(f?.screen_id)))
            .map(f => ({
            form_id: asTrimmedString(f?.form_id, "form"),
            name: asTrimmedString(f?.name, asTrimmedString(f?.form_id, "Form")),
            fields: (Array.isArray(f?.fields) ? f.fields : [])
                .map(fl => asTrimmedString(fl?.name))
                .filter(Boolean),
        })),
        required_actions: actions
            .filter(a => screenIds.has(asTrimmedString(a?.screen_id)))
            .map(a => ({
            action_id: asTrimmedString(a?.action_id, "action"),
            label: asTrimmedString(a?.label, asTrimmedString(a?.action_id, "Action")),
            type: asTrimmedString(a?.type, "custom"),
            is_destructive: Boolean(a?.is_destructive),
        })),
        required_states: states
            .filter(s => screenIds.has(asTrimmedString(s?.screen_id)))
            .map(s => ({
            state_id: asTrimmedString(s?.state_id, "state"),
            type: asTrimmedString(s?.type, "custom"),
            screen_id: asTrimmedString(s?.screen_id, "screen"),
        })),
        required_nav: primaryNav
            .filter(n => screenIds.has(asTrimmedString(n?.target_screen_id)))
            .map(n => ({
            label: asTrimmedString(n?.label, "Navigate"),
            target_screen_id: asTrimmedString(n?.target_screen_id, "screen"),
            level: asTrimmedString(n?.level, "primary"),
        })),
    };
}
/**
 * Apply design constraints to all features in an appSpec.
 * Mutates the appSpec's design_constraints array and each feature's bridge
 * if design evidence matches.
 */
export function applyDesignEvidenceToSpec(appSpec, designEvidence) {
    const featuresMatched = [];
    const allConstraints = [];
    for (const feature of appSpec.features || []) {
        const constraints = extractDesignConstraintsForFeature(designEvidence, feature.name);
        if (constraints) {
            feature.design_constraints = constraints;
            featuresMatched.push(feature.name);
            allConstraints.push(constraints);
        }
    }
    // Also set top-level design_constraints on the appSpec
    appSpec.design_constraints = allConstraints;
    return { constraintsApplied: allConstraints.length, featuresMatched };
}
