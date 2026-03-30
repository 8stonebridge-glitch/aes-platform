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
        if (!parsed.screens || !parsed.components || !parsed.evidence_id) {
            console.warn(`[design-loader] ${latest} missing required fields, skipping`);
            return null;
        }
        console.log(`[design-loader] Loaded design evidence from ${latest} (${parsed.screens.length} screens, ${parsed.components.length} components)`);
        return parsed;
    }
    catch (err) {
        console.warn(`[design-loader] Failed to load design evidence: ${err.message}`);
        return null;
    }
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
    const featureNameLower = featureName.toLowerCase();
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
        const screenNameLower = s.name.toLowerCase();
        const purposeLower = (s.purpose || "").toLowerCase();
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
    const screenIds = new Set(matchingScreens.map(s => s.screen_id));
    return {
        required_screens: matchingScreens.map(s => ({
            screen_id: s.screen_id,
            name: s.name,
            purpose: s.purpose,
        })),
        required_components: components
            .filter(c => {
            const componentScreens = Array.isArray(c.screen_ids) ? c.screen_ids : [];
            return componentScreens.some(id => screenIds.has(id));
        })
            .map(c => ({
            component_id: c.component_id,
            name: c.name,
            category: c.category,
        })),
        required_data_views: dataViews
            .filter(d => screenIds.has(d.screen_id))
            .map(d => ({
            view_id: d.view_id,
            name: d.name,
            type: d.type,
            columns: (Array.isArray(d.columns) ? d.columns : []).map(c => c.name),
            capabilities: Array.isArray(d.capabilities) ? d.capabilities : [],
        })),
        required_forms: forms
            .filter(f => screenIds.has(f.screen_id))
            .map(f => ({
            form_id: f.form_id,
            name: f.name,
            fields: (Array.isArray(f.fields) ? f.fields : []).map(fl => fl.name),
        })),
        required_actions: actions
            .filter(a => screenIds.has(a.screen_id))
            .map(a => ({
            action_id: a.action_id,
            label: a.label,
            type: a.type,
            is_destructive: a.is_destructive,
        })),
        required_states: states
            .filter(s => screenIds.has(s.screen_id))
            .map(s => ({
            state_id: s.state_id,
            type: s.type,
            screen_id: s.screen_id,
        })),
        required_nav: primaryNav
            .filter(n => screenIds.has(n.target_screen_id))
            .map(n => ({
            label: n.label,
            target_screen_id: n.target_screen_id,
            level: n.level,
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
