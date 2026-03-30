/**
 * design-verify.ts — Post-build validator that checks built output against
 * design evidence and bridge design constraints.
 *
 * Takes a DesignEvidence artifact (or DesignConstraints from a bridge) and a
 * built project directory, then verifies that every design obligation was met.
 *
 * Usage:
 *   npx tsx src/tools/design-verify.ts --evidence evidence.json --project ./my-app
 *   npx tsx src/tools/design-verify.ts --constraints bridge-constraints.json --project ./my-app
 *   npx tsx src/tools/design-verify.ts --evidence evidence.json --project ./my-app --strict
 */
import { getNeo4jService } from "../services/neo4j-service.js";
import * as fs from "node:fs";
import * as path from "node:path";
// ═══════════════════════════════════════════════════════════════════════
// FILE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════
/**
 * Recursively collect all files under a directory.
 */
function collectFiles(dir, base) {
    const root = base ?? dir;
    const results = [];
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    }
    catch {
        return results;
    }
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // skip node_modules, .git, dist, build
            if (["node_modules", ".git", "dist", "build", ".next", ".nuxt"].includes(entry.name))
                continue;
            results.push(...collectFiles(full, root));
        }
        else {
            results.push(path.relative(root, full));
        }
    }
    return results;
}
/**
 * Read file content safely, returning empty string on failure.
 */
function readFileSafe(filePath) {
    try {
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return "";
    }
}
/**
 * Slugify a name for use as an ID.
 */
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
/**
 * Normalize a name to lowercase words for fuzzy matching.
 */
function normalizeToWords(name) {
    return name
        .replace(/([a-z])([A-Z])/g, "$1 $2") // camelCase / PascalCase
        .replace(/[-_./\\]/g, " ")
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
}
/**
 * Check if a file path or name matches a target name (fuzzy).
 * Matches PascalCase, kebab-case, snake_case variants.
 */
function nameMatches(filePath, targetName) {
    const fileWords = normalizeToWords(path.basename(filePath, path.extname(filePath)));
    const targetWords = normalizeToWords(targetName);
    if (targetWords.length === 0)
        return false;
    const matchCount = targetWords.filter((tw) => fileWords.some((fw) => fw.includes(tw) || tw.includes(fw))).length;
    return matchCount >= Math.ceil(targetWords.length * 0.6);
}
/**
 * Check if file content contains an exported component matching the target name.
 */
function contentHasComponent(content, targetName) {
    const pascal = normalizeToWords(targetName)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join("");
    const patterns = [
        new RegExp(`export\\s+(default\\s+)?function\\s+${pascal}`, "i"),
        new RegExp(`export\\s+(default\\s+)?class\\s+${pascal}`, "i"),
        new RegExp(`export\\s+(const|let)\\s+${pascal}`, "i"),
        new RegExp(`function\\s+${pascal}\\s*\\(`, "i"),
        new RegExp(`<${pascal}[\\s/>]`, "i"),
    ];
    return patterns.some((p) => p.test(content));
}
// ═══════════════════════════════════════════════════════════════════════
// CATEGORY VERIFIERS
// ═══════════════════════════════════════════════════════════════════════
/**
 * Filter files matching any of the given directory prefix patterns.
 */
