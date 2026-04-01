/**
 * learn-app.ts — Unified codebase learner (v2). Analyzes ALL layers of an existing
 * app and writes typed knowledge to Neo4j using the LearnedApp schema.
 *
 * v2 improvements: recursive discovery — finds schemas, components, pages, routes,
 * and integrations regardless of where they live in the repo structure.
 *
 * Layers:
 *   1. Tech Stack         — framework, DB, ORM, build tool, key packages
 *   2. Features           — feature modules with complexity, tests, API surface
 *   3. Data Models        — Prisma/Drizzle/TypeORM models with typed fields and relations
 *   4. Integrations       — third-party services with auth methods
 *   5. API Surface        — REST, tRPC, GraphQL, NestJS routes grouped by domain
 *   6. UI Components      — component library categorized by function
 *   7. Pages & Navigation — route structure, nav items, breadcrumbs
 *   8. Design System      — colors, typography, spacing, component lib
 *   9. User Flows         — onboarding, booking, settings, etc.
 *  10. Form Patterns      — validation, form library, multi-step
 *  11. State Patterns     — loading, empty, error, notification
 *  12. Auth Patterns      — login, roles, permissions, session management
 *  13. Testing Patterns   — test structure, frameworks, coverage approach
 *  14. Error Handling     — try/catch, error boundaries, retry logic
 *  15. Deployment Config  — Docker, CI/CD, env vars, infra
 *  16. Security Patterns  — CSP, sanitization, rate limiting
 *
 * Usage:
 *   npx tsx src/tools/learn-app.ts /path/to/codebase [--source-url=https://github.com/...]
 *
 * Output: Typed LearnedApp object → Neo4j nodes with proper labels
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getNeo4jService } from "../services/neo4j-service.js";
import { LEARNED_SCHEMA_VERSION, LEARNED_NODE_LABELS as L, LEARNED_RELATIONSHIPS as R, } from "../types/learned-knowledge.js";
// ─── File Utilities ─────────────────────────────────────────────────
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".git", ".turbo", "coverage", "__pycache__", ".cache", "build", "out", ".output"]);
function readFile(p, max = 500) {
    try {
        return fs.readFileSync(p, "utf-8").split("\n").slice(0, max).join("\n");
    }
    catch {
        return "";
    }
}
function readJson(p) {
    try {
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return null;
    }
}
function exists(p) {
    return fs.existsSync(p);
}
/** Recursively find files matching regex. Skips node_modules, dist, .git etc. */
function findFiles(dir, re, maxDepth = 6, d = 0) {
    if (d >= maxDepth)
        return [];
    const out = [];
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                continue;
            const fp = path.join(dir, e.name);
            if (e.isDirectory())
                out.push(...findFiles(fp, re, maxDepth, d + 1));
            else if (re.test(e.name))
                out.push(fp);
        }
    }
    catch { }
    return out;
}
/** Recursively find directories matching regex */
function findDirs(dir, re, maxDepth = 5, d = 0) {
    if (d >= maxDepth)
        return [];
    const out = [];
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                continue;
            const fp = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (re.test(e.name))
                    out.push(fp);
                out.push(...findDirs(fp, re, maxDepth, d + 1));
            }
        }
    }
    catch { }
    return out;
}
function countFiles(dir, exts) {
    let n = 0;
    try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                continue;
            const fp = path.join(dir, e.name);
            if (e.isDirectory())
                n += countFiles(fp, exts);
            else if (exts.length === 0 || exts.some(x => e.name.endsWith(x)))
                n++;
        }
    }
    catch { }
    return n;
}
function allDeps(root) {
    const deps = new Set();
    const pkgFiles = findFiles(root, /^package\.json$/, 4);
    for (const pf of pkgFiles) {
        const pkg = readJson(pf);
        if (pkg?.dependencies)
            Object.keys(pkg.dependencies).forEach(d => deps.add(d));
        if (pkg?.devDependencies)
            Object.keys(pkg.devDependencies).forEach(d => deps.add(d));
    }
    return [...deps];
}
function has(deps, ...needles) {
    return needles.some(n => deps.some(d => d.includes(n)));
}
function detect(deps, pairs) {
    for (const [needle, label] of pairs) {
        if (deps.some(d => d.includes(needle)))
            return label;
    }
    return "unknown";
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 1: Tech Stack
// ═══════════════════════════════════════════════════════════════════════
function scanTechStack(root, deps) {
    return {
        framework: detect(deps, [["next", "Next.js"], ["nuxt", "Nuxt"], ["remix", "Remix"], ["@remix-run", "Remix"], ["svelte", "SvelteKit"], ["@nestjs", "NestJS"], ["express", "Express"], ["fastify", "Fastify"], ["hono", "Hono"], ["@angular", "Angular"], ["vue", "Vue"]]),
        language: findFiles(root, /tsconfig\.json$/, 3).length > 0 ? "TypeScript" : "JavaScript",
        runtime: has(deps, "bun") ? "Bun" : has(deps, "deno") ? "Deno" : "Node.js",
        database: detect(deps, [["prisma", "PostgreSQL (Prisma)"], ["@prisma", "PostgreSQL (Prisma)"], ["mongoose", "MongoDB"], ["drizzle", "SQL (Drizzle)"], ["typeorm", "SQL (TypeORM)"], ["convex", "Convex"], ["@supabase", "Supabase"], ["firebase", "Firebase"], ["better-sqlite3", "SQLite"], ["pg", "PostgreSQL"]]),
        orm: detect(deps, [["prisma", "Prisma"], ["@prisma", "Prisma"], ["drizzle", "Drizzle"], ["typeorm", "TypeORM"], ["mongoose", "Mongoose"], ["kysely", "Kysely"], ["sequelize", "Sequelize"]]),
        styling: detect(deps, [["tailwindcss", "Tailwind CSS"], ["styled-components", "Styled Components"], ["@emotion", "Emotion"], ["sass", "SASS"], ["@vanilla-extract", "Vanilla Extract"]]),
        testing: detect(deps, [["vitest", "Vitest"], ["jest", "Jest"], ["playwright", "Playwright"], ["cypress", "Cypress"], ["mocha", "Mocha"]]),
        build_tool: detect(deps, [["turbo", "Turborepo"], ["nx", "Nx"], ["lerna", "Lerna"], ["vite", "Vite"], ["webpack", "Webpack"], ["esbuild", "esbuild"]]),
        monorepo: !!(readJson(path.join(root, "package.json"))?.workspaces) || exists(path.join(root, "turbo.json")) || exists(path.join(root, "nx.json")) || exists(path.join(root, "pnpm-workspace.yaml")),
        key_packages: deps.slice(0, 80),
    };
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 2: Features — recursive discovery
// ═══════════════════════════════════════════════════════════════════════
const FEAT_DESC = {
    auth: "Authentication and authorization", bookings: "Booking management and scheduling",
    availability: "Availability configuration", calendars: "Calendar integration and sync",
    payments: "Payment processing and billing", webhooks: "Webhook subscription and delivery",
    workflows: "Workflow automation", notifications: "Notification delivery",
    onboarding: "User onboarding flow", settings: "User and system settings",
    organizations: "Organization and team management", insights: "Analytics and reporting",
    embed: "Embeddable widget support", users: "User management", teams: "Team management",
    schedules: "Schedule management", eventtypes: "Event type configuration",
    credentials: "Credential and OAuth management", apps: "App/integration management",
    slots: "Time slot calculation", profile: "User profile", membership: "Team membership and roles",
    conferencing: "Video conferencing", credits: "Credit balance management",
    emails: "Email templates and delivery", sms: "SMS notifications",
    deployment: "Deployment configuration", flags: "Feature flags",
    documents: "Document management", signing: "Document signing",
    templates: "Template management", recipients: "Recipient management",
    issues: "Issue tracking", projects: "Project management", cycles: "Sprint/cycle management",
    modules: "Module management", views: "Custom views", labels: "Label management",
    estimates: "Time/effort estimates", pages: "Wiki/page management",
    chat: "Chat and messaging", agents: "AI agent management", plugins: "Plugin system",
    models: "AI model management", knowledge: "Knowledge base", market: "Marketplace",
    inbox: "Inbox management", tracker: "Time tracking", invoices: "Invoice management",
    transactions: "Transaction management", accounts: "Account management",
    surveys: "Survey creation and management", responses: "Response collection",
    contacts: "Contact management", segments: "User segmentation",
    triggers: "Event triggers", jobs: "Background job execution",
    runs: "Job run management", queues: "Queue management",
    collections: "Collection management", environments: "Environment management",
    // Extended coverage for more app types
    products: "Product catalog management", orders: "Order lifecycle management",
    carts: "Shopping cart management", shipping: "Shipping and fulfillment",
    discounts: "Discount and coupon management", regions: "Regional configuration",
    inventory: "Inventory tracking", returns: "Return and refund management",
    customers: "Customer data management", subscribers: "Subscriber management",
    channels: "Communication channel management", campaigns: "Campaign management",
    digest: "Notification digest grouping", topics: "Topic subscription management",
    certificates: "Certificate lifecycle management", secrets: "Secret storage and rotation",
    roles: "Role definition and assignment", permissions: "Permission management",
    identity: "Identity provider management", session: "Session management",
    sso: "Single sign-on integration", mfa: "Multi-factor authentication",
    pageviews: "Pageview tracking", visitors: "Visitor analytics",
    events: "Event tracking and reporting", funnels: "Funnel analysis",
    goals: "Goal tracking", realtime: "Real-time data monitoring",
    messages: "Message handling", threads: "Threaded conversations",
    rooms: "Chat room management", video: "Video conferencing",
    files: "File storage and sharing", mentions: "User mention system",
    reactions: "Reaction/emoji system", search: "Search functionality",
    export: "Data export", import: "Data import",
    billing: "Billing and subscription management", plans: "Plan/pricing management",
    audit: "Audit logging", activity: "Activity feed",
    dashboard: "Dashboard and analytics views", reports: "Report generation",
    pipeline: "Pipeline management", deals: "Deal tracking",
    companies: "Company/organization management", people: "People/contact management",
    notes: "Note-taking", tasks: "Task management",
    tags: "Tag/label system", filters: "Filter and view management",
    automation: "Automation rules and triggers", middleware: "Request middleware",
    storage: "Object/file storage", cache: "Caching layer",
    migration: "Data migration tools", seed: "Database seeding",
    health: "Health check endpoints", metrics: "Application metrics",
    localization: "Language/locale management", themes: "Theme customization",
};
function addFeatureFromDir(root, fp, dirName, seen, features) {
    const key = dirName.toLowerCase().replace(/[-_]/g, "");
    if (seen.has(key))
        return;
    const fc = countFiles(fp, [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte"]);
    if (fc === 0)
        return;
    seen.add(key);
    const pkg = readJson(path.join(fp, "package.json"));
    const hasTests = countFiles(fp, [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx", ".test.js"]) > 0;
    const hasApi = countFiles(fp, [".handler.ts", ".controller.ts", ".router.ts"]) > 0 ||
        exists(path.join(fp, "api")) || exists(path.join(fp, "routes")) ||
        exists(path.join(fp, "controllers"));
    const nameLower = dirName.toLowerCase().replace(/[-_]/g, "");
    let desc = Object.entries(FEAT_DESC).find(([k]) => nameLower.includes(k))?.[1] || pkg?.description || `${dirName} module`;
    // Try to get a better description from the feature's index file or README
    let betterDesc = "";
    for (const indexFile of ["index.ts", "index.tsx", "index.js", "README.md", "readme.md"]) {
        const indexPath = path.join(fp, indexFile);
        if (exists(indexPath)) {
            const content = readFile(indexPath, 20);
            // Look for JSDoc comment, export description, or first meaningful line
            const jsdocMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+)/);
            const commentMatch = content.match(/\/\/\s*(.{10,80})/);
            const readmeMatch = content.match(/^#\s+.+\n+(.{10,150})/m);
            betterDesc = jsdocMatch?.[1]?.trim() || readmeMatch?.[1]?.trim() || commentMatch?.[1]?.trim() || "";
            if (betterDesc)
                break;
        }
    }
    if (betterDesc && betterDesc.length > 10) {
        desc = betterDesc;
    }
    features.push({
        feature_id: `feat-${dirName}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
        name: dirName.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        description: desc,
        directory: path.relative(root, fp),
        complexity: fc > 50 ? "complex" : fc > 15 ? "moderate" : "simple",
        file_count: fc,
        has_tests: hasTests,
        has_api: hasApi,
        dependencies: pkg?.dependencies ? Object.keys(pkg.dependencies) : [],
        related_data_models: [],
        related_integrations: [],
    });
}
function scanFeatures(root) {
    const features = [];
    const seen = new Set();
    // ── Strategy 1: Classic feature/module/domain directories ──
    const featureDirPatterns = [
        /^features$/i, /^modules$/i, /^domains$/i,
    ];
    const fixedDirs = [
        "packages/features", "src/features", "src/modules", "src/domains",
        "packages", "apps", "modules", "internal-packages",
    ];
    for (const pat of featureDirPatterns) {
        const found = findDirs(root, pat, 4);
        for (const d of found) {
            const rel = path.relative(root, d);
            if (!fixedDirs.includes(rel))
                fixedDirs.push(rel);
        }
    }
    for (const dir of fixedDirs) {
        const full = path.join(root, dir);
        if (!exists(full))
            continue;
        try {
            for (const e of fs.readdirSync(full, { withFileTypes: true })) {
                if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                    continue;
                addFeatureFromDir(root, path.join(full, e.name), e.name, seen, features);
            }
        }
        catch { }
    }
    // ── Strategy 2: Service-based features (backend services pattern) ──
    // Common in NestJS, Express, Fastify apps: src/services/*, services/*
    const serviceDirPatterns = [/^services$/i, /^usecases$/i, /^use-cases$/i];
    for (const pat of serviceDirPatterns) {
        for (const svcDir of findDirs(root, pat, 5)) {
            const rel = path.relative(root, svcDir);
            if (rel.includes("node_modules"))
                continue;
            try {
                for (const e of fs.readdirSync(svcDir, { withFileTypes: true })) {
                    if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                        continue;
                    addFeatureFromDir(root, path.join(svcDir, e.name), e.name, seen, features);
                }
            }
            catch { }
        }
    }
    // ── Strategy 3: API route-based features ──
    // REST APIs organized as api/routes/*, api/admin/*, api/store/*
    const apiRouteDirs = [];
    for (const pat of [/^routes$/i, /^admin$/i, /^store$/i]) {
        for (const d of findDirs(root, pat, 6)) {
            const rel = path.relative(root, d);
            if (rel.includes("node_modules"))
                continue;
            // Only count if it's under an api/ directory or looks like an API routes dir
            if (/api|server|backend/i.test(rel) || /routes/i.test(path.basename(d))) {
                apiRouteDirs.push(d);
            }
        }
    }
    for (const routeDir of apiRouteDirs) {
        try {
            for (const e of fs.readdirSync(routeDir, { withFileTypes: true })) {
                if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                    continue;
                // Skip common non-feature dirs inside api routes
                if (/^(middlewares?|utils?|helpers?|hooks?|validators?)$/i.test(e.name))
                    continue;
                addFeatureFromDir(root, path.join(routeDir, e.name), e.name, seen, features);
            }
        }
        catch { }
    }
    // ── Strategy 4: NestJS module-based features ──
    // Each .module.ts file represents a feature module
    const moduleFiles = findFiles(root, /\.module\.(ts|js)$/, 6);
    for (const mf of moduleFiles) {
        const rel = path.relative(root, mf);
        if (rel.includes("node_modules"))
            continue;
        const dirName = path.basename(path.dirname(mf));
        const key = dirName.toLowerCase().replace(/[-_]/g, "");
        if (seen.has(key) || SKIP_DIRS.has(dirName) || dirName === "src" || dirName === "app")
            continue;
        addFeatureFromDir(root, path.dirname(mf), dirName, seen, features);
    }
    // ── Strategy 5: NestJS/Express controller-based features ──
    // Each .controller.ts represents a feature if its parent dir isn't already captured
    const controllerFiles = findFiles(root, /\.controller\.(ts|js)$/, 6);
    for (const cf of controllerFiles) {
        const rel = path.relative(root, cf);
        if (rel.includes("node_modules"))
            continue;
        const dirName = path.basename(path.dirname(cf));
        const key = dirName.toLowerCase().replace(/[-_]/g, "");
        if (seen.has(key) || SKIP_DIRS.has(dirName) || dirName === "src" || dirName === "app")
            continue;
        addFeatureFromDir(root, path.dirname(cf), dirName, seen, features);
    }
    // ── Strategy 6: Next.js app router route groups ──
    // (dashboard)/settings, (main)/analytics etc — groups in parentheses or top-level dirs
    for (const appDir of findDirs(root, /^app$/, 4)) {
        const rel = path.relative(root, appDir);
        if (rel.includes("node_modules"))
            continue;
        try {
            for (const e of fs.readdirSync(appDir, { withFileTypes: true })) {
                if (!e.isDirectory() || e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                    continue;
                // Skip common non-feature dirs
                if (/^(api|_|fonts|images|styles|lib|utils|components)/.test(e.name))
                    continue;
                // Route groups in parentheses — scan their children as features
                if (e.name.startsWith("(")) {
                    const groupDir = path.join(appDir, e.name);
                    try {
                        for (const child of fs.readdirSync(groupDir, { withFileTypes: true })) {
                            if (!child.isDirectory() || child.name.startsWith(".") || child.name.startsWith("_"))
                                continue;
                            addFeatureFromDir(root, path.join(groupDir, child.name), child.name, seen, features);
                        }
                    }
                    catch { }
                }
                else {
                    // Top-level app routes as features
                    addFeatureFromDir(root, path.join(appDir, e.name), e.name, seen, features);
                }
            }
        }
        catch { }
    }
    // ── Strategy 7: Query/handler file-based features (for data-heavy apps) ──
    // When dirs like src/queries/sql/ have files like getPageviewStats.ts, getSessionStats.ts
    // Group by filename prefix patterns
    for (const queryDir of findDirs(root, /^(queries|handlers|resolvers)$/i, 5)) {
        const rel = path.relative(root, queryDir);
        if (rel.includes("node_modules"))
            continue;
        const queryFiles = findFiles(queryDir, /\.(ts|js)$/, 3);
        // Group by common prefix: getUser*, getSession* → user, session
        const prefixGroups = new Map();
        for (const qf of queryFiles) {
            const name = path.basename(qf, path.extname(qf));
            // Extract domain from camelCase: getPageviewStats → pageview, createTeam → team
            const match = name.match(/^(?:get|create|update|delete|find|list|fetch|search|remove|set)([A-Z]\w+?)(?:Stats|Data|List|Count|By|Info|Details)?$/);
            if (match) {
                const domain = match[1].toLowerCase();
                prefixGroups.set(domain, (prefixGroups.get(domain) || 0) + 1);
            }
        }
        // Create features for domains with 2+ query files
        for (const [domain, count] of prefixGroups) {
            if (count >= 2 && !seen.has(domain)) {
                seen.add(domain);
                const desc = FEAT_DESC[domain] || `${domain} data operations`;
                features.push({
                    feature_id: `feat-${domain}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
                    name: domain.charAt(0).toUpperCase() + domain.slice(1),
                    description: desc,
                    directory: path.relative(root, queryDir),
                    complexity: count > 10 ? "complex" : count > 4 ? "moderate" : "simple",
                    file_count: count,
                    has_tests: false,
                    has_api: true,
                    dependencies: [],
                    related_data_models: [],
                    related_integrations: [],
                });
            }
        }
    }
    return features;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 3: Data Models — recursive Prisma + Drizzle + TypeORM discovery
// ═══════════════════════════════════════════════════════════════════════
function categorizeModel(name) {
    const l = name.toLowerCase();
    const map = [
        [["user", "account", "session", "password", "profile", "membership", "role", "identity"], "auth_identity"],
        [["booking", "attendee", "seat", "schedule", "availability", "slot", "host", "appointment"], "scheduling"],
        [["payment", "billing", "credit", "proration", "subscription", "invoice", "transaction", "price"], "payments"],
        [["workflow", "step", "reminder", "trigger", "action", "automation", "job", "run", "queue"], "automation"],
        [["webhook", "apikey", "ratelimit", "app", "connector", "integration"], "integration"],
        [["team", "organization", "domain", "managed", "workspace", "company", "department"], "organization"],
        [["calendar", "event", "destination"], "calendar"],
        [["routing", "form", "response", "survey", "question", "answer", "submission"], "routing"],
        [["audit", "report", "watchlist", "log", "activity"], "audit"],
        [["feature", "flag", "deployment", "config", "setting", "preference"], "infrastructure"],
        [["credential", "oauth", "token", "access", "apitoken", "passkey"], "auth_oauth"],
        [["notification", "email", "sms", "verified", "message", "alert"], "notifications"],
        [["document", "template", "field", "recipient", "signature", "signing"], "general"],
        [["issue", "project", "cycle", "module", "label", "estimate", "state", "page", "view"], "general"],
        [["chat", "conversation", "thread", "agent", "plugin", "model", "knowledge"], "general"],
    ];
    for (const [kws, cat] of map) {
        if (kws.some(k => l.includes(k)))
            return cat;
    }
    return "general";
}
function scanDataModels(root) {
    const models = [];
    const seen = new Set();
    // ── Prisma schemas: find ALL schema.prisma files anywhere ──
    const prismaFiles = findFiles(root, /^schema\.prisma$/, 6);
    for (const pf of prismaFiles) {
        const content = fs.readFileSync(pf, "utf-8");
        const re = /model\s+(\w+)\s*\{([^}]+)\}/g;
        let m;
        while ((m = re.exec(content)) !== null) {
            const [, name, body] = m;
            if (seen.has(name))
                continue;
            seen.add(name);
            const fields = [];
            const relations = [];
            for (const line of body.split("\n")) {
                const t = line.trim();
                if (!t || t.startsWith("//") || t.startsWith("@@"))
                    continue;
                const fm = t.match(/^(\w+)\s+(\w+)(\[\])?\s*(\?)?\s*/);
                if (!fm)
                    continue;
                const [, fname, ftype, isArray, isOpt] = fm;
                const isId = t.includes("@id") || t.includes("@default(uuid") || t.includes("@default(cuid");
                const isUnique = t.includes("@unique");
                fields.push({
                    name: fname,
                    type: ftype + (isArray || ""),
                    required: !isOpt,
                    is_id: isId,
                    is_unique: isUnique,
                });
                if (t.includes("@relation")) {
                    const relType = isArray ? "one_to_many" : "one_to_one";
                    relations.push({ target_model: ftype, type: relType, field_name: fname });
                }
            }
            models.push({ name, category: categorizeModel(name), fields, relations, schema_source: m[0].slice(0, 2000) });
        }
    }
    // ── Drizzle schemas: find files with drizzle table definitions ──
    const drizzleFiles = findFiles(root, /schema\.(ts|js)$/, 6);
    for (const df of drizzleFiles) {
        const rel = path.relative(root, df);
        // Skip node_modules and non-schema files
        if (rel.includes("node_modules") || rel.includes("zod"))
            continue;
        const content = readFile(df, 300);
        // Look for pgTable, mysqlTable, sqliteTable definitions
        const tableRe = /(?:pgTable|mysqlTable|sqliteTable)\s*\(\s*['"](\w+)['"]/g;
        let tm;
        while ((tm = tableRe.exec(content)) !== null) {
            const name = tm[1];
            if (seen.has(name))
                continue;
            seen.add(name);
            // Extract column definitions
            const fields = [];
            // Simple heuristic: find column-like definitions near this table
            const tableStart = tm.index;
            const chunk = content.slice(tableStart, tableStart + 2000);
            const colRe = /(\w+)\s*:\s*(?:varchar|text|integer|boolean|timestamp|serial|uuid|bigint|json|real|decimal|smallint|char|date|time|numeric)\b/g;
            let cm;
            while ((cm = colRe.exec(chunk)) !== null) {
                fields.push({
                    name: cm[1],
                    type: cm[0].split(":")[1]?.trim().split(/[(\s]/)[0] || "unknown",
                    required: true,
                    is_id: cm[1] === "id",
                    is_unique: chunk.slice(cm.index, cm.index + 200).includes("unique"),
                });
            }
            // Extract the full table definition as source code
            const tableChunk = content.slice(tableStart, tableStart + 2000);
            const closingParen = tableChunk.indexOf(");");
            const tableSource = closingParen > 0 ? tableChunk.slice(0, closingParen + 2) : tableChunk.slice(0, 1000);
            models.push({
                name: name.charAt(0).toUpperCase() + name.slice(1),
                category: categorizeModel(name),
                fields,
                relations: [],
                schema_source: tableSource,
            });
        }
    }
    // ── TypeORM entities: find @Entity() decorated classes ──
    const entityFiles = findFiles(root, /\.entity\.(ts|js)$/, 6);
    for (const ef of entityFiles) {
        const content = readFile(ef, 200);
        const entityRe = /class\s+(\w+)/;
        const em = entityRe.exec(content);
        if (em && !seen.has(em[1])) {
            const name = em[1];
            seen.add(name);
            const fields = [];
            const colRe = /@Column\b.*\n\s*(\w+)\s*[!?]?\s*:\s*(\w+)/g;
            let cm;
            while ((cm = colRe.exec(content)) !== null) {
                fields.push({
                    name: cm[1], type: cm[2], required: true,
                    is_id: cm[1] === "id", is_unique: false,
                });
            }
            models.push({ name, category: categorizeModel(name), fields, relations: [] });
        }
    }
    // ── NestJS/TypeORM modules: find model files in modules directories ──
    const modelFiles = findFiles(root, /\.model\.(ts|js)$/, 6);
    for (const mf of modelFiles) {
        const content = readFile(mf, 100);
        const classRe = /(?:export\s+)?class\s+(\w+)/g;
        let cm;
        while ((cm = classRe.exec(content)) !== null) {
            const name = cm[1];
            if (seen.has(name) || /Module|Service|Controller|Guard|Interceptor|Pipe|Filter/.test(name))
                continue;
            seen.add(name);
            models.push({ name, category: categorizeModel(name), fields: [], relations: [] });
        }
    }
    // ── Zod schemas: find z.object() definitions in schema files ──
    // Common in Infisical, tRPC apps, and many modern TS backends
    const zodSchemaFiles = findFiles(root, /schema[s]?\.(ts|js)$/, 6);
    for (const zf of zodSchemaFiles) {
        const rel = path.relative(root, zf);
        if (rel.includes("node_modules") || rel.includes(".test."))
            continue;
        const content = readFile(zf, 500);
        // Match: export const FooSchema = z.object({...}) or export const FoosSchema = z.object
        const zodRe = /export\s+const\s+(\w+)Schema\s*=\s*z\.object\s*\(\s*\{/g;
        let zm;
        while ((zm = zodRe.exec(content)) !== null) {
            const rawName = zm[1];
            // Skip if it's an "Insert" or "Update" schema variant — keep the base
            if (/Insert|Update|Create|Patch/.test(rawName))
                continue;
            const name = rawName.replace(/s$/, ""); // "ApiKeys" → "ApiKey"
            if (seen.has(name))
                continue;
            seen.add(name);
            // Extract field names from the z.object block
            const fields = [];
            const blockStart = zm.index + zm[0].length;
            const chunk = content.slice(blockStart, blockStart + 2000);
            const fieldRe = /(\w+)\s*:\s*z\.(string|number|boolean|date|enum|array|object|uuid|bigint|record|union|literal|any|unknown|nativeEnum)\b/g;
            let fm;
            while ((fm = fieldRe.exec(chunk)) !== null) {
                fields.push({
                    name: fm[1],
                    type: fm[2],
                    required: !chunk.slice(fm.index, fm.index + 200).includes(".optional()") && !chunk.slice(fm.index, fm.index + 200).includes(".nullable()"),
                    is_id: fm[1] === "id",
                    is_unique: false,
                });
            }
            models.push({ name, category: categorizeModel(name), fields, relations: [] });
        }
    }
    // ── Convex schemas: find defineTable() definitions in convex/schema.ts ──
    const convexSchemaFiles = findFiles(root, /schema\.(ts|js)$/, 6);
    for (const cf of convexSchemaFiles) {
        const rel = path.relative(root, cf);
        if (rel.includes("node_modules") || !rel.includes("convex"))
            continue;
        const content = readFile(cf, 500);
        if (!content.includes("defineTable") && !content.includes("defineSchema"))
            continue;
        // Match table definitions: tableName: defineTable({ ... })
        const tableRe = /(\w+)\s*:\s*defineTable\s*\(\s*\{/g;
        let tm;
        while ((tm = tableRe.exec(content)) !== null) {
            const rawName = tm[1];
            const name = rawName.charAt(0).toUpperCase() + rawName.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase());
            if (seen.has(name))
                continue;
            seen.add(name);
            // Extract field definitions from the defineTable block
            const fields = [];
            const blockStart = tm.index;
            const chunk = content.slice(blockStart, blockStart + 2000);
            // Match Convex validators: fieldName: v.string(), v.number(), v.boolean(), v.id("table"), v.optional(v.string())
            const fieldRe = /(\w+)\s*:\s*v\.(\w+)\s*\(/g;
            let fm;
            while ((fm = fieldRe.exec(chunk)) !== null) {
                const fname = fm[1];
                const ftype = fm[2];
                if (fname === "index" || fname === "searchIndex" || fname === "vectorIndex")
                    break; // hit index definitions
                fields.push({
                    name: fname,
                    type: ftype === "id" ? "id" : ftype,
                    required: ftype !== "optional",
                    is_id: fname === "id" || ftype === "id",
                    is_unique: false,
                });
            }
            // Extract the full table definition as source code
            const tableEnd = chunk.indexOf("),", chunk.indexOf("defineTable"));
            const tableSource = tableEnd > 0 ? chunk.slice(0, tableEnd + 2) : chunk.slice(0, 1000);
            models.push({
                name,
                category: categorizeModel(rawName),
                fields,
                relations: [],
                schema_source: tableSource,
            });
        }
    }
    // ── Mongoose schemas: find new Schema({}) or mongoose.Schema ──
    const mongooseFiles = findFiles(root, /\.(ts|js)$/, 5);
    for (const mf of mongooseFiles) {
        const rel = path.relative(root, mf);
        if (rel.includes("node_modules") || rel.includes(".test.") || rel.includes("dist/"))
            continue;
        // Only check files that are likely model files
        if (!/model|schema|entity/i.test(path.basename(mf)))
            continue;
        const content = readFile(mf, 200);
        if (!content.includes("Schema(") && !content.includes("mongoose"))
            continue;
        // Match: const userSchema = new Schema({...}) or new mongoose.Schema
        const schemaRe = /(?:const|let)\s+(\w+)(?:Schema)?\s*=\s*new\s+(?:mongoose\.)?Schema\s*\(/g;
        let sm;
        while ((sm = schemaRe.exec(content)) !== null) {
            let name = sm[1].replace(/Schema$/i, "").replace(/schema$/i, "");
            name = name.charAt(0).toUpperCase() + name.slice(1);
            if (seen.has(name))
                continue;
            seen.add(name);
            models.push({ name, category: categorizeModel(name), fields: [], relations: [] });
        }
        // Match: mongoose.model("User", ...) or model("User", ...)
        const modelRe = /(?:mongoose\.)?model\s*[<(]\s*['"](\w+)['"]/g;
        let mm;
        while ((mm = modelRe.exec(content)) !== null) {
            const name = mm[1];
            if (seen.has(name))
                continue;
            seen.add(name);
            models.push({ name, category: categorizeModel(name), fields: [], relations: [] });
        }
    }
    // ── Sequelize models: sequelize.define() or class-based extends Model ──
    const seqFiles = findFiles(root, /\.model\.(ts|js)$|models\/\w+\.(ts|js)$/, 6);
    for (const sf of seqFiles) {
        const rel = path.relative(root, sf);
        if (rel.includes("node_modules"))
            continue;
        const content = readFile(sf, 200);
        // Class-based: class User extends Model
        const classRe = /class\s+(\w+)\s+extends\s+Model/g;
        let cm;
        while ((cm = classRe.exec(content)) !== null) {
            if (!seen.has(cm[1])) {
                seen.add(cm[1]);
                models.push({ name: cm[1], category: categorizeModel(cm[1]), fields: [], relations: [] });
            }
        }
        // define-based: sequelize.define('User', {...})
        const defRe = /\.define\s*\(\s*['"](\w+)['"]/g;
        let dm;
        while ((dm = defRe.exec(content)) !== null) {
            const name = dm[1].charAt(0).toUpperCase() + dm[1].slice(1);
            if (!seen.has(name)) {
                seen.add(name);
                models.push({ name, category: categorizeModel(name), fields: [], relations: [] });
            }
        }
    }
    // ── Knex migrations: createTable("tablename") in migration files ──
    const migrationFiles = findFiles(root, /\d{4,}.*\.(ts|js)$/, 5);
    for (const mig of migrationFiles.slice(0, 100)) { // limit to avoid scanning too many
        const rel = path.relative(root, mig);
        if (rel.includes("node_modules") || !(/migration|migrate/i.test(rel)))
            continue;
        const content = readFile(mig, 300);
        const createRe = /createTable\s*\(\s*['"](\w+)['"]/g;
        let ct;
        while ((ct = createRe.exec(content)) !== null) {
            const tableName = ct[1];
            const name = tableName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\s/g, "");
            if (!seen.has(name)) {
                seen.add(name);
                models.push({ name, category: categorizeModel(tableName), fields: [], relations: [] });
            }
        }
    }
    // ── TypeScript interfaces in types/models files (last resort for TS-heavy apps) ──
    const typeFiles = findFiles(root, /types?\.(ts|d\.ts)$/, 5);
    for (const tf of typeFiles.slice(0, 50)) { // limit
        const rel = path.relative(root, tf);
        if (rel.includes("node_modules") || rel.includes(".test."))
            continue;
        // Only look at files in model/types/entity directories
        if (!/model|type|entity|interface|schema/i.test(rel))
            continue;
        const content = readFile(tf, 300);
        // Match: export interface User { or export type User = {
        const ifRe = /export\s+(?:interface|type)\s+(\w+)\s*(?:extends\s+\w+\s*)?[={]/g;
        let im;
        while ((im = ifRe.exec(content)) !== null) {
            const name = im[1];
            // Skip utility types, generics, function types, etc
            if (/Props|Config|Options|Params|Args|Result|Response|Request|Context|State|Action|Reducer|Store|Hook|Util|Helper|Fn|Callback|Handler/.test(name))
                continue;
            if (seen.has(name))
                continue;
            // Only add if name looks like a domain entity (has category match)
            const cat = categorizeModel(name);
            if (cat !== "general") {
                seen.add(name);
                models.push({ name, category: cat, fields: [], relations: [] });
            }
        }
    }
    // ── Meteor Mongo.Collection / createCollection ──
    const collectionFiles = findFiles(root, /\.(ts|js)$/, 5);
    for (const cf of collectionFiles.slice(0, 200)) {
        const rel = path.relative(root, cf);
        if (rel.includes("node_modules") || rel.includes(".test."))
            continue;
        if (!/model|collection|schema|server|lib/i.test(rel))
            continue;
        const content = readFile(cf, 200);
        // Meteor: new Mongo.Collection("users")
        const meteorRe = /new\s+Mongo\.Collection\s*[<(]\s*['"](\w+)['"]/g;
        let mm;
        while ((mm = meteorRe.exec(content)) !== null) {
            const tableName = mm[1];
            const name = tableName.charAt(0).toUpperCase() + tableName.slice(1).replace(/s$/, "");
            if (!seen.has(name)) {
                seen.add(name);
                models.push({ name, category: categorizeModel(tableName), fields: [], relations: [] });
            }
        }
        // createCollection("users")
        const createCollRe = /createCollection\s*[<(]\s*['"](\w+)['"]/g;
        let cc;
        while ((cc = createCollRe.exec(content)) !== null) {
            const tableName = cc[1];
            const name = tableName.charAt(0).toUpperCase() + tableName.slice(1).replace(/s$/, "");
            if (!seen.has(name)) {
                seen.add(name);
                models.push({ name, category: categorizeModel(tableName), fields: [], relations: [] });
            }
        }
    }
    // ── GraphQL type definitions ──
    const gqlFiles = findFiles(root, /\.(graphql|gql)$/, 5);
    for (const gf of gqlFiles) {
        const rel = path.relative(root, gf);
        if (rel.includes("node_modules"))
            continue;
        const content = readFile(gf, 500);
        const typeRe = /type\s+(\w+)\s*(?:implements\s+\w+\s*)?\{([^}]+)\}/g;
        let gm;
        while ((gm = typeRe.exec(content)) !== null) {
            const name = gm[1];
            // Skip built-in types and resolvers
            if (/^(Query|Mutation|Subscription|__\w+)$/.test(name))
                continue;
            if (seen.has(name))
                continue;
            seen.add(name);
            const fields = [];
            for (const line of gm[2].split("\n")) {
                const fieldMatch = line.trim().match(/^(\w+)\s*(?:\([^)]*\))?\s*:\s*(\w+)/);
                if (fieldMatch) {
                    fields.push({
                        name: fieldMatch[1],
                        type: fieldMatch[2],
                        required: line.includes("!"),
                        is_id: fieldMatch[1] === "id",
                        is_unique: false,
                    });
                }
            }
            models.push({ name, category: categorizeModel(name), fields, relations: [] });
        }
    }
    // ── Raw SQL CREATE TABLE in .sql files ──
    const sqlFiles = findFiles(root, /\.(sql)$/, 4);
    for (const sf of sqlFiles.slice(0, 50)) {
        const rel = path.relative(root, sf);
        if (rel.includes("node_modules"))
            continue;
        const content = readFile(sf, 500);
        const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:["'`]?(\w+)["'`]?\.)?["'`]?(\w+)["'`]?\s*\(/gi;
        let ct;
        while ((ct = createRe.exec(content)) !== null) {
            const tableName = ct[2];
            const name = tableName.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/\s/g, "");
            if (!seen.has(name)) {
                seen.add(name);
                models.push({ name, category: categorizeModel(tableName), fields: [], relations: [] });
            }
        }
    }
    return models;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 4: Integrations — recursive + dependency-derived
// ═══════════════════════════════════════════════════════════════════════
function classifyIntType(name) {
    const l = name.toLowerCase();
    if (/video|zoom|meet|teams|jitsi|daily/.test(l))
        return "video_conferencing";
    if (/calendar|caldav|ical/.test(l))
        return "calendar";
    if (/payment|stripe|paypal|btcpay|billing/.test(l))
        return "payment";
    if (/crm|hubspot|salesforce|pipedrive/.test(l))
        return "crm";
    if (/analytics|ga4|posthog|plausible|mixpanel|amplitude/.test(l))
        return "analytics";
    if (/zapier|make|n8n|automation/.test(l))
        return "automation";
    if (/slack|discord|telegram|whatsapp/.test(l))
        return "messaging";
    if (/email|sendgrid|resend|mailgun|postmark|ses/.test(l))
        return "email";
    if (/sms|twilio/.test(l))
        return "sms";
    if (/s3|storage|upload|minio|r2/.test(l))
        return "storage";
    if (/sentry|datadog|grafana|prometheus/.test(l))
        return "monitoring";
    if (/auth0|clerk|next-auth|lucia|passport|keycloak/.test(l))
        return "auth";
    if (/aws|gcp|azure|cloud|vercel|fly/.test(l))
        return "cloud";
    return "other";
}
function inferAuthMethod(name, content) {
    if (/OAuth|oauth|getToken|refreshToken|authorization_code/.test(content))
        return "oauth";
    if (/apiKey|API_KEY|api_key|secret_key|bearer/.test(content))
        return "api_key";
    if (/webhook|Webhook/.test(content))
        return "webhook";
    return "unknown";
}
function scanIntegrations(root, deps) {
    const integrations = [];
    const seen = new Set();
    // ── Find integration directories recursively ──
    const intDirPatterns = [/^app-store$/, /^integrations$/, /^connectors$/, /^providers$/];
    const intDirs = [];
    for (const pat of intDirPatterns) {
        intDirs.push(...findDirs(root, pat, 4));
    }
    // Also check fixed paths
    for (const fixed of ["packages/app-store", "src/integrations", "packages/integrations"]) {
        const fp = path.join(root, fixed);
        if (exists(fp) && !intDirs.includes(fp))
            intDirs.push(fp);
    }
    for (const full of intDirs) {
        try {
            for (const e of fs.readdirSync(full, { withFileTypes: true })) {
                if (!e.isDirectory() || e.name.startsWith(".") || e.name.startsWith("_"))
                    continue;
                if (seen.has(e.name))
                    continue;
                seen.add(e.name);
                const meta = readFile(path.join(full, e.name, "_metadata.ts"), 50);
                const idx = readFile(path.join(full, e.name, "index.ts"), 50);
                const content = meta + idx;
                integrations.push({
                    name: e.name,
                    type: classifyIntType(e.name),
                    provider: e.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
                    category: classifyIntType(e.name),
                    auth_method: inferAuthMethod(e.name, content),
                });
            }
        }
        catch { }
    }
    // ── Dependency-derived integrations (broader list) ──
    const depInts = [
        ["stripe", "payment", "Stripe"], ["@stripe", "payment", "Stripe"],
        ["paypal", "payment", "PayPal"], ["lemonsqueezy", "payment", "LemonSqueezy"],
        ["@sendgrid", "email", "SendGrid"], ["nodemailer", "email", "Nodemailer"],
        ["resend", "email", "Resend"], ["@react-email", "email", "React Email"],
        ["postmark", "email", "Postmark"], ["@aws-sdk/client-ses", "email", "AWS SES"],
        ["twilio", "sms", "Twilio"], ["@slack", "messaging", "Slack"],
        ["@aws-sdk", "cloud", "AWS"], ["@google-cloud", "cloud", "Google Cloud"],
        ["firebase", "cloud", "Firebase"], ["@supabase", "cloud", "Supabase"],
        ["@clerk", "auth", "Clerk"], ["@auth0", "auth", "Auth0"],
        ["next-auth", "auth", "NextAuth"], ["@lucia-auth", "auth", "Lucia"],
        ["@sentry", "monitoring", "Sentry"], ["@datadog", "monitoring", "Datadog"],
        ["posthog", "analytics", "PostHog"], ["@mixpanel", "analytics", "Mixpanel"],
        ["@amplitude", "analytics", "Amplitude"], ["@segment", "analytics", "Segment"],
        ["@upstash", "cloud", "Upstash"],
        ["openai", "other", "OpenAI"], ["@anthropic-ai", "other", "Anthropic"],
        ["@google/generative-ai", "other", "Google AI"],
        ["minio", "storage", "MinIO"], ["@aws-sdk/client-s3", "storage", "AWS S3"],
        ["uploadthing", "storage", "UploadThing"],
        ["@vercel/analytics", "analytics", "Vercel Analytics"],
        ["@vercel/blob", "storage", "Vercel Blob"],
        ["redis", "cloud", "Redis"], ["ioredis", "cloud", "Redis"],
        ["@bull-board", "cloud", "BullMQ"], ["bullmq", "cloud", "BullMQ"],
    ];
    for (const [dep, type, provider] of depInts) {
        if (has(deps, dep) && !seen.has(provider.toLowerCase())) {
            seen.add(provider.toLowerCase());
            integrations.push({ name: dep, type, provider, category: type, auth_method: "api_key" });
        }
    }
    return integrations;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 5: API Surface — recursive discovery of all route patterns
// ═══════════════════════════════════════════════════════════════════════
function scanApi(root, deps) {
    const routes = [];
    // Detect API style
    let style = "rest";
    if (has(deps, "trpc", "@trpc"))
        style = has(deps, "express", "@nestjs") ? "mixed" : "trpc";
    if (has(deps, "graphql", "@apollo", "type-graphql", "@nestjs/graphql"))
        style = style === "rest" ? "graphql" : "mixed";
    // ── Find ALL API route directories recursively ──
    const apiDirs = findDirs(root, /^api$/, 5);
    // Also check Next.js pages/api patterns
    const pagesApiDirs = findDirs(root, /^pages$/, 4).map(d => path.join(d, "api")).filter(exists);
    const allApiDirs = [...new Set([...apiDirs, ...pagesApiDirs])];
    for (const full of allApiDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules"))
            continue;
        const scanR = (dir, prefix) => {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                        continue;
                    const fp = path.join(dir, e.name);
                    if (e.isDirectory()) {
                        scanR(fp, `${prefix}/${e.name}`);
                        continue;
                    }
                    if (!/\.(ts|js|tsx)$/.test(e.name) || e.name.includes(".test."))
                        continue;
                    const rp = `${prefix}/${e.name.replace(/\.(ts|js|tsx)$/, "").replace(/^(index|route)$/, "")}`.replace(/\/+/g, "/");
                    const c = readFile(fp, 30);
                    const methods = [];
                    if (/\bGET\b|export.*GET/.test(c))
                        methods.push("GET");
                    if (/\bPOST\b|create|Create/.test(c))
                        methods.push("POST");
                    if (/\bPUT\b|\bPATCH\b|update|Update/.test(c))
                        methods.push("PUT");
                    if (/\bDELETE\b|delete|remove/.test(c))
                        methods.push("DELETE");
                    if (methods.length === 0)
                        methods.push("GET");
                    const domain = prefix.split("/").filter(Boolean)[0] || "root";
                    const isPublic = /public|booking|webhook|health|status/.test(rp);
                    routes.push({ path: rp, methods, domain, is_public: isPublic });
                }
            }
            catch { }
        };
        scanR(full, "/api");
    }
    // ── Scan tRPC routers recursively ──
    const trpcDirs = findDirs(root, /^routers?$/, 5);
    for (const full of trpcDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules") || !(/trpc|server/.test(rel)))
            continue;
        const scanT = (dir, prefix) => {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name.startsWith(".") || e.name.startsWith("_") || SKIP_DIRS.has(e.name))
                        continue;
                    if (e.isDirectory()) {
                        routes.push({ path: `trpc/${prefix}${e.name}`, methods: ["QUERY", "MUTATION"], domain: e.name, is_public: false });
                        scanT(path.join(dir, e.name), `${prefix}${e.name}/`);
                    }
                    else if (/\.(ts|js)$/.test(e.name) && !e.name.includes(".test")) {
                        const routeName = e.name.replace(/\.(ts|js)$/, "").replace(/^index$/, "").replace(/\.router$/, "");
                        if (routeName) {
                            routes.push({ path: `trpc/${prefix}${routeName}`, methods: ["QUERY", "MUTATION"], domain: routeName, is_public: false });
                        }
                    }
                }
            }
            catch { }
        };
        scanT(full, "");
    }
    // ── Scan NestJS controllers ──
    const controllerFiles = findFiles(root, /\.controller\.(ts|js)$/, 6);
    for (const cf of controllerFiles) {
        const rel = path.relative(root, cf);
        if (rel.includes("node_modules"))
            continue;
        const content = readFile(cf, 100);
        const controllerRe = /@Controller\s*\(\s*['"]([^'"]*)['"]/;
        const cm = controllerRe.exec(content);
        const basePath = cm ? cm[1] : path.basename(cf).replace(".controller.ts", "").replace(".controller.js", "");
        const methods = [];
        if (/@Get\b/.test(content))
            methods.push("GET");
        if (/@Post\b/.test(content))
            methods.push("POST");
        if (/@Put\b|@Patch\b/.test(content))
            methods.push("PUT");
        if (/@Delete\b/.test(content))
            methods.push("DELETE");
        if (methods.length === 0)
            methods.push("GET");
        const domain = basePath.split("/").filter(Boolean)[0] || path.basename(cf).replace(".controller.ts", "");
        routes.push({ path: `/${basePath}`, methods, domain, is_public: false });
    }
    // ── Scan Remix routes ──
    const routesDirs = findDirs(root, /^routes$/, 5);
    for (const rd of routesDirs) {
        const rel = path.relative(root, rd);
        if (rel.includes("node_modules"))
            continue;
        try {
            for (const e of fs.readdirSync(rd, { withFileTypes: true })) {
                if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                    continue;
                const fp = path.join(rd, e.name);
                if (e.isDirectory()) {
                    const fc = countFiles(fp, [".ts", ".tsx", ".js", ".jsx"]);
                    if (fc > 0) {
                        const domain = e.name.replace(/[()_$]/g, "");
                        routes.push({ path: `/${domain}`, methods: ["GET"], domain, is_public: false });
                    }
                }
                else if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.includes(".test")) {
                    const routeName = e.name.replace(/\.(tsx?|jsx?)$/, "").replace(/\$/g, ":").replace(/\./g, "/");
                    const domain = routeName.split(/[/.]/)[0] || "root";
                    routes.push({ path: `/${routeName}`, methods: ["GET"], domain, is_public: false });
                }
            }
        }
        catch { }
    }
    // Build domain summary
    const domainMap = new Map();
    for (const r of routes) {
        if (!domainMap.has(r.domain))
            domainMap.set(r.domain, []);
        domainMap.get(r.domain).push(r);
    }
    const domains = [...domainMap.entries()].map(([name, rs]) => ({
        name,
        endpoint_count: rs.length,
        has_crud: rs.some(r => r.methods.includes("POST")) && rs.some(r => r.methods.includes("GET")) && rs.some(r => r.methods.includes("DELETE")),
        has_search: rs.some(r => /search|list|find|filter/.test(r.path)),
        has_batch: rs.some(r => /bulk|batch/.test(r.path)),
    }));
    return { style, routes, domains, total_endpoints: routes.length };
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 6-11: UI (components, pages, navigation, design, flows, states)
// ═══════════════════════════════════════════════════════════════════════
function catComponent(fp, name) {
    const l = (fp + name).toLowerCase();
    if (/form|input|select|checkbox|switch|radio|textarea/.test(l))
        return "form";
    if (/dialog|modal|sheet|popover|overlay|drawer/.test(l))
        return "overlay";
    if (/nav|sidebar|menu|breadcrumb|tab/.test(l))
        return "navigation";
    if (/button|badge|icon|avatar|logo/.test(l))
        return "element";
    if (/table|list|card|grid|tree/.test(l))
        return "data_display";
    if (/skeleton|loading|spinner|progress/.test(l))
        return "loading";
    if (/error|empty|alert/.test(l))
        return "feedback";
    if (/layout|shell|container|section|wrapper/.test(l))
        return "layout";
    if (/toast|banner|notification|snackbar/.test(l))
        return "notification";
    if (/editor|richtext|markdown/.test(l))
        return "editor";
    if (/calendar|date|time|picker/.test(l))
        return "datetime";
    if (/upload|file|image|drop/.test(l))
        return "upload";
    if (/chart|graph|stats|metric/.test(l))
        return "data_viz";
    return "general";
}
function scanUI(root, deps) {
    // ── Components — find ALL component directories recursively ──
    const compMap = new Map();
    // Find directories named "components", "ui", "common" anywhere
    const compDirPatterns = [/^components$/, /^ui$/, /^common$/];
    const compDirs = [];
    for (const pat of compDirPatterns) {
        compDirs.push(...findDirs(root, pat, 5));
    }
    // Also check well-known paths
    for (const fixed of ["packages/ui", "packages/coss-ui", "src/components", "apps/web/components"]) {
        const fp = path.join(root, fixed);
        if (exists(fp) && !compDirs.includes(fp))
            compDirs.push(fp);
    }
    for (const full of compDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules"))
            continue;
        // Find .tsx, .vue, .svelte component files
        for (const fp of findFiles(full, /\.(tsx|vue|svelte)$/, 4)) {
            const name = path.basename(fp).replace(/\.(tsx|vue|svelte)$/, "");
            if (name.startsWith("_") || name === "index" || /\.test|\.stories|\.spec/.test(name))
                continue;
            const cat = catComponent(path.relative(root, fp), name);
            if (!compMap.has(cat))
                compMap.set(cat, []);
            const existing = compMap.get(cat);
            if (!existing.includes(name))
                existing.push(name);
        }
    }
    const componentPatterns = [];
    const allCompFiles = new Map(); // name -> file path
    // Build a map of component name -> file path for all components
    for (const full of compDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules"))
            continue;
        for (const fp of findFiles(full, /\.(tsx|vue|svelte)$/, 4)) {
            const name = path.basename(fp).replace(/\.(tsx|vue|svelte)$/, "");
            if (!name.startsWith("_") && name !== "index") {
                allCompFiles.set(name, fp);
            }
        }
    }
    // Analyze top 30 most-used components (by category importance)
    const priorityCategories = ["data_display", "form", "navigation", "overlay", "layout", "editor"];
    const topComponents = [];
    for (const cat of priorityCategories) {
        const comps = compMap.get(cat) || [];
        topComponents.push(...comps.slice(0, 5));
    }
    // Fill remaining slots with other categories
    for (const [cat, comps] of compMap) {
        if (!priorityCategories.includes(cat)) {
            topComponents.push(...comps.slice(0, 3));
        }
    }
    for (const compName of topComponents.slice(0, 30)) {
        const filePath = allCompFiles.get(compName);
        if (!filePath)
            continue;
        const content = readFile(filePath, 150);
        if (!content)
            continue;
        // Extract props interface
        const propsRe = /(?:interface|type)\s+\w*Props\w*\s*(?:=\s*)?\{([^}]+)\}/s;
        const propsMatch = propsRe.exec(content);
        const props = [];
        if (propsMatch) {
            const propsBody = propsMatch[1];
            const propLines = propsBody.split("\n");
            for (const line of propLines) {
                const propMatch = line.trim().match(/^(\w+)\s*[?:]?\s*:\s*(.+?)(?:;|$)/);
                if (propMatch) {
                    props.push(`${propMatch[1]}:${propMatch[2].trim().slice(0, 30)}`);
                }
            }
        }
        // Detect child component usage
        const childRe = /<([A-Z]\w+)/g;
        const children = new Set();
        let childMatch;
        while ((childMatch = childRe.exec(content)) !== null) {
            if (childMatch[1] !== compName)
                children.add(childMatch[1]);
        }
        const cat = catComponent(path.relative(root, filePath), compName);
        // Extract a meaningful code sample — cap at 2000 chars to stay reasonable
        const codeSample = content.length > 2000 ? content.slice(0, 2000) + "\n// ... (truncated)" : content;
        componentPatterns.push({
            name: compName,
            category: cat,
            props: props.slice(0, 15),
            child_components: [...children].slice(0, 10),
            uses_state: /useState|useReducer|useStore|useAtom|useSelector/.test(content),
            uses_effects: /useEffect|useMemo|useCallback|useQuery|useMutation/.test(content),
            line_count: content.split("\n").length,
            file_path: path.relative(root, filePath),
            usage_example: codeSample,
            description: `${cat} component with ${props.length} props, ${children.size} child components`,
        });
    }
    const totalComponents = [...compMap.values()].reduce((s, a) => s + a.length, 0);
    const categories = [...compMap.entries()]
        .sort((a, b) => b[1].length - a[1].length)
        .map(([name, comps]) => ({ name, count: comps.length, key_components: comps.slice(0, 10) }));
    const components = { total_components: totalComponents, categories };
    // ── Pages — find ALL page/route directories recursively ──
    const sectionMap = new Map();
    // Find "app" and "pages" directories anywhere
    const pageDirPatterns = [/^app$/, /^pages$/, /^routes$/];
    const pageDirs = [];
    for (const pat of pageDirPatterns) {
        pageDirs.push(...findDirs(root, pat, 4));
    }
    for (const full of pageDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules") || rel.includes("api/"))
            continue;
        const scanP = (dir, route, section) => {
            try {
                for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                    if (e.name.startsWith(".") || SKIP_DIRS.has(e.name) || e.name === "_components" || e.name === "api")
                        continue;
                    const fp = path.join(dir, e.name);
                    if (e.isDirectory()) {
                        const isGrp = e.name.startsWith("(");
                        scanP(fp, isGrp ? route : `${route}/${e.name}`, isGrp ? e.name.replace(/[()]/g, "") : section || e.name);
                    }
                    else if (/^(page|index|route|layout)\.(tsx?|jsx?|vue|svelte)$/.test(e.name)) {
                        if (e.name.startsWith("layout"))
                            continue; // layouts aren't pages
                        const c = readFile(fp, 30);
                        const isPublic = /booking|auth|signup|login|public|landing|pricing|home/.test(route);
                        const hasAuth = /auth|session|getServerSession|requireAuth|protect/.test(c);
                        const sec = section || "root";
                        if (!sectionMap.has(sec))
                            sectionMap.set(sec, { routes: [], isPublic: false, hasAuth: false });
                        const s = sectionMap.get(sec);
                        s.routes.push(route || "/");
                        if (isPublic)
                            s.isPublic = true;
                        if (hasAuth)
                            s.hasAuth = true;
                    }
                }
            }
            catch { }
        };
        scanP(full, "", "");
    }
    // Also scan Remix-style flat routes
    for (const rd of findDirs(root, /^routes$/, 5)) {
        const rel = path.relative(root, rd);
        if (rel.includes("node_modules"))
            continue;
        try {
            for (const e of fs.readdirSync(rd, { withFileTypes: true })) {
                if (e.name.startsWith(".") || SKIP_DIRS.has(e.name))
                    continue;
                if (/\.(tsx?|jsx?)$/.test(e.name) && !e.name.includes(".test")) {
                    const routeName = e.name.replace(/\.(tsx?|jsx?)$/, "").replace(/\$/g, ":").replace(/\./g, "/").replace(/_index$/, "");
                    const section = routeName.split(/[/.]/)[0] || "root";
                    if (!sectionMap.has(section))
                        sectionMap.set(section, { routes: [], isPublic: false, hasAuth: false });
                    sectionMap.get(section).routes.push(`/${routeName}`);
                }
            }
        }
        catch { }
    }
    const totalPages = [...sectionMap.values()].reduce((s, v) => s + v.routes.length, 0);
    const sections = [...sectionMap.entries()]
        .sort((a, b) => b[1].routes.length - a[1].routes.length)
        .map(([name, v]) => ({
        name, page_count: v.routes.length, is_public: v.isPublic,
        requires_auth: v.hasAuth, key_routes: v.routes.slice(0, 10),
    }));
    const pages = { total_pages: totalPages, sections };
    // ── Navigation — search everywhere ──
    const shellFiles = findFiles(root, /[Ss]hell\.(tsx|vue)$/, 5);
    const navFiles = findFiles(root, /[Nn]avigation\.(tsx|vue)$/, 5);
    const sidebarFiles = findFiles(root, /[Ss]idebar\.(tsx|vue)$/, 5);
    const allNavFiles = [...shellFiles, ...navFiles, ...sidebarFiles];
    let hasCmd = false, hasMobile = false, hasBread = false;
    for (const f of allNavFiles) {
        const rel = path.relative(root, f);
        if (rel.includes("node_modules"))
            continue;
        const c = readFile(f, 200);
        if (/KBar|cmdk|CommandPalette|command-palette/.test(c))
            hasCmd = true;
        if (/[Mm]obile[Nn]av|MobileNavigation|mobile-nav/.test(c))
            hasMobile = true;
        if (/[Bb]readcrumb/.test(c))
            hasBread = true;
    }
    const navItems = [];
    for (const nf of allNavFiles) {
        const rel = path.relative(root, nf);
        if (rel.includes("node_modules"))
            continue;
        const c = readFile(nf, 300);
        const hrefMatches = [...c.matchAll(/(?:href|to|path)\s*[=:]\s*["'`]([^"'`]+)["'`]/g)];
        const labelMatches = [...c.matchAll(/(?:label|name|title)\s*[=:]\s*["'`]([^"'`]+)["'`]/g)];
        for (let i = 0; i < Math.min(hrefMatches.length, 30); i++) {
            const route = hrefMatches[i][1];
            if (route.startsWith("http") || route === "#")
                continue;
            const label = i < labelMatches.length ? labelMatches[i][1] : route.split("/").pop() || "";
            if (navItems.some(n => n.route === route))
                continue;
            navItems.push({ label, route, icon: "", section: route.split("/").filter(Boolean)[0] || "home", has_submenu: false, badge: false });
        }
    }
    const navStyle = allNavFiles.some(f => /sidebar|side-bar/i.test(f) || /SideBar|sidebar/i.test(readFile(f, 50))) ? "sidebar" : "topnav";
    const navigation = { style: navStyle, items: navItems, has_command_palette: hasCmd, has_mobile_nav: hasMobile, has_breadcrumbs: hasBread };
    // ── Design System ──
    const twConfigs = findFiles(root, /^tailwind\.config\.(ts|js|mjs|cjs)$/, 3);
    let cssFramework = "unknown";
    if (twConfigs.length > 0)
        cssFramework = "Tailwind CSS";
    else if (has(deps, "@vanilla-extract"))
        cssFramework = "Vanilla Extract";
    else if (has(deps, "styled-components"))
        cssFramework = "Styled Components";
    let compLib = "custom";
    if (has(deps, "@radix-ui"))
        compLib = "Radix UI";
    if (has(deps, "@base-ui"))
        compLib += " + Base UI";
    if (has(deps, "@chakra-ui"))
        compLib = "Chakra UI";
    if (has(deps, "@mantine"))
        compLib = "Mantine";
    if (has(deps, "@mui"))
        compLib = "Material UI";
    if (has(deps, "@headlessui"))
        compLib = "Headless UI";
    if (has(deps, "antd", "@ant-design"))
        compLib = "Ant Design";
    if (has(deps, "@shadcn"))
        compLib = "shadcn/ui + Radix";
    let iconLib = "none";
    if (has(deps, "lucide"))
        iconLib = "Lucide";
    else if (has(deps, "heroicons", "@heroicons"))
        iconLib = "Heroicons";
    else if (has(deps, "@phosphor"))
        iconLib = "Phosphor";
    else if (has(deps, "@tabler/icons"))
        iconLib = "Tabler Icons";
    else if (has(deps, "react-icons"))
        iconLib = "React Icons";
    // Scan color tokens from ALL CSS/SCSS files
    let colorCount = 0;
    const colorCats = new Set();
    let hasDark = false, hasTheming = false;
    const cssFiles = [...findFiles(root, /\.(css|scss)$/, 4)];
    for (const cssFile of cssFiles.slice(0, 50)) { // limit to avoid scanning too many
        const rel = path.relative(root, cssFile);
        if (rel.includes("node_modules"))
            continue;
        const c = readFile(cssFile, 300);
        const vars = [...c.matchAll(/--([a-z][\w-]*)\s*:/g)];
        for (const v of vars) {
            const n = v[1];
            if (/color|bg|brand|border|text|primary|secondary|accent|muted|foreground|background/.test(n)) {
                colorCount++;
                colorCats.add(n.split("-")[0]);
            }
        }
        if (/\.dark|dark-mode|data-theme|prefers-color-scheme:\s*dark/.test(c))
            hasDark = true;
        if (/--brand|customBrand|brandColor|--primary/.test(c))
            hasTheming = true;
    }
    // Scan fonts from tailwind config
    const fontFamilies = [];
    for (const twConf of twConfigs) {
        const c = readFile(twConf, 100);
        const fonts = [...c.matchAll(/["']([A-Z][a-z]+(?: [A-Z][a-z]+)*)["']/g)];
        for (const f of fonts)
            fontFamilies.push(f[1]);
    }
    const design_system = {
        css_framework: cssFramework,
        component_library: compLib,
        icon_library: iconLib,
        color_system: { token_count: colorCount, categories: [...colorCats], has_dark_mode: hasDark, has_custom_theming: hasTheming },
        typography: { font_families: [...new Set(fontFamilies)], scale: ["xs", "sm", "base", "lg", "xl", "2xl"], has_display_font: fontFamilies.length > 1 },
        spacing: { system: cssFramework === "Tailwind CSS" ? "tailwind" : "custom", base_unit: "4px" },
    };
    // ── User Flows — generic detection ──
    const user_flows = [];
    const flowPatterns = [
        [/onboarding/i, "User Onboarding", "onboarding", ["Welcome", "Profile setup", "Configuration", "Completion"]],
        [/auth|login|signup/i, "Authentication", "auth", ["Login/Signup", "Email verification", "Two-factor auth", "Password reset"]],
        [/booking|scheduling/i, "Public Booking", "booking", ["View profile", "Select type", "Pick time", "Enter details", "Confirm"]],
        [/workflow|automation/i, "Workflow Builder", "automation", ["Select trigger", "Configure conditions", "Add actions", "Test and activate"]],
        [/settings|preferences/i, "Settings Management", "settings", ["Account settings", "Security", "Integrations", "Billing"]],
        [/checkout|payment/i, "Checkout Flow", "payments", ["Cart review", "Payment details", "Confirmation", "Receipt"]],
        [/invite|team-setup/i, "Team Setup", "teams", ["Create team", "Invite members", "Set roles", "Configure"]],
        [/setup|wizard|getting-started/i, "Setup Wizard", "setup", ["Welcome", "Connect services", "Configure", "Ready"]],
        [/document.*sign|signing/i, "Document Signing", "signing", ["Upload document", "Add recipients", "Place fields", "Send for signing"]],
        [/survey.*creat|create.*survey/i, "Survey Creation", "surveys", ["Choose type", "Add questions", "Configure logic", "Publish"]],
    ];
    // Search for flow-related directories/files
    const allFeatureDirs = findDirs(root, /^(features|modules|domains|app|pages|routes)$/, 3);
    const allDirNames = new Set();
    for (const fd of allFeatureDirs) {
        try {
            for (const e of fs.readdirSync(fd, { withFileTypes: true })) {
                if (e.isDirectory())
                    allDirNames.add(e.name.toLowerCase());
            }
        }
        catch { }
    }
    for (const [re, name, section, steps] of flowPatterns) {
        const matchingDirs = [...allDirNames].filter(d => re.test(d));
        if (matchingDirs.length > 0) {
            user_flows.push({
                name, section, step_count: steps.length, entry_point: `/${section}`,
                steps: steps.map((s, i) => ({ order: i + 1, name: s, description: s, route: "", requires_input: true, can_skip: i > 0 })),
            });
        }
    }
    // ── Form Patterns — search everywhere ──
    const form_patterns = [];
    const formDirs = findDirs(root, /^(form|forms|form-builder|form-elements)$/i, 5);
    for (const full of formDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules"))
            continue;
        const comps = findFiles(full, /\.(tsx|vue|svelte)$/, 2).map(f => path.basename(f).replace(/\.(tsx|vue|svelte)$/, "")).filter(n => !n.startsWith("_") && n !== "index");
        if (comps.length > 0) {
            form_patterns.push({
                name: `Form system (${path.basename(full)})`,
                validation_library: has(deps, "zod") ? "zod" : has(deps, "yup") ? "yup" : has(deps, "joi") ? "joi" : "unknown",
                form_library: has(deps, "react-hook-form") ? "react-hook-form" : has(deps, "formik") ? "formik" : has(deps, "@tanstack/react-form") ? "TanStack Form" : "unknown",
                components: comps,
                has_multi_step: comps.some(c => /wizard|step|multi/i.test(c)),
                has_file_upload: comps.some(c => /upload|file|drop/i.test(c)),
            });
        }
    }
    // If no form directory found but form libs exist, create a pattern entry
    if (form_patterns.length === 0 && (has(deps, "react-hook-form") || has(deps, "formik"))) {
        form_patterns.push({
            name: "Form handling",
            validation_library: has(deps, "zod") ? "zod" : has(deps, "yup") ? "yup" : "unknown",
            form_library: has(deps, "react-hook-form") ? "react-hook-form" : "formik",
            components: [],
            has_multi_step: false,
            has_file_upload: false,
        });
    }
    // ── State Patterns — search ALL component directories ──
    const state_patterns = [];
    const stateSearch = [
        [/[Ss]keleton/, "loading", "Loading placeholder with animation", "component"],
        [/[Ss]pinner/, "loading", "Spinner indicator", "component"],
        [/[Pp]rogress/, "loading", "Progress bar indicator", "section"],
        [/[Ll]oading/, "loading", "Loading state component", "component"],
        [/[Ee]mpty[Ss]creen|[Ee]mpty[Ss]tate|[Nn]o[Rr]esult|[Nn]o[Dd]ata/, "empty", "Empty state with message and action", "page"],
        [/[Ee]rror[Bb]oundary|[Ee]rror[Ff]allback/, "error", "Error boundary with fallback UI", "page"],
        [/[Ee]rror[Pp]age|[Ee]rror[Vv]iew/, "error", "Error page display", "page"],
        [/[Tt]oast|[Ss]onner/, "notification", "Toast notification popup", "global"],
        [/[Bb]anner/, "notification", "Top banner notification", "global"],
        [/[Aa]lert/, "notification", "Alert box with severity levels", "section"],
        [/[Ss]uccess/, "success", "Success state display", "section"],
        [/[Ss]nackbar/, "notification", "Snackbar notification", "global"],
    ];
    const seenStates = new Set();
    for (const full of compDirs) {
        const rel = path.relative(root, full);
        if (rel.includes("node_modules"))
            continue;
        for (const fp of findFiles(full, /\.(tsx|vue|svelte)$/, 3)) {
            const name = path.basename(fp).replace(/\.(tsx|vue|svelte)$/, "");
            for (const [re, type, desc, scope] of stateSearch) {
                if (re.test(name) && !seenStates.has(name)) {
                    seenStates.add(name);
                    state_patterns.push({ type, component: name, description: desc, scope });
                    break;
                }
            }
        }
    }
    return { design_system, components, pages, navigation, user_flows, form_patterns, state_patterns, component_patterns: componentPatterns };
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 12: Auth Patterns
// ═══════════════════════════════════════════════════════════════════════
function scanAuthPatterns(root, deps) {
    const patterns = [];
    if (has(deps, "next-auth", "@auth/core")) {
        patterns.push({ name: "NextAuth Session Pattern", type: "auth", description: "Session-based auth with provider support (Google, GitHub, email, SAML)", evidence: "next-auth in dependencies", applicable_to: ["all"], key_files: [] });
    }
    if (has(deps, "@clerk")) {
        patterns.push({ name: "Clerk Auth Pattern", type: "auth", description: "Managed auth with user management, organizations, and RBAC", evidence: "@clerk in dependencies", applicable_to: ["all"], key_files: [] });
    }
    if (has(deps, "passport")) {
        patterns.push({ name: "Passport.js Auth Pattern", type: "auth", description: "Strategy-based authentication middleware", evidence: "passport in dependencies", applicable_to: ["all"], key_files: [] });
    }
    if (has(deps, "@lucia-auth", "lucia")) {
        patterns.push({ name: "Lucia Auth Pattern", type: "auth", description: "Lightweight session-based authentication", evidence: "lucia in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const permFiles = findFiles(root, /permission|rbac|role|guard/i, 5);
    if (permFiles.length > 0) {
        patterns.push({ name: "Role-Based Access Control", type: "auth", description: "RBAC with roles, permissions, and resource-level access control", evidence: `Found ${permFiles.length} permission/role files`, applicable_to: ["all"], key_files: permFiles.slice(0, 5).map(f => path.relative(root, f)) });
    }
    const twoFaFiles = findFiles(root, /two.?factor|2fa|totp|otp/i, 5);
    if (twoFaFiles.length > 0) {
        patterns.push({ name: "Two-Factor Authentication", type: "auth", description: "2FA with TOTP, backup codes, and recovery flow", evidence: `Found ${twoFaFiles.length} 2FA files`, applicable_to: ["all"], key_files: twoFaFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    const ssoFiles = findFiles(root, /sso|saml|oidc/i, 5);
    if (ssoFiles.length > 0) {
        patterns.push({ name: "SSO/SAML Integration", type: "auth", description: "Enterprise SSO with SAML 2.0 and OIDC support", evidence: `Found ${ssoFiles.length} SSO files`, applicable_to: ["customer_portal", "internal_ops_tool"], key_files: ssoFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    return patterns;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 13: Testing Patterns
// ═══════════════════════════════════════════════════════════════════════
function scanTestingPatterns(root, deps) {
    const patterns = [];
    const unitTests = findFiles(root, /\.(test|spec)\.(ts|tsx|js|jsx)$/, 5);
    const e2eTests = findFiles(root, /\.e2e\.(ts|js)$/, 5);
    const playwrightTests = findFiles(root, /\.pw\.(ts|js)$/, 5);
    if (unitTests.length > 0) {
        const framework = has(deps, "vitest") ? "Vitest" : has(deps, "jest") ? "Jest" : "unknown";
        patterns.push({ name: `Unit Testing (${framework})`, type: "testing", description: `${unitTests.length} unit test files using ${framework}`, evidence: `${unitTests.length} test files found`, applicable_to: ["all"], key_files: unitTests.slice(0, 5).map(f => path.relative(root, f)) });
    }
    if (e2eTests.length > 0 || playwrightTests.length > 0 || has(deps, "playwright", "@playwright")) {
        const total = e2eTests.length + playwrightTests.length;
        patterns.push({ name: "E2E Testing (Playwright)", type: "testing", description: `${total || "Multiple"} E2E test files with browser automation`, evidence: "Playwright in dependencies", applicable_to: ["all"], key_files: [] });
    }
    if (has(deps, "cypress")) {
        patterns.push({ name: "E2E Testing (Cypress)", type: "testing", description: "Component and E2E testing with Cypress", evidence: "cypress in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const testUtilFiles = findFiles(root, /test.?util|test.?helper|fixture|factory/i, 4);
    if (testUtilFiles.length > 0) {
        patterns.push({ name: "Test Utilities & Fixtures", type: "testing", description: `${testUtilFiles.length} test utility/fixture files for reusable test setup`, evidence: `Found test utility files`, applicable_to: ["all"], key_files: testUtilFiles.slice(0, 5).map(f => path.relative(root, f)) });
    }
    const mockDirs = findDirs(root, /^(__mocks__|mocks|vitest-mocks)$/, 3);
    if (mockDirs.length > 0) {
        patterns.push({ name: "Mock System", type: "testing", description: "Centralized mocking for external services and modules", evidence: `${mockDirs.length} mock directories found`, applicable_to: ["all"], key_files: mockDirs.map(f => path.relative(root, f)) });
    }
    return patterns;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 14: Error Handling
// ═══════════════════════════════════════════════════════════════════════
function scanErrorPatterns(root, deps) {
    const patterns = [];
    const errorBoundaryFiles = findFiles(root, /[Ee]rror[Bb]oundary/i, 5);
    if (errorBoundaryFiles.length > 0) {
        patterns.push({ name: "React Error Boundaries", type: "components", description: "Error boundary components that catch render errors with fallback UI", evidence: `${errorBoundaryFiles.length} error boundary files`, applicable_to: ["all"], key_files: errorBoundaryFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    if (has(deps, "@sentry")) {
        patterns.push({ name: "Sentry Error Tracking", type: "monitoring", description: "Automated error reporting and performance monitoring with Sentry", evidence: "@sentry in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const errorClassFiles = findFiles(root, /error\.ts$|errors\.ts$/i, 4);
    if (errorClassFiles.length > 0) {
        patterns.push({ name: "Custom Error Classes", type: "api", description: "Typed error classes for structured error handling", evidence: `${errorClassFiles.length} error definition files`, applicable_to: ["all"], key_files: errorClassFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    // Global error handler
    const globalErrorFiles = findFiles(root, /global.?error|error.?handler|exception.?filter/i, 5);
    if (globalErrorFiles.length > 0) {
        patterns.push({ name: "Global Error Handler", type: "api", description: "Centralized error handling middleware/filter", evidence: `${globalErrorFiles.length} global error handler files`, applicable_to: ["all"], key_files: globalErrorFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    return patterns;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 15: Deployment Config
// ═══════════════════════════════════════════════════════════════════════
function scanDeploymentPatterns(root) {
    const patterns = [];
    // Docker — search recursively for Dockerfiles
    const dockerFiles = findFiles(root, /^Dockerfile/i, 3);
    const composeFiles = findFiles(root, /^docker-compose/i, 2);
    if (dockerFiles.length > 0 || composeFiles.length > 0) {
        patterns.push({ name: "Docker Containerization", type: "deployment", description: `${dockerFiles.length} Dockerfiles and ${composeFiles.length} compose files for containerized deployment`, evidence: "Docker files found", applicable_to: ["all"], key_files: [...dockerFiles, ...composeFiles].slice(0, 5).map(f => path.relative(root, f)) });
    }
    const ciDirs = [".github/workflows", ".circleci", ".gitlab-ci.yml"];
    for (const ci of ciDirs) {
        if (exists(path.join(root, ci))) {
            const name = ci.includes("github") ? "GitHub Actions CI/CD" : ci.includes("circle") ? "CircleCI" : "GitLab CI";
            const files = ci.includes("github") ? findFiles(path.join(root, ci), /\.ya?ml$/, 1) : [ci];
            patterns.push({ name, type: "deployment", description: `Automated CI/CD pipeline with ${name} (${files.length} workflow files)`, evidence: `${ci} found`, applicable_to: ["all"], key_files: files.map(f => path.relative(root, f)) });
        }
    }
    if (exists(path.join(root, "vercel.json")) || exists(path.join(root, ".vercel"))) {
        patterns.push({ name: "Vercel Deployment", type: "deployment", description: "Vercel platform deployment with serverless functions", evidence: "vercel.json found", applicable_to: ["all"], key_files: ["vercel.json"] });
    }
    if (exists(path.join(root, "fly.toml"))) {
        patterns.push({ name: "Fly.io Deployment", type: "deployment", description: "Fly.io edge deployment", evidence: "fly.toml found", applicable_to: ["all"], key_files: ["fly.toml"] });
    }
    if (exists(path.join(root, "railway.json")) || exists(path.join(root, "railway.toml"))) {
        patterns.push({ name: "Railway Deployment", type: "deployment", description: "Railway platform deployment", evidence: "railway config found", applicable_to: ["all"], key_files: [] });
    }
    // Env var management
    const envFiles = findFiles(root, /\.env\.example$|\.env\.sample$/i, 2);
    if (envFiles.length > 0) {
        let totalVars = 0;
        for (const ef of envFiles) {
            const content = readFile(ef, 200);
            totalVars += content.split("\n").filter(l => l.includes("=") && !l.startsWith("#")).length;
        }
        if (totalVars > 0) {
            patterns.push({ name: "Environment Variable Config", type: "deployment", description: `${totalVars} environment variables across ${envFiles.length} .env files`, evidence: `.env.example files found`, applicable_to: ["all"], key_files: envFiles.map(f => path.relative(root, f)) });
        }
    }
    // K8s
    const k8sFiles = findFiles(root, /\.ya?ml$/, 3).filter(f => {
        const c = readFile(f, 10);
        return /apiVersion|kind:\s*(Deployment|Service|Ingress)/.test(c);
    });
    if (k8sFiles.length > 0) {
        patterns.push({ name: "Kubernetes Deployment", type: "deployment", description: `${k8sFiles.length} Kubernetes manifest files`, evidence: "K8s manifests found", applicable_to: ["all"], key_files: k8sFiles.slice(0, 5).map(f => path.relative(root, f)) });
    }
    return patterns;
}
// ═══════════════════════════════════════════════════════════════════════
// Layer 16: Security Patterns
// ═══════════════════════════════════════════════════════════════════════
function scanSecurityPatterns(root, deps) {
    const patterns = [];
    if (has(deps, "helmet")) {
        patterns.push({ name: "Helmet Security Headers", type: "api", description: "HTTP security headers (CSP, HSTS, X-Frame-Options) via Helmet", evidence: "helmet in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const rateLimitFiles = findFiles(root, /rate.?limit/i, 5);
    if (rateLimitFiles.length > 0 || has(deps, "express-rate-limit", "@upstash/ratelimit")) {
        patterns.push({ name: "Rate Limiting", type: "api", description: "API rate limiting to prevent abuse", evidence: "Rate limit implementation found", applicable_to: ["all"], key_files: rateLimitFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    if (has(deps, "zod")) {
        patterns.push({ name: "Zod Runtime Validation", type: "validation", description: "Runtime type validation on API inputs using Zod schemas", evidence: "zod in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const csrfFiles = findFiles(root, /csrf/i, 4);
    if (csrfFiles.length > 0 || has(deps, "csrf", "csurf")) {
        patterns.push({ name: "CSRF Protection", type: "api", description: "Cross-site request forgery protection", evidence: "CSRF implementation found", applicable_to: ["all"], key_files: [] });
    }
    const cspFiles = findFiles(root, /csp|content.?security/i, 4);
    if (cspFiles.length > 0) {
        patterns.push({ name: "Content Security Policy", type: "api", description: "CSP headers to prevent XSS and injection attacks", evidence: `${cspFiles.length} CSP files found`, applicable_to: ["all"], key_files: cspFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    // CORS config
    const corsFiles = findFiles(root, /cors/i, 4);
    if (corsFiles.length > 0 || has(deps, "cors")) {
        patterns.push({ name: "CORS Configuration", type: "api", description: "Cross-origin resource sharing configuration", evidence: "CORS implementation found", applicable_to: ["all"], key_files: corsFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    // Encryption
    const encryptFiles = findFiles(root, /encrypt|crypto|hash/i, 4);
    if (encryptFiles.length > 2 || has(deps, "bcrypt", "argon2", "scrypt")) {
        patterns.push({ name: "Encryption & Hashing", type: "auth", description: "Password hashing and data encryption", evidence: "Crypto implementation found", applicable_to: ["all"], key_files: encryptFiles.slice(0, 3).map(f => path.relative(root, f)) });
    }
    return patterns;
}
// ═══════════════════════════════════════════════════════════════════════
// Assemble — all layers into LearnedApp
// ═══════════════════════════════════════════════════════════════════════
function classifyApp(features, deps, root, sourceUrl = "") {
    const names = features.map(f => f.name.toLowerCase()).join(" ");
    const dirs = features.map(f => f.directory.toLowerCase()).join(" ");
    const signal = names + " " + dirs;
    const hasDep = (...needles) => needles.some(n => deps.some(d => d.includes(n)));
    // Score-based classification: tally votes per category, highest wins
    const scores = {};
    const vote = (cls, weight) => { scores[cls] = (scores[cls] || 0) + weight; };
    // ── Source URL hints (very reliable when available) ──
    const urlLower = sourceUrl.toLowerCase();
    if (/secret|infisical|vault|hashicorp/i.test(urlLower))
        vote("secrets_management", 12);
    if (/analytics|umami|plausible|posthog|matomo/i.test(urlLower))
        vote("analytics_platform", 12);
    if (/crm|twenty|salesforce/i.test(urlLower))
        vote("crm_platform", 12);
    if (/email|plunk|mailing|campaign/i.test(urlLower))
        vote("email_marketing_platform", 12);
    if (/chat|rocket|slack|matrix|mattermost/i.test(urlLower))
        vote("chat_platform", 12);
    if (/auth|logto|keycloak|ory|casdoor/i.test(urlLower))
        vote("auth_platform", 12);
    if (/n8n|workflow|automat/i.test(urlLower))
        vote("workflow_automation", 12);
    if (/medusa|saleor|commerce|shop/i.test(urlLower))
        vote("ecommerce_platform", 12);
    if (/novu|notification|knock/i.test(urlLower))
        vote("notification_platform", 12);
    // ── Dependency-based signals (strong) ──
    if (hasDep("@medusajs", "medusa"))
        vote("ecommerce_platform", 10);
    if (hasDep("@novu/"))
        vote("notification_platform", 10);
    if (hasDep("n8n", "temporal", "inngest"))
        vote("workflow_automation", 8);
    if (hasDep("hoppscotch"))
        vote("api_tool", 10);
    if (hasDep("openai", "@anthropic-ai", "langchain"))
        vote("ai_chat_platform", 4);
    if (hasDep("meteor", "ddp-client"))
        vote("chat_platform", 5);
    if (hasDep("bullmq", "@trigger.dev"))
        vote("background_jobs_platform", 5);
    // ── Feature name signals (scaled by term count) ──
    const countTerms = (re) => (signal.match(re) || []).length;
    // Chat/messaging
    const chatN = countTerms(/\b(chat|livechat|message.?type|conversation|thread|channel|room|ddp|meteor|fuselage)\b/g);
    if (chatN >= 3)
        vote("chat_platform", 8);
    else if (chatN >= 1)
        vote("chat_platform", 3);
    // Ecommerce
    const ecomN = countTerms(/\b(product|cart|order|shipping|discount|storefront|inventory|fulfillment|return|refund)\b/g);
    if (ecomN >= 3)
        vote("ecommerce_platform", 8);
    else if (ecomN >= 1)
        vote("ecommerce_platform", 3);
    // Notification (specific terms, not just "notification")
    const notifN = countTerms(/\b(subscriber|digest|notification.?channel|notification.?template|notification.?workflow|in.?app)\b/g);
    if (notifN >= 2)
        vote("notification_platform", 8);
    // Secrets/certificate management (high weight for domain-specific terms)
    const secretN = countTerms(/\b(secret|vault|certificate|key.?rotation|encrypt|kms|pki|seal|cmek)\b/g);
    if (secretN >= 10)
        vote("secrets_management", 15);
    else if (secretN >= 3)
        vote("secrets_management", 10);
    else if (secretN >= 1)
        vote("secrets_management", 4);
    // Auth platform
    const authN = countTerms(/\b(sso|saml|oidc|identity.?provider|mfa|totp|rbac|oauth.?provider|connector|sign.?in.?experience)\b/g);
    if (authN >= 3)
        vote("auth_platform", 8);
    else if (authN >= 1)
        vote("auth_platform", 4);
    // Analytics (expanded terms)
    const analyticsN = countTerms(/\b(pageview|visitor|session.?stat|event.?tracking|realtime|funnel|bounce|referrer|utm|tracker|pixel|website.?stats|dashboard)\b/g);
    if (analyticsN >= 3)
        vote("analytics_platform", 10);
    else if (analyticsN >= 1)
        vote("analytics_platform", 4);
    // CRM
    const crmN = countTerms(/\b(crm|lead|deal|pipeline|contact.?company|people|opportunity|activities)\b/g);
    if (crmN >= 2)
        vote("crm_platform", 8);
    else if (crmN >= 1)
        vote("crm_platform", 4);
    // Email marketing
    const emailN = countTerms(/\b(campaign|email.?template|transactional|subscriber|bounce|unsubscribe|smtp)\b/g);
    if (emailN >= 2)
        vote("email_marketing_platform", 8);
    else if (emailN >= 1)
        vote("email_marketing_platform", 4);
    // Scheduling
    if (/booking|scheduling|calendar|availability|slot/.test(signal))
        vote("scheduling_platform", 6);
    // Project management
    if (/\b(issue|sprint|cycle|kanban|backlog)\b/.test(signal))
        vote("project_management", 6);
    // Document
    if (/signing|signature|document.?template|recipient/.test(signal))
        vote("document_platform", 6);
    // Survey
    if (/survey|form.?response|question.?logic/.test(signal))
        vote("survey_platform", 6);
    // Workflow (only from feature names, not generic "trigger")
    if (/\b(workflow|automation)\b/.test(signal) && hasDep("n8n", "temporal", "inngest"))
        vote("workflow_automation", 6);
    else if (/\bworkflow\b/.test(signal))
        vote("workflow_automation", 2);
    // Finance
    if (/invoice|transaction|accounting|expense|ledger/.test(signal))
        vote("finance_platform", 6);
    // Background jobs (needs stronger signal than just "trigger")
    if (/\b(job.?queue|run.?execution|background.?job)\b/.test(signal))
        vote("background_jobs_platform", 4);
    // Pick the highest scoring class
    let best = "other";
    let bestScore = 0;
    for (const [cls, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            best = cls;
        }
    }
    return best;
}
/** Derive a clean app name — avoids "root", "@scope/root", "src", "backend" etc. */
function deriveAppName(rootDir, sourceUrl, pkgName) {
    // 1. Try extracting from source URL (most reliable for repos)
    if (sourceUrl) {
        const urlMatch = sourceUrl.match(/github\.com\/[\w-]+\/([\w.-]+)/);
        if (urlMatch) {
            return urlMatch[1].toLowerCase().replace(/\.git$/, "").replace(/\./g, "-");
        }
    }
    // 2. Use package.json name if it's not a generic monorepo root name
    if (pkgName && !/^(root|src|backend|frontend|app|server|client|web|api|@[\w-]+\/root)$/i.test(pkgName)) {
        // Strip org scope: @medusajs/medusa → medusa
        const stripped = pkgName.replace(/^@[\w-]+\//, "");
        if (stripped && !/^(root|monorepo)$/i.test(stripped)) {
            return stripped;
        }
    }
    // 3. Fall back to directory name
    return path.basename(rootDir);
}
export function analyzeApp(rootDir, sourceUrl = "") {
    const rootPkg = readJson(path.join(rootDir, "package.json"));
    const name = deriveAppName(rootDir, sourceUrl, rootPkg?.name);
    const sourceId = `learned-${name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    const deps = allDeps(rootDir);
    console.log(`\n[learn-app] Analyzing: ${name}`);
    console.log(`[learn-app] Source: ${sourceUrl || rootDir}`);
    console.log(`[learn-app] Dependencies: ${deps.length}`);
    console.log("\n[learn-app] Layer 1: Tech Stack...");
    const tech_stack = scanTechStack(rootDir, deps);
    console.log("[learn-app] Layer 2: Features...");
    const features = scanFeatures(rootDir);
    console.log(`  → ${features.length} features`);
    console.log("[learn-app] Layer 3: Data Models...");
    const data_models = scanDataModels(rootDir);
    console.log(`  → ${data_models.length} models`);
    // Link features to models
    console.log("[learn-app] Linking features → models...");
    for (const feature of features) {
        const featureKeywords = feature.name.toLowerCase().replace(/[-_\s]/g, "").split(/(?=[A-Z])/).map(w => w.toLowerCase());
        const featureDir = feature.directory.toLowerCase();
        for (const model of data_models) {
            const modelLower = model.name.toLowerCase();
            // Match if model name contains feature keyword or model is in feature directory
            if (featureKeywords.some(k => k.length > 2 && modelLower.includes(k)) ||
                (featureDir && model.name && featureDir.includes(modelLower))) {
                feature.related_data_models.push(model.name);
            }
        }
    }
    const linkedCount = features.filter(f => f.related_data_models.length > 0).length;
    console.log(`  → ${linkedCount} features linked to models`);
    console.log("[learn-app] Layer 4: Integrations...");
    const integrations = scanIntegrations(rootDir, deps);
    console.log(`  → ${integrations.length} integrations`);
    console.log("[learn-app] Layer 5: API Surface...");
    const api_surface = scanApi(rootDir, deps);
    console.log(`  → ${api_surface.total_endpoints} endpoints (${api_surface.style})`);
    console.log("[learn-app] Layers 6-11: UI...");
    const ui = scanUI(rootDir, deps);
    console.log(`  → ${ui.components.total_components} components, ${ui.pages.total_pages} pages, ${ui.user_flows.length} flows`);
    console.log("[learn-app] Layer 12: Auth Patterns...");
    const authPatterns = scanAuthPatterns(rootDir, deps);
    console.log(`  → ${authPatterns.length} auth patterns`);
    console.log("[learn-app] Layer 13: Testing Patterns...");
    const testPatterns = scanTestingPatterns(rootDir, deps);
    console.log(`  → ${testPatterns.length} testing patterns`);
    console.log("[learn-app] Layer 14: Error Handling...");
    const errorPatterns = scanErrorPatterns(rootDir, deps);
    console.log(`  → ${errorPatterns.length} error patterns`);
    console.log("[learn-app] Layer 15: Deployment...");
    const deployPatterns = scanDeploymentPatterns(rootDir);
    console.log(`  → ${deployPatterns.length} deployment patterns`);
    console.log("[learn-app] Layer 16: Security...");
    const securityPatterns = scanSecurityPatterns(rootDir, deps);
    console.log(`  → ${securityPatterns.length} security patterns`);
    // Architectural patterns
    const archPatterns = [];
    if (tech_stack.monorepo)
        archPatterns.push({ name: "Monorepo Architecture", type: "architecture", description: `Monorepo using ${tech_stack.build_tool} with shared packages`, evidence: "workspaces in package.json", applicable_to: ["all"], key_files: ["package.json", "turbo.json"] });
    if (tech_stack.orm !== "unknown")
        archPatterns.push({ name: `${tech_stack.orm} ORM Pattern`, type: "data_access", description: `Type-safe database access via ${tech_stack.orm}`, evidence: `${tech_stack.orm} in dependencies`, applicable_to: ["all"], key_files: [] });
    if (has(deps, "trpc", "@trpc"))
        archPatterns.push({ name: "tRPC API Pattern", type: "api", description: "Type-safe API layer using tRPC with router/procedure model", evidence: "trpc in dependencies", applicable_to: ["all"], key_files: [] });
    if (has(deps, "redis", "ioredis", "@upstash"))
        archPatterns.push({ name: "Redis Caching", type: "caching", description: "Application caching and rate limiting with Redis", evidence: "Redis in dependencies", applicable_to: ["all"], key_files: [] });
    if (has(deps, "i18next", "react-intl", "next-intl", "@lingui"))
        archPatterns.push({ name: "Internationalization", type: "localization", description: "Multi-language support with translation system", evidence: "i18n library in dependencies", applicable_to: ["all"], key_files: [] });
    // Plugin/extension pattern — detect recursively
    const appStoreDirs = findDirs(rootDir, /^(app-store|plugins|extensions|addons)$/, 3);
    if (appStoreDirs.length > 0) {
        archPatterns.push({ name: "App Store / Plugin Architecture", type: "extensibility", description: "Pluggable app/integration system with per-app packages", evidence: `${appStoreDirs.length} plugin directories`, applicable_to: ["scheduling_platform", "marketplace", "customer_portal"], key_files: appStoreDirs.map(d => path.relative(rootDir, d)) });
    }
    // Workflow pattern
    if (features.some(f => /workflow|automation|trigger/i.test(f.name))) {
        archPatterns.push({ name: "Workflow Engine", type: "automation", description: "Multi-step workflow automation with triggers, conditions, and actions", evidence: "workflows feature detected", applicable_to: ["workflow_approval_system", "scheduling_platform", "internal_ops_tool"], key_files: [] });
    }
    // Embeddable pattern
    if (features.some(f => /embed|widget/i.test(f.name))) {
        archPatterns.push({ name: "Embeddable Widget", type: "distribution", description: "Iframe/script embeddable widget for third-party sites", evidence: "embed feature detected", applicable_to: ["scheduling_platform", "customer_portal"], key_files: [] });
    }
    // Audit trail
    if (features.some(f => /audit|watchlist|activity/i.test(f.name))) {
        archPatterns.push({ name: "Audit Trail", type: "compliance", description: "Append-only audit logging with actor tracking", evidence: "audit feature detected", applicable_to: ["compliance_case_management", "fintech_wallet", "internal_ops_tool"], key_files: [] });
    }
    // Stripe
    if (has(deps, "stripe")) {
        archPatterns.push({ name: "Stripe Payment Integration", type: "payments", description: "Payment processing, subscriptions, and billing via Stripe", evidence: "stripe in dependencies", applicable_to: ["marketplace", "fintech_wallet", "scheduling_platform"], key_files: [] });
    }
    // Email templates
    const emailDirs = findDirs(rootDir, /^emails$/, 3);
    if (emailDirs.length > 0 || has(deps, "@react-email")) {
        archPatterns.push({ name: "Email Template System", type: "notifications", description: "Structured email templates with provider abstraction", evidence: "Email template directory/package found", applicable_to: ["all"], key_files: emailDirs.map(d => path.relative(rootDir, d)) });
    }
    // Queue/job system
    if (has(deps, "bullmq", "bull", "@bull-board", "bee-queue")) {
        archPatterns.push({ name: "Background Job Queue", type: "automation", description: "Async job processing with queue system", evidence: "Queue library in dependencies", applicable_to: ["all"], key_files: [] });
    }
    // WebSocket/realtime
    if (has(deps, "socket.io", "ws", "@liveblocks", "pusher", "ably")) {
        archPatterns.push({ name: "Real-time Communication", type: "api", description: "WebSocket or real-time event system", evidence: "Realtime library in dependencies", applicable_to: ["all"], key_files: [] });
    }
    const patterns = [...archPatterns, ...authPatterns, ...testPatterns, ...errorPatterns, ...deployPatterns, ...securityPatterns];
    const app_class = classifyApp(features, deps, rootDir, sourceUrl);
    const description = rootPkg?.description || `${app_class.replace(/_/g, " ")} built with ${tech_stack.framework}`;
    const totalFiles = countFiles(rootDir, [".ts", ".tsx", ".js", ".jsx", ".vue", ".svelte"]);
    return {
        source_id: sourceId,
        name,
        description,
        app_class,
        source_url: sourceUrl,
        tech_stack,
        features,
        data_models,
        integrations,
        api_surface,
        ui,
        patterns,
        stats: {
            total_files: totalFiles,
            total_components: ui.components.total_components,
            total_pages: ui.pages.total_pages,
            total_models: data_models.length,
            total_integrations: integrations.length,
            total_api_endpoints: api_surface.total_endpoints,
            total_patterns: patterns.length,
            total_user_flows: ui.user_flows.length,
        },
        schema_version: LEARNED_SCHEMA_VERSION,
        learned_at: new Date().toISOString(),
    };
}
// ═══════════════════════════════════════════════════════════════════════
// Neo4j Writer — typed nodes with proper labels
// ═══════════════════════════════════════════════════════════════════════
function esc(s) {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}
async function writeToNeo4j(app) {
    const neo4j = getNeo4jService();
    const ok = await neo4j.connect();
    if (!ok) {
        console.error("[learn-app] Cannot connect to Neo4j");
        return { written: 0, failed: 0 };
    }
    // Incremental scan: track scan version so we can clean up stale nodes after
    const scanVersion = new Date().toISOString();
    let written = 0, failed = 0;
    const w = async (cypher, label) => {
        try {
            await neo4j.runCypher(cypher);
            written++;
        }
        catch (e) {
            console.warn(`  ✗ ${label}: ${e.message}`);
            failed++;
        }
    };
    const sid = app.source_id;
    // ── App node ──
    console.log("[neo4j] Writing app node...");
    await w(`
MERGE (a:${L.app} {source_id: '${esc(sid)}'})
SET a.name = '${esc(app.name)}',
    a.description = '${esc(app.description)}',
    a.app_class = '${esc(app.app_class)}',
    a.source_url = '${esc(app.source_url)}',
    a.framework = '${esc(app.tech_stack.framework)}',
    a.language = '${esc(app.tech_stack.language)}',
    a.runtime = '${esc(app.tech_stack.runtime)}',
    a.database = '${esc(app.tech_stack.database)}',
    a.orm = '${esc(app.tech_stack.orm)}',
    a.styling = '${esc(app.tech_stack.styling)}',
    a.testing = '${esc(app.tech_stack.testing)}',
    a.build_tool = '${esc(app.tech_stack.build_tool)}',
    a.monorepo = ${app.tech_stack.monorepo},
    a.total_files = ${app.stats.total_files},
    a.total_components = ${app.stats.total_components},
    a.total_pages = ${app.stats.total_pages},
    a.total_models = ${app.stats.total_models},
    a.total_integrations = ${app.stats.total_integrations},
    a.total_endpoints = ${app.stats.total_api_endpoints},
    a.total_patterns = ${app.stats.total_patterns},
    a.total_user_flows = ${app.stats.total_user_flows},
    a.api_style = '${esc(app.api_surface.style)}',
    a.schema_version = ${app.schema_version},
    a.learned_at = '${esc(app.learned_at)}',
    a.scan_version = '${esc(scanVersion)}'
RETURN a.source_id
  `.trim(), "App");
    // ── Features ──
    console.log(`[neo4j] Writing ${app.features.length} features...`);
    for (const f of app.features) {
        await w(`
MERGE (f:${L.feature} {feature_id: '${esc(f.feature_id)}', source: '${esc(sid)}'})
SET f.name = '${esc(f.name)}', f.description = '${esc(f.description)}',
    f.directory = '${esc(f.directory)}', f.complexity = '${f.complexity}',
    f.file_count = ${f.file_count}, f.has_tests = ${f.has_tests}, f.has_api = ${f.has_api},
    f.scan_version = '${esc(scanVersion)}'
WITH f
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_feature}]->(f)
RETURN f.feature_id
    `.trim(), `Feature [${f.name}]`);
    }
    // ── Data Models ──
    console.log(`[neo4j] Writing ${app.data_models.length} data models...`);
    for (const dm of app.data_models) {
        const fieldSummary = dm.fields.slice(0, 15).map(f => `${f.name}:${f.type}`).join(", ");
        const relSummary = dm.relations.map(r => `${r.field_name}->${r.target_model}`).join(", ");
        await w(`
MERGE (m:${L.data_model} {name: '${esc(dm.name)}', source: '${esc(sid)}'})
SET m.category = '${esc(dm.category)}', m.field_count = ${dm.fields.length},
    m.relation_count = ${dm.relations.length}, m.fields = '${esc(fieldSummary)}',
    m.relations = '${esc(relSummary)}',
    m.schema_source = '${esc(dm.schema_source || "")}',
    m.scan_version = '${esc(scanVersion)}'
WITH m
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_data_model}]->(m)
RETURN m.name
    `.trim(), `Model [${dm.name}]`);
    }
    // ── Feature → Model edges ──
    console.log(`[neo4j] Linking features to models...`);
    for (const f of app.features) {
        for (const modelName of f.related_data_models) {
            await w(`
MATCH (f:${L.feature} {feature_id: '${esc(f.feature_id)}', source: '${esc(sid)}'})
MATCH (m:${L.data_model} {name: '${esc(modelName)}', source: '${esc(sid)}'})
MERGE (f)-[:USES_MODEL]->(m)
      `.trim(), `Link [${f.name}→${modelName}]`);
        }
    }
    // ── Integrations ──
    console.log(`[neo4j] Writing ${app.integrations.length} integrations...`);
    for (const i of app.integrations) {
        await w(`
MERGE (i:${L.integration} {name: '${esc(i.name)}', source: '${esc(sid)}'})
SET i.type = '${esc(i.type)}', i.provider = '${esc(i.provider)}',
    i.category = '${esc(i.category)}', i.auth_method = '${esc(i.auth_method)}',
    i.scan_version = '${esc(scanVersion)}'
WITH i
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_integration}]->(i)
RETURN i.name
    `.trim(), `Integration [${i.name}]`);
    }
    // ── API Domains ──
    console.log(`[neo4j] Writing ${app.api_surface.domains.length} API domains...`);
    for (const d of app.api_surface.domains) {
        await w(`
MERGE (d:${L.api_domain} {name: '${esc(d.name)}', source: '${esc(sid)}'})
SET d.endpoint_count = ${d.endpoint_count}, d.has_crud = ${d.has_crud},
    d.has_search = ${d.has_search}, d.has_batch = ${d.has_batch},
    d.scan_version = '${esc(scanVersion)}'
WITH d
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_api_domain}]->(d)
RETURN d.name
    `.trim(), `ApiDomain [${d.name}]`);
    }
    // ── Component Groups ──
    console.log(`[neo4j] Writing ${app.ui.components.categories.length} component groups...`);
    for (const c of app.ui.components.categories) {
        await w(`
MERGE (c:${L.component_group} {name: '${esc(c.name)}', source: '${esc(sid)}'})
SET c.count = ${c.count}, c.key_components = '${esc(c.key_components.join(", "))}',
    c.scan_version = '${esc(scanVersion)}'
WITH c
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_components}]->(c)
RETURN c.name
    `.trim(), `ComponentGroup [${c.name}]`);
    }
    // ── Component Patterns (top components with props/children) ──
    const compPatterns = app.ui.component_patterns || [];
    console.log(`[neo4j] Writing ${compPatterns.length} component patterns...`);
    for (const cp of compPatterns) {
        await w(`
MERGE (c:LearnedComponentPattern {name: '${esc(cp.name)}', source: '${esc(sid)}'})
SET c.category = '${esc(cp.category)}',
    c.description = '${esc(cp.description || "")}',
    c.props = '${esc(cp.props.join(", "))}',
    c.child_components = '${esc(cp.child_components.join(", "))}',
    c.uses_state = ${cp.uses_state},
    c.uses_effects = ${cp.uses_effects},
    c.line_count = ${cp.line_count},
    c.file_path = '${esc(cp.file_path)}',
    c.usage_example = '${esc(cp.usage_example || "")}',
    c.scan_version = '${esc(scanVersion)}'
WITH c
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:HAS_COMPONENT_PATTERN]->(c)
RETURN c.name
    `.trim(), `ComponentPattern [${cp.name}]`);
    }
    // ── Page Sections ──
    console.log(`[neo4j] Writing ${app.ui.pages.sections.length} page sections...`);
    for (const s of app.ui.pages.sections) {
        await w(`
MERGE (s:${L.page_section} {name: '${esc(s.name)}', source: '${esc(sid)}'})
SET s.page_count = ${s.page_count}, s.is_public = ${s.is_public},
    s.requires_auth = ${s.requires_auth}, s.key_routes = '${esc(s.key_routes.join(", "))}',
    s.scan_version = '${esc(scanVersion)}'
WITH s
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_pages}]->(s)
RETURN s.name
    `.trim(), `PageSection [${s.name}]`);
    }
    // ── Design System ──
    console.log(`[neo4j] Writing design system...`);
    const ds = app.ui.design_system;
    await w(`
MERGE (d:${L.design_system} {source: '${esc(sid)}'})
SET d.css_framework = '${esc(ds.css_framework)}',
    d.component_library = '${esc(ds.component_library)}',
    d.icon_library = '${esc(ds.icon_library)}',
    d.color_token_count = ${ds.color_system.token_count},
    d.has_dark_mode = ${ds.color_system.has_dark_mode},
    d.has_custom_theming = ${ds.color_system.has_custom_theming},
    d.font_families = '${esc(ds.typography.font_families.join(", "))}',
    d.spacing_system = '${esc(ds.spacing.system)}',
    d.scan_version = '${esc(scanVersion)}'
WITH d
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_design_system}]->(d)
RETURN d.source
  `.trim(), "DesignSystem");
    // ── User Flows ──
    console.log(`[neo4j] Writing ${app.ui.user_flows.length} user flows...`);
    for (const uf of app.ui.user_flows) {
        await w(`
MERGE (f:${L.user_flow} {name: '${esc(uf.name)}', source: '${esc(sid)}'})
SET f.section = '${esc(uf.section)}', f.step_count = ${uf.step_count},
    f.entry_point = '${esc(uf.entry_point)}',
    f.steps = '${esc(uf.steps.map(s => s.name).join(" → "))}',
    f.scan_version = '${esc(scanVersion)}'
WITH f
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_user_flow}]->(f)
RETURN f.name
    `.trim(), `UserFlow [${uf.name}]`);
    }
    // ── Form Patterns ──
    console.log(`[neo4j] Writing ${app.ui.form_patterns.length} form patterns...`);
    for (const fp of app.ui.form_patterns) {
        await w(`
MERGE (f:${L.form_pattern} {name: '${esc(fp.name)}', source: '${esc(sid)}'})
SET f.validation_library = '${esc(fp.validation_library)}',
    f.form_library = '${esc(fp.form_library)}',
    f.has_multi_step = ${fp.has_multi_step},
    f.has_file_upload = ${fp.has_file_upload},
    f.components = '${esc(fp.components.join(", "))}',
    f.scan_version = '${esc(scanVersion)}'
WITH f
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_form_pattern}]->(f)
RETURN f.name
    `.trim(), `FormPattern [${fp.name}]`);
    }
    // ── State Patterns ──
    console.log(`[neo4j] Writing ${app.ui.state_patterns.length} state patterns...`);
    for (const sp of app.ui.state_patterns) {
        await w(`
MERGE (s:${L.state_pattern} {component: '${esc(sp.component)}', source: '${esc(sid)}'})
SET s.type = '${esc(sp.type)}', s.description = '${esc(sp.description)}',
    s.scope = '${esc(sp.scope)}',
    s.scan_version = '${esc(scanVersion)}'
WITH s
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_state_pattern}]->(s)
RETURN s.component
    `.trim(), `StatePattern [${sp.component}]`);
    }
    // ── Patterns ──
    console.log(`[neo4j] Writing ${app.patterns.length} patterns...`);
    for (const p of app.patterns) {
        await w(`
MERGE (p:${L.pattern} {name: '${esc(p.name)}', source: '${esc(sid)}'})
SET p.type = '${esc(p.type)}', p.description = '${esc(p.description)}',
    p.evidence = '${esc(p.evidence)}',
    p.applicable_to = '${esc(p.applicable_to.join(", "))}',
    p.scan_version = '${esc(scanVersion)}'
WITH p
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_pattern}]->(p)
RETURN p.name
    `.trim(), `Pattern [${p.name}]`);
    }
    // ── Navigation ──
    console.log(`[neo4j] Writing navigation...`);
    const nav = app.ui.navigation;
    if (nav.items.length > 0) {
        await w(`
MERGE (n:LearnedNavigation {source: '${esc(sid)}'})
SET n.style = '${esc(nav.style)}',
    n.item_count = ${nav.items.length},
    n.has_command_palette = ${nav.has_command_palette},
    n.has_mobile_nav = ${nav.has_mobile_nav},
    n.has_breadcrumbs = ${nav.has_breadcrumbs},
    n.items = '${esc(nav.items.map(i => `${i.label}:${i.route}`).join(", "))}'
WITH n
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:HAS_NAVIGATION]->(n)
RETURN n.source
    `.trim(), "Navigation");
    }
    // Cleanup stale nodes from previous scans of this app
    console.log("[neo4j] Cleaning up stale nodes...");
    for (const label of [L.feature, L.data_model, L.integration, L.pattern, L.user_flow, L.form_pattern, L.state_pattern, L.api_domain, L.page_section, L.component_group]) {
        try {
            const result = await neo4j.runCypher(`
        MATCH (n:${label} {source: '${esc(sid)}'})
        WHERE n.scan_version IS NULL OR n.scan_version <> '${esc(scanVersion)}'
        DETACH DELETE n
        RETURN count(n) AS deleted
      `);
            const deleted = result[0]?.deleted;
            const count = typeof deleted === "object" ? deleted.low : deleted;
            if (count > 0)
                console.log(`  Removed ${count} stale ${label} nodes`);
        }
        catch { }
    }
    console.log(`\n  Neo4j: ${written} nodes written, ${failed} failed`);
    await neo4j.close();
    return { written, failed };
}
// ═══════════════════════════════════════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════════════════════════════════════
async function main() {
    const args = process.argv.slice(2);
    const rootDir = args.find(a => !a.startsWith("--")) || ".";
    const sourceUrl = args.find(a => a.startsWith("--source-url="))?.split("=").slice(1).join("=") || "";
    if (!exists(rootDir)) {
        console.error(`Path not found: ${rootDir}`);
        process.exit(1);
    }
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  AES App Learner v2 — All 16 Layers (recursive discovery)");
    console.log("═══════════════════════════════════════════════════════════");
    const app = analyzeApp(rootDir, sourceUrl);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ANALYSIS COMPLETE");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  App:            ${app.name}`);
    console.log(`  Class:          ${app.app_class}`);
    console.log(`  Stack:          ${app.tech_stack.framework} + ${app.tech_stack.database}`);
    console.log(`  Monorepo:       ${app.tech_stack.monorepo}`);
    console.log(`  Files:          ${app.stats.total_files}`);
    console.log(`  Features:       ${app.stats.total_components}`);
    console.log(`  Data Models:    ${app.stats.total_models}`);
    console.log(`  Integrations:   ${app.stats.total_integrations}`);
    console.log(`  API Endpoints:  ${app.stats.total_api_endpoints} (${app.api_surface.style})`);
    console.log(`  Components:     ${app.stats.total_components}`);
    console.log(`  Pages:          ${app.stats.total_pages}`);
    console.log(`  Patterns:       ${app.stats.total_patterns}`);
    console.log(`  User Flows:     ${app.stats.total_user_flows}`);
    console.log(`  UI Framework:   ${app.ui.design_system.css_framework} + ${app.ui.design_system.component_library}`);
    console.log(`  Icons:          ${app.ui.design_system.icon_library}`);
    console.log(`  Form Patterns:  ${app.ui.form_patterns.length}`);
    console.log(`  State Patterns: ${app.ui.state_patterns.length}`);
    console.log(`\n  PATTERNS:`);
    for (const p of app.patterns) {
        console.log(`    [${p.type}] ${p.name}`);
    }
    console.log("\n───────────────────────────────────────────────────────────");
    console.log("  WRITING TO NEO4J (typed nodes)");
    console.log("───────────────────────────────────────────────────────────");
    const result = await writeToNeo4j(app);
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  AES has learned all 16 layers from this codebase.");
    console.log("═══════════════════════════════════════════════════════════");
}
main().catch(console.error);