function filterByPaths(allFiles, prefixes) {
    return allFiles.filter((f) => prefixes.some((p) => f.startsWith(p) || f.includes(`/${p}`)));
}
// ── 1. Screens / Pages ──────────────────────────────────────────────
function verifyScreens(screens, allFiles, projectDir) {
    const routePrefixes = ["src/app", "src/pages", "src/views", "src/routes", "app/", "pages/"];
    const routeFiles = filterByPaths(allFiles, routePrefixes);
    return screens.map((screen) => {
        // Direct file name match
        const directMatch = routeFiles.find((f) => nameMatches(f, screen.name));
        if (directMatch) {
            return { id: slugify(screen.name), name: `Screen: ${screen.name}`, status: "met", reason: directMatch };
        }
        // Check content of route files for matching component export
        for (const rf of routeFiles) {
            const content = readFileSafe(path.join(projectDir, rf));
            if (contentHasComponent(content, screen.name)) {
                return { id: slugify(screen.name), name: `Screen: ${screen.name}`, status: "met", reason: rf };
            }
        }
        // Partial: similar file anywhere in project
        const partialMatch = allFiles.find((f) => {
            const words = normalizeToWords(screen.name);
            const fileWords = normalizeToWords(f);
            return words.some((w) => fileWords.some((fw) => fw.includes(w)));
        });
        if (partialMatch) {
            return { id: slugify(screen.name), name: `Screen: ${screen.name}`, status: "partial", reason: "Similar file found but not in expected route location" };
        }
        return { id: slugify(screen.name), name: `Screen: ${screen.name}`, status: "missing" };
    });
}
// ── 2. Components ────────────────────────────────────────────────────
function verifyComponents(components, allFiles, projectDir) {
    const componentPrefixes = ["src/components", "src/features", "components/", "src/ui"];
    const componentFiles = filterByPaths(allFiles, componentPrefixes);
    // Also include all tsx/jsx files as fallback
    const allComponentish = allFiles.filter((f) => /\.(tsx|jsx)$/.test(f));
    return components.map((comp) => {
        // Direct match in component directories
        const directMatch = componentFiles.find((f) => nameMatches(f, comp.name));
        if (directMatch) {
            return { id: slugify(comp.name), name: `Component: ${comp.name}`, status: "met", reason: directMatch };
        }
        // Content-based match in component dirs
        for (const cf of componentFiles) {
            const content = readFileSafe(path.join(projectDir, cf));
            if (contentHasComponent(content, comp.name)) {
                return { id: slugify(comp.name), name: `Component: ${comp.name}`, status: "met", reason: cf };
            }
        }
        // Fallback: any tsx/jsx file with matching name or export
        const fallback = allComponentish.find((f) => nameMatches(f, comp.name));
        if (fallback) {
            return { id: slugify(comp.name), name: `Component: ${comp.name}`, status: "met", reason: fallback };
        }
        for (const af of allComponentish) {
            const content = readFileSafe(path.join(projectDir, af));
            if (contentHasComponent(content, comp.name)) {
                return { id: slugify(comp.name), name: `Component: ${comp.name}`, status: "met", reason: af };
            }
        }
        return { id: slugify(comp.name), name: `Component: ${comp.name}`, status: "missing" };
    });
}
// ── 3. Data Views ────────────────────────────────────────────────────
function verifyDataViews(dataViews, allFiles, projectDir) {
    const allTsx = allFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
    return dataViews.map((dv) => {
        // Search for matching component by name
        let matchFile;
        for (const f of allTsx) {
            if (nameMatches(f, dv.name)) {
                matchFile = f;
                break;
            }
            const content = readFileSafe(path.join(projectDir, f));
            if (contentHasComponent(content, dv.name)) {
                matchFile = f;
                break;
            }
        }
        if (!matchFile) {
            // Try matching by type keywords (table, list, grid, etc.)
            const typeKeyword = (dv.type || dv.name).toLowerCase();
            for (const f of allTsx) {
                const content = readFileSafe(path.join(projectDir, f)).toLowerCase();
                if (content.includes(typeKeyword) && nameMatches(f, dv.name.replace(/(table|list|grid|card)/i, ""))) {
                    matchFile = f;
                    break;
                }
            }
        }
        if (!matchFile) {
            return { id: slugify(dv.name), name: `Data View: ${dv.name}`, status: "missing" };
        }
        // Check capabilities if specified
        const content = readFileSafe(path.join(projectDir, matchFile)).toLowerCase();
        const capabilities = dv.capabilities || [];
        const capabilityKeywords = {
            sort: ["sort", "sortable", "sortby", "onsort", "sortorder", "sortdirection"],
            filter: ["filter", "filterable", "onfilter", "filterby", "searchfilter"],
            pagination: ["pagination", "paginate", "page", "pagesize", "pagenumber", "nextpage", "prevpage"],
            search: ["search", "searchbar", "searchinput", "onsearch", "searchquery"],
        };
        let capsMet = 0;
        for (const cap of capabilities) {
            const keywords = capabilityKeywords[cap.toLowerCase()] || [cap.toLowerCase()];
            if (keywords.some((kw) => content.includes(kw))) {
                capsMet++;
            }
        }
        const capsTotal = capabilities.length;
        const capsRatio = capsTotal > 0 ? capsMet / capsTotal : 1;
        if (capsRatio >= 0.5) {
            return {
                id: slugify(dv.name), name: `Data View: ${dv.name}`,
                status: "met",
                reason: capsTotal > 0 ? `${matchFile} (${capsMet}/${capsTotal} capabilities found)` : matchFile,
            };
        }
        return {
            id: slugify(dv.name), name: `Data View: ${dv.name}`,
            status: "partial",
            reason: `${matchFile} — only ${capsMet}/${capsTotal} capabilities present`,
        };
    });
}
// ── 4. Forms ─────────────────────────────────────────────────────────
function verifyForms(forms, allFiles, projectDir) {
    const allTsx = allFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
    return forms.map((form) => {
        // Find a file matching the form name
        let matchFile;
        for (const f of allTsx) {
            if (nameMatches(f, form.name)) {
                matchFile = f;
                break;
            }
        }
        // Fallback: search for form components with matching name in content
        if (!matchFile) {
            for (const f of allTsx) {
                const content = readFileSafe(path.join(projectDir, f));
                if (contentHasComponent(content, form.name)) {
                    matchFile = f;
                    break;
                }
                // Also match if file contains <form> and the form name as text
                const formNameLower = form.name.toLowerCase();
                if (content.toLowerCase().includes("<form") && content.toLowerCase().includes(formNameLower)) {
                    matchFile = f;
                    break;
                }
            }
        }
        if (!matchFile) {
            return { id: slugify(form.name), name: `Form: ${form.name}`, status: "missing" };
        }
        const fields = form.fields || [];
        if (fields.length === 0) {
            return { id: slugify(form.name), name: `Form: ${form.name}`, status: "met", reason: matchFile };
        }
        // Check for field presence
        const content = readFileSafe(path.join(projectDir, matchFile)).toLowerCase();
        const fieldPatterns = fields.map((field) => {
            const fl = field.toLowerCase().replace(/\s+/g, "");
            return [
                fl,
                field.toLowerCase().replace(/\s+/g, "_"),
                field.toLowerCase().replace(/\s+/g, "-"),
            ];
        });
        let fieldsMet = 0;
        for (const variants of fieldPatterns) {
            const found = variants.some((v) => {
                return (content.includes(`name="${v}"`) ||
                    content.includes(`name='${v}'`) ||
                    content.includes(`label="${field_display(v)}"`) ||
                    content.includes(`label='${field_display(v)}'`) ||
                    content.includes(`"${v}"`) ||
                    content.includes(`>${field_display(v)}<`));
            });
            if (found)
                fieldsMet++;
        }
        const ratio = fieldsMet / fields.length;
        if (ratio >= 0.75) {
            return {
                id: slugify(form.name), name: `Form: ${form.name}`,
                status: "met",
                reason: `${matchFile} (${fieldsMet}/${fields.length} fields found)`,
            };
        }
        if (ratio > 0) {
            return {
                id: slugify(form.name), name: `Form: ${form.name}`,
                status: "partial",
                reason: `${matchFile} — only ${fieldsMet}/${fields.length} fields found`,
            };
        }
        return {
            id: slugify(form.name), name: `Form: ${form.name}`,
            status: "partial",
            reason: `${matchFile} — form file found but no matching fields detected`,
        };
    });
}
/** Convert snake/kebab back to display-ish form for label matching. */
function field_display(s) {
    return s
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .toLowerCase();
}
// ── 5. Actions ───────────────────────────────────────────────────────
function verifyActions(actions, allFiles, projectDir) {
    const allTsx = allFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
    return actions.map((action) => {
        const label = action.label;
        const labelLower = label.toLowerCase();
        // Search all source files for matching button/link text
        for (const f of allTsx) {
            const content = readFileSafe(path.join(projectDir, f));
            const contentLower = content.toLowerCase();
            const found = contentLower.includes(`>${labelLower}<`) ||
                contentLower.includes(`>${label}<`) ||
                contentLower.includes(`label="${labelLower}"`) ||
                contentLower.includes(`label="${label}"`) ||
                contentLower.includes(`title="${label}"`) ||
                contentLower.includes(`title="${labelLower}"`) ||
                contentLower.includes(`aria-label="${label}"`) ||
                contentLower.includes(`aria-label="${labelLower}"`) ||
                contentLower.includes(`"${label}"`) ||
                contentLower.includes(`'${label}'`);
            if (found) {
                // If destructive, check for confirmation pattern nearby
                if (action.destructive) {
                    const hasConfirmation = contentLower.includes("confirm") ||
                        contentLower.includes("dialog") ||
                        contentLower.includes("modal") ||
                        contentLower.includes("alertdialog") ||
                        contentLower.includes("are you sure");
                    if (!hasConfirmation) {
                        return {
                            id: slugify(label), name: `Action: ${label}`,
                            status: "partial",
                            reason: `${f} — destructive action found but no confirmation dialog detected`,
                        };
                    }
                }
                return { id: slugify(label), name: `Action: ${label}`, status: "met", reason: f };
            }
        }
        return { id: slugify(label), name: `Action: ${label}`, status: "missing" };
    });
}
function verifyStates(states, allFiles, projectDir) {
    const allTsx = allFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
    const statePatterns = {
        loading: ["loading", "isloading", "spinner", "skeleton", "loadingstate", "suspense", "fallback"],
        empty: ["empty", "nodata", "emptystate", "no results", "noresults", "nothing here", "no items"],
        error: ["error", "errorstate", "errorboundary", "errorpage", "alert", "toast.error", "onerror", "iserror"],
        success: ["success", "toast.success", "notification", "successstate", "saved", "created"],
        offline: ["offline", "offlinestate", "no connection", "reconnect"],
        permission: ["unauthorized", "forbidden", "403", "nopermission", "accessdenied"],
        permission_denied: ["unauthorized", "forbidden", "403", "nopermission", "accessdenied"],
        not_found: ["notfound", "404", "pagenotfound"],
        warning: ["warning", "warn", "caution"],
        info: ["info", "information", "notice"],
        blocked: ["blocked", "unavailable", "disabled"],
        skeleton: ["skeleton", "placeholder", "shimmer"],
        onboarding: ["onboarding", "welcome", "getting started", "setup"],
        approval_pending: ["pending", "awaiting", "approval"],
        upgrade_required: ["upgrade", "plan", "subscription"],
    };
    return states.map((stateObl) => {
        const stateName = stateObl.type.toLowerCase().replace(/[\s-_]+/g, "_");
        const patterns = statePatterns[stateName] || [stateName, stateObl.type.toLowerCase()];
        // If a specific screen is referenced, prefer checking those screen files first
        const screenFilesToCheck = stateObl.screen_id
            ? allTsx.filter((f) => nameMatches(f, stateObl.screen_id))
            : [];
        const filesToCheck = screenFilesToCheck.length > 0 ? screenFilesToCheck : allTsx;
        for (const f of filesToCheck) {
            const content = readFileSafe(path.join(projectDir, f)).toLowerCase();
            if (patterns.some((p) => content.includes(p))) {
                return { id: stateObl.state_id || slugify(stateObl.type), name: `State: ${stateObl.type}`, status: "met", reason: f };
            }
        }
        return { id: stateObl.state_id || slugify(stateObl.type), name: `State: ${stateObl.type}`, status: "missing" };
    });
}
// ── 7. Navigation ────────────────────────────────────────────────────
function verifyNavigation(navItems, allFiles, projectDir) {
    // Find nav-related files
    const navKeywords = ["nav", "sidebar", "header", "menu", "layout", "navbar", "appshell", "shell"];
    const allTsx = allFiles.filter((f) => /\.(tsx|jsx|ts|js)$/.test(f));
    const navFiles = allTsx.filter((f) => {
        const basename = path.basename(f, path.extname(f)).toLowerCase();
        return navKeywords.some((k) => basename.includes(k));
    });
    // Also check layout files
    const layoutFiles = allTsx.filter((f) => f.toLowerCase().includes("layout"));
    const filesToCheck = [...new Set([...navFiles, ...layoutFiles])];
    return navItems.map((item) => {
        const labelLower = item.label.toLowerCase();
        for (const f of filesToCheck) {
            const content = readFileSafe(path.join(projectDir, f)).toLowerCase();
            const found = content.includes(`>${labelLower}<`) ||
                content.includes(`"${labelLower}"`) ||
                content.includes(`'${labelLower}'`) ||
                content.includes(`label: "${labelLower}"`) ||
                content.includes(`label: '${labelLower}'`) ||
                content.includes(`title="${labelLower}"`) ||
                content.includes(`title='${labelLower}'`);
            if (found) {
                return { id: slugify(item.label), name: `Nav: ${item.label}`, status: "met", reason: f };
            }
        }
        // Fallback: check route matches if provided
        if (item.route) {
            const routeFiles = allTsx.filter((f) => f.includes(item.route.replace(/^\//, "")));
            if (routeFiles.length > 0) {
                return {
                    id: slugify(item.label), name: `Nav: ${item.label}`,
                    status: "partial",
                    reason: `${routeFiles[0]} — route file exists but nav label not found in navigation component`,
                };
            }
        }
        return { id: slugify(item.label), name: `Nav: ${item.label}`, status: "missing" };
    });
}
// ═══════════════════════════════════════════════════════════════════════
// MAIN VERIFIER
// ═══════════════════════════════════════════════════════════════════════
/**
 * Extract design constraints from evidence, optionally filtered by feature_id.
 */
function extractConstraints(evidence, featureId) {
    // If the evidence has a constraints property, use it directly
    if ("constraints" in evidence && evidence.constraints) {
        const c = evidence.constraints;
        if (!featureId)
            return c;
        // Filter by feature_id if present on constraint items
        return c;
    }
    // Build constraints from top-level evidence arrays
    return {
        required_screens: (evidence.screens || []).map(s => ({ screen_id: s.screen_id, name: s.name, purpose: s.purpose })),
        required_components: (evidence.components || []).map(c => ({ component_id: c.component_id, name: c.name, category: c.category })),
        required_data_views: (evidence.data_views || []).map(d => ({ view_id: d.view_id, name: d.name, type: d.type, columns: d.columns.map(c => c.name), capabilities: d.capabilities })),
        required_forms: (evidence.forms || []).map(f => ({ form_id: f.form_id, name: f.name, fields: f.fields.map(fl => fl.name) })),
        required_actions: (evidence.actions || []).map(a => ({ action_id: a.action_id, label: a.label, type: a.type, is_destructive: a.is_destructive })),
        required_states: (evidence.states || []).map(s => ({ state_id: s.state_id, type: s.type, screen_id: s.screen_id })),
        required_nav: (evidence.navigation?.primary_items || []).map(n => ({ label: n.label, target_screen_id: n.target_screen_id, level: n.level })),
    };
}
export async function verifyDesignImplementation(evidence, projectDir, options) {
    const resolvedDir = path.resolve(projectDir);
    if (!fs.existsSync(resolvedDir)) {
        return {
            status: "FAIL",
            coverage: 0,
            screens: [], components: [], data_views: [], forms: [], actions: [], states: [], navigation: [],
            summary: { total_obligations: 0, met: 0, missing: 0, partial: 0 },
        };
    }
    const allFiles = collectFiles(resolvedDir);
    const constraints = options?.constraints || extractConstraints(evidence, options?.feature_id);
    const items = [];
    // Run all category verifiers
    const screenItems = verifyScreens(constraints.required_screens || [], allFiles, resolvedDir);
    const componentItems = verifyComponents(constraints.required_components || [], allFiles, resolvedDir);
    const dataViewItems = verifyDataViews(constraints.required_data_views || [], allFiles, resolvedDir);
    const formItems = verifyForms(constraints.required_forms || [], allFiles, resolvedDir);
    const actionItems = verifyActions(constraints.required_actions || [], allFiles, resolvedDir);
    const stateItems = verifyStates(constraints.required_states || [], allFiles, resolvedDir);
    const navItems = verifyNavigation(constraints.required_nav || [], allFiles, resolvedDir);
    items.push(...screenItems, ...componentItems, ...dataViewItems, ...formItems, ...actionItems, ...stateItems, ...navItems);
    // Scoring
    const metCount = items.filter((i) => i.status === "met").length;
    const partialCount = items.filter((i) => i.status === "partial").length;
    const missingCount = items.filter((i) => i.status === "missing").length;
    const total = items.length;
    const coverage = total > 0 ? metCount / total : 1;
    const strictness = options?.strictness || "lenient";
    let status;
    if (strictness === "strict") {
        status = coverage >= 0.95 ? "PASS" : coverage >= 0.8 ? "WARN" : "FAIL";
    }
    else {
        status = coverage >= 0.9 ? "PASS" : coverage >= 0.7 ? "WARN" : "FAIL";
    }
    return {
        status,
        coverage,
        screens: screenItems,
        components: componentItems,
        data_views: dataViewItems,
        forms: formItems,
        actions: actionItems,
        states: stateItems,
        navigation: navItems,
        summary: {
            total_obligations: total,
            met: metCount,
            missing: missingCount,
            partial: partialCount,
        },
    };
}
// ═══════════════════════════════════════════════════════════════════════
// REPORT PRINTER
// ═══════════════════════════════════════════════════════════════════════
function printReport(result) {
    const bar = "\u2550".repeat(50);
    console.log(`\nDESIGN VERIFICATION REPORT`);
    console.log(bar);
    console.log();
    const categories = [
        { label: "Screens", items: result.screens },
        { label: "Components", items: result.components },
        { label: "Data Views", items: result.data_views },
        { label: "Forms", items: result.forms },
        { label: "Actions", items: result.actions },
        { label: "States", items: result.states },
        { label: "Navigation", items: result.navigation },
    ];
    for (const cat of categories) {
        const met = cat.items.filter(i => i.status === "met").length;
        const total = cat.items.length;
        const pad = " ".repeat(Math.max(0, 14 - cat.label.length));
        const missing = cat.items.filter(i => i.status !== "met");
        const missingStr = missing.length > 0
            ? ` (${missing.map(m => `${m.status}: "${m.name}"`).join(", ")})`
            : "";
        console.log(`  ${cat.label}:${pad}${met}/${total} met${missingStr}`);
    }
    console.log();
    const pct = Math.round(result.coverage * 100);
    console.log(`  Overall: ${result.summary.met}/${result.summary.total_obligations} obligations met (${pct}%) \u2014 ${result.status}`);
    const allMissing = [...result.screens, ...result.components, ...result.data_views, ...result.forms, ...result.actions, ...result.states, ...result.navigation].filter(i => i.status !== "met");
    if (allMissing.length > 0) {
        console.log();
        console.log(`  MISSING / PARTIAL:`);
        for (const m of allMissing) {
            const tag = m.status === "partial" ? "PARTIAL" : "MISSING";
            const reason = m.reason ? ` \u2014 ${m.reason}` : "";
            console.log(`    [${tag}] ${m.name}${reason}`);
        }
    }
    console.log();
    console.log(bar);
    console.log();
}
// ═══════════════════════════════════════════════════════════════════════
// GRAPH WRITER — persist verification result to Neo4j
// ═══════════════════════════════════════════════════════════════════════
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
export async function writeVerificationToGraph(result, evidenceId, neo4jRun) {
    const verificationId = `dv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await neo4jRun(`
    MERGE (v:DesignVerification {verification_id: '${esc(verificationId)}'})
    SET v.evidence_id = '${esc(evidenceId)}',
        v.status = '${esc(result.status)}',
        v.coverage = ${result.coverage},
        v.total = ${result.summary.total_obligations},
        v.met = ${result.summary.met},
        v.partial = ${result.summary.partial},
        v.missing = ${result.summary.missing},
        v.verified_at = '${new Date().toISOString()}'
    WITH v
    OPTIONAL MATCH (e:DesignEvidence {evidence_id: '${esc(evidenceId)}'})
    FOREACH (_ IN CASE WHEN e IS NOT NULL THEN [1] ELSE [] END |
      MERGE (e)-[:VERIFIED_BY]->(v)
    )
  `);
    return { nodesCreated: 1 };
}
// ═══════════════════════════════════════════════════════════════════════
// CLI ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        console.log(`
Usage:
  npx tsx src/tools/design-verify.ts --evidence <evidence.json> --project <dir>
  npx tsx src/tools/design-verify.ts --constraints <constraints.json> --project <dir>

Options:
  --evidence <file>      Path to DesignEvidence JSON file
  --constraints <file>   Path to DesignConstraints JSON file (from bridge)
  --project <dir>        Path to built project directory
  --feature <id>         Only check constraints for a specific feature
  --strict               Use strict scoring thresholds
  --graph-id <id>        Evidence ID in Neo4j graph (loads from graph instead of file)
  --write-graph          Write verification result back to Neo4j
`);
        return;
    }
    function getArg(flag) {
        const idx = args.indexOf(flag);
        return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
    }
    const evidencePath = getArg("--evidence");
    const constraintsPath = getArg("--constraints");
    const projectDir = getArg("--project");
    const featureId = getArg("--feature");
    const graphId = getArg("--graph-id");
    const strict = args.includes("--strict");
    const writeGraph = args.includes("--write-graph");
    if (!projectDir) {
        console.error("ERROR: --project is required");
        process.exit(1);
    }
    if (!evidencePath && !constraintsPath && !graphId) {
        console.error("ERROR: one of --evidence, --constraints, or --graph-id is required");
        process.exit(1);
    }
    let evidence;
    let constraints;
    let evidenceIdForGraph = graphId || "cli-run";
    if (graphId) {
        // Load from Neo4j
        const neo4j = getNeo4jService();
        const connected = await neo4j.connect();
        if (!connected) {
            console.error("ERROR: could not connect to Neo4j to load evidence");
            process.exit(1);
        }
        const rows = await neo4j.runCypher(`MATCH (e:DesignEvidence {evidence_id: $id}) RETURN e.data AS data`, { id: graphId });
        if (rows.length === 0) {
            console.error(`ERROR: no DesignEvidence node found with id '${graphId}'`);
            await neo4j.close();
            process.exit(1);
        }
        evidence = JSON.parse(rows[0].data);
        await neo4j.close();
    }
    else if (constraintsPath) {
        const raw = fs.readFileSync(constraintsPath, "utf-8");
        constraints = JSON.parse(raw);
        evidence = {}; // constraints override evidence
        evidenceIdForGraph = constraintsPath;
    }
    else {
        const raw = fs.readFileSync(evidencePath, "utf-8");
        evidence = JSON.parse(raw);
        evidenceIdForGraph = evidencePath;
    }
    const result = await verifyDesignImplementation(evidence, projectDir, {
        feature_id: featureId,
        constraints,
        strictness: strict ? "strict" : "lenient",
    });
    printReport(result);
    // Optionally write to graph
    if (writeGraph) {
        const neo4j = getNeo4jService();
        const connected = await neo4j.connect();
        if (connected) {
            const graphResult = await writeVerificationToGraph(result, evidenceIdForGraph, (cypher, params) => neo4j.runCypher(cypher, params));
            console.log(`  Graph: ${graphResult.nodesCreated} verification node written`);
            await neo4j.close();
        }
        else {
            console.log("  Warning: Neo4j not available, verification not persisted to graph");
        }
    }
    // Exit with appropriate code
    if (result.status === "FAIL") {
        process.exit(1);
    }
}
main().catch((err) => {
    console.error("Design verification failed:", err);
    process.exit(1);
});
