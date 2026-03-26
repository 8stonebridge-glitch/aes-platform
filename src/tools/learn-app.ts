/**
 * learn-app.ts — Unified codebase learner. Analyzes ALL layers of an existing
 * app and writes typed knowledge to Neo4j using the LearnedApp schema.
 *
 * Layers:
 *   1. Tech Stack         — framework, DB, ORM, build tool, key packages
 *   2. Features           — feature modules with complexity, tests, API surface
 *   3. Data Models        — Prisma/schema models with typed fields and relations
 *   4. Integrations       — third-party services with auth methods
 *   5. API Surface        — REST, tRPC, GraphQL routes grouped by domain
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
import {
  LEARNED_SCHEMA_VERSION,
  LEARNED_NODE_LABELS as L,
  LEARNED_RELATIONSHIPS as R,
  type LearnedApp,
  type LearnedTechStack,
  type LearnedFeature,
  type LearnedDataModel,
  type LearnedField,
  type LearnedRelation,
  type LearnedIntegration,
  type IntegrationType,
  type LearnedApiSurface,
  type LearnedApiRoute,
  type LearnedApiDomain,
  type ApiStyle,
  type LearnedUI,
  type LearnedDesignSystem,
  type LearnedComponentLibrary,
  type LearnedComponentCategory,
  type LearnedPageStructure,
  type LearnedPageSection,
  type LearnedNavigation,
  type LearnedNavItem,
  type LearnedUserFlow,
  type LearnedFormPattern,
  type LearnedStatePattern,
  type LearnedPattern,
  type PatternType,
  type DataModelCategory,
} from "../types/learned-knowledge.js";

// ─── File Utilities ─────────────────────────────────────────────────

function readFile(p: string, max = 500): string {
  try { return fs.readFileSync(p, "utf-8").split("\n").slice(0, max).join("\n"); } catch { return ""; }
}

function readJson(p: string): any {
  try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return null; }
}

function exists(p: string): boolean {
  return fs.existsSync(p);
}

function findFiles(dir: string, re: RegExp, maxDepth = 5, d = 0): string[] {
  if (d >= maxDepth) return [];
  const out: string[] = [];
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === ".next") continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...findFiles(fp, re, maxDepth, d + 1));
      else if (re.test(e.name)) out.push(fp);
    }
  } catch {}
  return out;
}

function countFiles(dir: string, exts: string[]): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const fp = path.join(dir, e.name);
      if (e.isDirectory()) n += countFiles(fp, exts);
      else if (exts.length === 0 || exts.some(x => e.name.endsWith(x))) n++;
    }
  } catch {}
  return n;
}

function allDeps(root: string): string[] {
  const deps = new Set<string>();
  const scan = (dir: string, depth = 0) => {
    if (depth > 3) return;
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const fp = path.join(dir, e.name);
        if (e.isDirectory()) {
          const pkg = readJson(path.join(fp, "package.json"));
          if (pkg?.dependencies) Object.keys(pkg.dependencies).forEach(d => deps.add(d));
          if (pkg?.devDependencies) Object.keys(pkg.devDependencies).forEach(d => deps.add(d));
          scan(fp, depth + 1);
        }
      }
    } catch {}
  };
  const rootPkg = readJson(path.join(root, "package.json"));
  if (rootPkg?.dependencies) Object.keys(rootPkg.dependencies).forEach(d => deps.add(d));
  if (rootPkg?.devDependencies) Object.keys(rootPkg.devDependencies).forEach(d => deps.add(d));
  scan(root);
  return [...deps];
}

function has(deps: string[], ...needles: string[]): boolean {
  return needles.some(n => deps.some(d => d.includes(n)));
}

function detect(deps: string[], pairs: [string, string][]): string {
  for (const [needle, label] of pairs) {
    if (deps.some(d => d.includes(needle))) return label;
  }
  return "unknown";
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 1: Tech Stack
// ═══════════════════════════════════════════════════════════════════════

function scanTechStack(root: string, deps: string[]): LearnedTechStack {
  return {
    framework: detect(deps, [["next", "Next.js"], ["nuxt", "Nuxt"], ["remix", "Remix"], ["svelte", "SvelteKit"], ["@nestjs", "NestJS"], ["express", "Express"], ["fastify", "Fastify"], ["hono", "Hono"]]),
    language: exists(path.join(root, "tsconfig.json")) ? "TypeScript" : "JavaScript",
    runtime: has(deps, "bun") ? "Bun" : has(deps, "deno") ? "Deno" : "Node.js",
    database: detect(deps, [["prisma", "PostgreSQL (Prisma)"], ["@prisma", "PostgreSQL (Prisma)"], ["mongoose", "MongoDB"], ["drizzle", "SQL (Drizzle)"], ["typeorm", "SQL (TypeORM)"], ["convex", "Convex"], ["@supabase", "Supabase"], ["firebase", "Firebase"]]),
    orm: detect(deps, [["prisma", "Prisma"], ["@prisma", "Prisma"], ["drizzle", "Drizzle"], ["typeorm", "TypeORM"], ["mongoose", "Mongoose"], ["kysely", "Kysely"], ["sequelize", "Sequelize"]]),
    styling: detect(deps, [["tailwindcss", "Tailwind CSS"], ["styled-components", "Styled Components"], ["@emotion", "Emotion"], ["sass", "SASS"], ["@vanilla-extract", "Vanilla Extract"]]),
    testing: detect(deps, [["vitest", "Vitest"], ["jest", "Jest"], ["playwright", "Playwright"], ["cypress", "Cypress"], ["mocha", "Mocha"]]),
    build_tool: detect(deps, [["turbo", "Turborepo"], ["nx", "Nx"], ["lerna", "Lerna"], ["vite", "Vite"], ["webpack", "Webpack"], ["esbuild", "esbuild"]]),
    monorepo: !!(readJson(path.join(root, "package.json"))?.workspaces) || exists(path.join(root, "turbo.json")) || exists(path.join(root, "nx.json")),
    key_packages: deps.slice(0, 80),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 2: Features
// ═══════════════════════════════════════════════════════════════════════

const FEAT_DESC: Record<string, string> = {
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
};

function scanFeatures(root: string): LearnedFeature[] {
  const features: LearnedFeature[] = [];
  const dirs = ["packages/features", "src/features", "src/modules", "packages", "apps", "modules"];

  for (const dir of dirs) {
    const full = path.join(root, dir);
    if (!exists(full)) continue;
    try {
      for (const e of fs.readdirSync(full, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
        const fp = path.join(full, e.name);
        const fc = countFiles(fp, [".ts", ".tsx", ".js", ".jsx"]);
        if (fc === 0) continue;

        const pkg = readJson(path.join(fp, "package.json"));
        const hasTests = countFiles(fp, [".test.ts", ".test.tsx", ".spec.ts"]) > 0;
        const hasApi = countFiles(fp, [".handler.ts", ".controller.ts", ".router.ts"]) > 0 || exists(path.join(fp, "api"));
        const nameLower = e.name.toLowerCase().replace(/[-_]/g, "");
        const desc = Object.entries(FEAT_DESC).find(([k]) => nameLower.includes(k))?.[1] || pkg?.description || `${e.name} module`;

        features.push({
          feature_id: `feat-${e.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase(),
          name: e.name.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
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
    } catch {}
  }
  return features;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 3: Data Models
// ═══════════════════════════════════════════════════════════════════════

function categorizeModel(name: string): DataModelCategory {
  const l = name.toLowerCase();
  const map: [string[], DataModelCategory][] = [
    [["user", "account", "session", "password", "profile", "membership", "role"], "auth_identity"],
    [["booking", "attendee", "seat", "schedule", "availability", "slot", "host"], "scheduling"],
    [["payment", "billing", "credit", "proration", "subscription", "invoice"], "payments"],
    [["workflow", "step", "reminder", "trigger", "action"], "automation"],
    [["webhook", "apikey", "ratelimit", "app"], "integration"],
    [["team", "organization", "domain", "managed"], "organization"],
    [["calendar", "event", "destination"], "calendar"],
    [["routing", "form", "response"], "routing"],
    [["audit", "report", "watchlist"], "audit"],
    [["feature", "flag", "deployment"], "infrastructure"],
    [["credential", "oauth", "token", "access"], "auth_oauth"],
    [["notification", "email", "sms", "verified"], "notifications"],
  ];
  for (const [kws, cat] of map) { if (kws.some(k => l.includes(k))) return cat; }
  return "general";
}

function scanDataModels(root: string): LearnedDataModel[] {
  const schemaPaths = ["packages/prisma/schema.prisma", "prisma/schema.prisma", "src/prisma/schema.prisma", "schema.prisma"];
  let content = "";
  for (const sp of schemaPaths) {
    const fp = path.join(root, sp);
    if (exists(fp)) { content = fs.readFileSync(fp, "utf-8"); break; }
  }
  if (!content) return [];

  const models: LearnedDataModel[] = [];
  const re = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const [, name, body] = m;
    const fields: LearnedField[] = [];
    const relations: LearnedRelation[] = [];

    for (const line of body.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("//") || t.startsWith("@@")) continue;
      const fm = t.match(/^(\w+)\s+(\w+)(\[\])?\s*(\?)?\s*/);
      if (!fm) continue;
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

    models.push({ name, category: categorizeModel(name), fields, relations });
  }
  return models;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 4: Integrations
// ═══════════════════════════════════════════════════════════════════════

function classifyIntType(name: string): IntegrationType {
  const l = name.toLowerCase();
  if (l.includes("video") || l.includes("zoom") || l.includes("meet") || l.includes("teams") || l.includes("jitsi") || l.includes("daily")) return "video_conferencing";
  if (l.includes("calendar") || l.includes("caldav") || l.includes("ical")) return "calendar";
  if (l.includes("payment") || l.includes("stripe") || l.includes("paypal") || l.includes("btcpay")) return "payment";
  if (l.includes("crm") || l.includes("hubspot") || l.includes("salesforce") || l.includes("pipedrive")) return "crm";
  if (l.includes("analytics") || l.includes("ga4") || l.includes("posthog") || l.includes("plausible")) return "analytics";
  if (l.includes("zapier") || l.includes("make") || l.includes("n8n")) return "automation";
  if (l.includes("slack") || l.includes("discord") || l.includes("telegram") || l.includes("whatsapp")) return "messaging";
  if (l.includes("email") || l.includes("sendgrid") || l.includes("resend") || l.includes("mailgun")) return "email";
  if (l.includes("sms") || l.includes("twilio")) return "sms";
  if (l.includes("s3") || l.includes("storage") || l.includes("upload")) return "storage";
  if (l.includes("sentry") || l.includes("datadog")) return "monitoring";
  if (l.includes("auth0") || l.includes("clerk") || l.includes("next-auth")) return "auth";
  return "other";
}

function inferAuthMethod(name: string, content: string): "oauth" | "api_key" | "webhook" | "unknown" {
  if (content.includes("OAuth") || content.includes("oauth") || content.includes("getToken") || content.includes("refreshToken")) return "oauth";
  if (content.includes("apiKey") || content.includes("API_KEY") || content.includes("api_key")) return "api_key";
  if (content.includes("webhook") || content.includes("Webhook")) return "webhook";
  return "unknown";
}

function scanIntegrations(root: string, deps: string[]): LearnedIntegration[] {
  const integrations: LearnedIntegration[] = [];
  const seen = new Set<string>();

  // App store directories
  for (const dir of ["packages/app-store", "src/integrations", "packages/integrations"]) {
    const full = path.join(root, dir);
    if (!exists(full)) continue;
    try {
      for (const e of fs.readdirSync(full, { withFileTypes: true })) {
        if (!e.isDirectory() || e.name.startsWith(".") || e.name.startsWith("_")) continue;
        if (seen.has(e.name)) continue;
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
    } catch {}
  }

  // Dependency-derived integrations
  const depInts: [string, IntegrationType, string][] = [
    ["stripe", "payment", "Stripe"], ["@stripe", "payment", "Stripe"],
    ["paypal", "payment", "PayPal"], ["@sendgrid", "email", "SendGrid"],
    ["nodemailer", "email", "Nodemailer"], ["resend", "email", "Resend"],
    ["twilio", "sms", "Twilio"], ["@slack", "messaging", "Slack"],
    ["@aws-sdk", "cloud", "AWS"], ["@google-cloud", "cloud", "Google Cloud"],
    ["firebase", "cloud", "Firebase"], ["@supabase", "cloud", "Supabase"],
    ["@clerk", "auth", "Clerk"], ["@auth0", "auth", "Auth0"],
    ["next-auth", "auth", "NextAuth"], ["@sentry", "monitoring", "Sentry"],
    ["posthog", "analytics", "PostHog"], ["@upstash", "caching" as IntegrationType, "Upstash"],
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
// Layer 5: API Surface
// ═══════════════════════════════════════════════════════════════════════

function scanApi(root: string, deps: string[]): LearnedApiSurface {
  const routes: LearnedApiRoute[] = [];

  // Detect API style
  let style: ApiStyle = "rest";
  if (has(deps, "trpc", "@trpc")) style = has(deps, "express", "@nestjs") ? "mixed" : "trpc";
  if (has(deps, "graphql", "@apollo", "type-graphql")) style = style === "rest" ? "graphql" : "mixed";

  // Scan Next.js / Express API routes
  const apiDirs = [
    "apps/web/pages/api", "apps/web/app/api", "apps/api/v1/pages/api", "apps/api/v2/src/modules",
    "src/pages/api", "src/app/api", "pages/api", "app/api",
  ];

  for (const apiDir of apiDirs) {
    const full = path.join(root, apiDir);
    if (!exists(full)) continue;
    const scanR = (dir: string, prefix: string) => {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith(".") || e.name === "node_modules") continue;
          const fp = path.join(dir, e.name);
          if (e.isDirectory()) { scanR(fp, `${prefix}/${e.name}`); continue; }
          if (!/\.(ts|js|tsx)$/.test(e.name) || e.name.includes(".test.")) continue;
          const rp = `${prefix}/${e.name.replace(/\.(ts|js|tsx)$/, "").replace(/^index$/, "")}`.replace(/\/+/g, "/");
          const c = readFile(fp, 30);
          const methods: string[] = [];
          if (/\bGET\b/.test(c)) methods.push("GET");
          if (/\bPOST\b|create|Create/.test(c)) methods.push("POST");
          if (/\bPUT\b|\bPATCH\b|update|Update/.test(c)) methods.push("PUT");
          if (/\bDELETE\b|delete|remove/.test(c)) methods.push("DELETE");
          if (methods.length === 0) methods.push("GET");
          const domain = prefix.split("/").filter(Boolean)[0] || "root";
          const isPublic = rp.includes("public") || rp.includes("booking") || rp.includes("webhook");
          routes.push({ path: rp, methods, domain, is_public: isPublic });
        }
      } catch {}
    };
    scanR(full, "/api");
  }

  // Scan tRPC routers
  for (const trpcDir of ["packages/trpc/server/routers", "src/server/routers", "src/trpc/routers"]) {
    const full = path.join(root, trpcDir);
    if (!exists(full)) continue;
    const scanT = (dir: string) => {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
          if (e.isDirectory()) {
            routes.push({ path: `trpc/${e.name}`, methods: ["QUERY", "MUTATION"], domain: e.name, is_public: false });
            scanT(path.join(dir, e.name));
          }
        }
      } catch {}
    };
    scanT(full);
  }

  // Build domain summary
  const domainMap = new Map<string, LearnedApiRoute[]>();
  for (const r of routes) {
    if (!domainMap.has(r.domain)) domainMap.set(r.domain, []);
    domainMap.get(r.domain)!.push(r);
  }

  const domains: LearnedApiDomain[] = [...domainMap.entries()].map(([name, rs]) => ({
    name,
    endpoint_count: rs.length,
    has_crud: rs.some(r => r.methods.includes("POST")) && rs.some(r => r.methods.includes("GET")) && rs.some(r => r.methods.includes("DELETE")),
    has_search: rs.some(r => r.path.includes("search") || r.path.includes("list") || r.path.includes("find")),
    has_batch: rs.some(r => r.path.includes("bulk") || r.path.includes("batch")),
  }));

  return { style, routes, domains, total_endpoints: routes.length };
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 6-11: UI (components, pages, navigation, design, flows, states)
// ═══════════════════════════════════════════════════════════════════════

function catComponent(fp: string, name: string): string {
  const l = (fp + name).toLowerCase();
  if (/form|input|select|checkbox|switch|radio|textarea/.test(l)) return "form";
  if (/dialog|modal|sheet|popover|overlay|drawer/.test(l)) return "overlay";
  if (/nav|sidebar|menu|breadcrumb|tab/.test(l)) return "navigation";
  if (/button|badge|icon|avatar|logo/.test(l)) return "element";
  if (/table|list|card|grid|tree/.test(l)) return "data_display";
  if (/skeleton|loading|spinner|progress/.test(l)) return "loading";
  if (/error|empty|alert/.test(l)) return "feedback";
  if (/layout|shell|container|section|wrapper/.test(l)) return "layout";
  if (/toast|banner|notification|snackbar/.test(l)) return "notification";
  if (/editor|richtext|markdown/.test(l)) return "editor";
  if (/calendar|date|time|picker/.test(l)) return "datetime";
  if (/upload|file|image|drop/.test(l)) return "upload";
  return "general";
}

function scanUI(root: string, deps: string[]): LearnedUI {
  // ── Components ──
  const compMap = new Map<string, string[]>();
  for (const dir of ["packages/ui", "packages/coss-ui", "src/components", "apps/web/components", "apps/web/modules"]) {
    const full = path.join(root, dir);
    if (!exists(full)) continue;
    for (const fp of findFiles(full, /\.tsx$/, 4)) {
      const name = path.basename(fp, ".tsx");
      if (name.startsWith("_") || name === "index" || name.includes(".test") || name.includes(".stories")) continue;
      const cat = catComponent(path.relative(root, fp), name);
      if (!compMap.has(cat)) compMap.set(cat, []);
      compMap.get(cat)!.push(name);
    }
  }

  const totalComponents = [...compMap.values()].reduce((s, a) => s + a.length, 0);
  const categories: LearnedComponentCategory[] = [...compMap.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([name, comps]) => ({ name, count: comps.length, key_components: comps.slice(0, 10) }));

  const components: LearnedComponentLibrary = { total_components: totalComponents, categories };

  // ── Pages ──
  const sectionMap = new Map<string, { routes: string[]; isPublic: boolean; hasAuth: boolean }>();
  const pageDirs = ["apps/web/app", "apps/web/pages", "src/app", "src/pages", "app", "pages"];

  for (const pd of pageDirs) {
    const full = path.join(root, pd);
    if (!exists(full)) continue;
    const scanP = (dir: string, route: string, section: string) => {
      try {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "_components") continue;
          const fp = path.join(dir, e.name);
          if (e.isDirectory()) {
            const isGrp = e.name.startsWith("(");
            scanP(fp, isGrp ? route : `${route}/${e.name}`, isGrp ? e.name.replace(/[()]/g, "") : section);
          } else if (/^page\.(tsx?|jsx?)$/.test(e.name)) {
            const c = readFile(fp, 30);
            const isPublic = route.includes("booking") || route.includes("auth") || route.includes("signup");
            const hasAuth = /auth|session|getServerSession/.test(c);
            if (!sectionMap.has(section)) sectionMap.set(section, { routes: [], isPublic: false, hasAuth: false });
            const s = sectionMap.get(section)!;
            s.routes.push(route || "/");
            if (isPublic) s.isPublic = true;
            if (hasAuth) s.hasAuth = true;
          }
        }
      } catch {}
    };
    scanP(full, "", "root");
  }

  const totalPages = [...sectionMap.values()].reduce((s, v) => s + v.routes.length, 0);
  const sections: LearnedPageSection[] = [...sectionMap.entries()]
    .sort((a, b) => b[1].routes.length - a[1].routes.length)
    .map(([name, v]) => ({
      name, page_count: v.routes.length, is_public: v.isPublic,
      requires_auth: v.hasAuth, key_routes: v.routes.slice(0, 10),
    }));

  const pages: LearnedPageStructure = { total_pages: totalPages, sections };

  // ── Navigation ──
  const shellFiles = findFiles(root, /[Ss]hell\.tsx$/, 5);
  const navFiles = findFiles(root, /[Nn]avigation\.tsx$/, 5);
  let hasCmd = false, hasMobile = false, hasBread = false;
  for (const f of [...shellFiles, ...navFiles]) {
    const c = readFile(f, 200);
    if (/KBar|cmdk|CommandPalette/.test(c)) hasCmd = true;
    if (/[Mm]obile[Nn]av|MobileNavigation/.test(c)) hasMobile = true;
    if (/[Bb]readcrumb/.test(c)) hasBread = true;
  }

  const navItems: LearnedNavItem[] = [];
  // Extract nav items from navigation files
  for (const nf of navFiles) {
    const c = readFile(nf, 300);
    const hrefMatches = [...c.matchAll(/href\s*[=:]\s*["'`]([^"'`]+)["'`]/g)];
    const labelMatches = [...c.matchAll(/(?:label|name|title)\s*[=:]\s*["'`]([^"'`]+)["'`]/g)];
    for (let i = 0; i < Math.min(hrefMatches.length, 20); i++) {
      const route = hrefMatches[i][1];
      const label = i < labelMatches.length ? labelMatches[i][1] : route.split("/").pop() || "";
      if (navItems.some(n => n.route === route)) continue;
      navItems.push({ label, route, icon: "", section: route.split("/").filter(Boolean)[0] || "home", has_submenu: false, badge: false });
    }
  }

  const navStyle = shellFiles.some(f => readFile(f, 100).includes("SideBar")) ? "sidebar" as const : "topnav" as const;
  const navigation: LearnedNavigation = { style: navStyle, items: navItems, has_command_palette: hasCmd, has_mobile_nav: hasMobile, has_breadcrumbs: hasBread };

  // ── Design System ──
  let cssFramework = "unknown";
  if (exists(path.join(root, "tailwind.config.ts")) || exists(path.join(root, "tailwind.config.js"))) cssFramework = "Tailwind CSS";
  else if (has(deps, "@vanilla-extract")) cssFramework = "Vanilla Extract";

  let compLib = "custom";
  if (has(deps, "@radix-ui")) compLib = "Radix UI";
  if (has(deps, "@base-ui")) compLib += " + Base UI";
  if (has(deps, "@chakra-ui")) compLib = "Chakra UI";
  if (has(deps, "@mantine")) compLib = "Mantine";
  if (has(deps, "@mui")) compLib = "Material UI";

  let iconLib = "none";
  if (has(deps, "lucide")) iconLib = "Lucide";
  else if (has(deps, "heroicons", "@heroicons")) iconLib = "Heroicons";
  else if (has(deps, "@phosphor")) iconLib = "Phosphor";

  // Scan color tokens from CSS files
  let colorCount = 0;
  const colorCats = new Set<string>();
  let hasDark = false, hasTheming = false;
  for (const cssFile of findFiles(root, /tokens?\.(css|scss)$/i, 4)) {
    const c = readFile(cssFile, 300);
    const vars = [...c.matchAll(/--([a-z-]+)\s*:/g)];
    for (const v of vars) {
      const n = v[1];
      if (/color|bg|brand|border|text/.test(n)) { colorCount++; colorCats.add(n.split("-")[0]); }
    }
    if (/dark|\.dark|data-theme/.test(c)) hasDark = true;
    if (/--cal-brand|--brand|customBrand|brandColor/.test(c)) hasTheming = true;
  }

  // Scan fonts
  const fontFamilies: string[] = [];
  for (const twConf of ["tailwind.config.ts", "tailwind.config.js"]) {
    const c = readFile(path.join(root, twConf), 100);
    const fonts = [...c.matchAll(/["']([A-Z][a-z]+(?: [A-Z][a-z]+)*)["']/g)];
    for (const f of fonts) fontFamilies.push(f[1]);
  }

  const design_system: LearnedDesignSystem = {
    css_framework: cssFramework,
    component_library: compLib,
    icon_library: iconLib,
    color_system: { token_count: colorCount, categories: [...colorCats], has_dark_mode: hasDark, has_custom_theming: hasTheming },
    typography: { font_families: [...new Set(fontFamilies)], scale: ["xs", "sm", "base", "lg", "xl", "2xl"], has_display_font: fontFamilies.length > 1 },
    spacing: { system: cssFramework === "Tailwind CSS" ? "tailwind" : "custom", base_unit: "4px" },
  };

  // ── User Flows ──
  const user_flows: LearnedUserFlow[] = [];
  const flowDefs: [string, string, string, string[]][] = [
    ["packages/features/onboarding", "User Onboarding", "onboarding", ["Profile setup", "Calendar connection", "Availability configuration", "First event type"]],
    ["apps/web/app/(use-page-wrapper)/onboarding/organization", "Organization Onboarding", "onboarding", ["Organization details", "Brand customization", "Team creation", "Member invitation"]],
    ["apps/web/app/auth", "Authentication", "auth", ["Login/Signup", "Email verification", "Two-factor auth", "SSO/SAML", "Password reset"]],
    ["apps/web/app/(booking-page-wrapper)", "Public Booking", "booking", ["View profile", "Select event type", "Pick time slot", "Enter details", "Confirm booking", "Success page"]],
    ["packages/features/workflows", "Workflow Builder", "automation", ["Select trigger", "Configure conditions", "Add actions", "Set timing", "Test and activate"]],
    ["packages/features/settings", "Settings Management", "settings", ["Account settings", "Security settings", "Calendar connections", "Appearance", "Developer tools", "Billing"]],
    ["apps/web/app/(use-page-wrapper)/apps", "App Installation", "integrations", ["Browse app store", "View app details", "OAuth authorization", "Configuration", "Activation"]],
  ];

  for (const [dir, name, section, steps] of flowDefs) {
    if (exists(path.join(root, dir))) {
      user_flows.push({
        name, section, step_count: steps.length, entry_point: `/${section}`,
        steps: steps.map((s, i) => ({ order: i + 1, name: s, description: s, route: "", requires_input: true, can_skip: i > 0 })),
      });
    }
  }

  // ── Form Patterns ──
  const form_patterns: LearnedFormPattern[] = [];
  const formDirs = ["packages/ui/form", "packages/ui/components/form", "packages/features/form-builder"];
  for (const fd of formDirs) {
    const full = path.join(root, fd);
    if (!exists(full)) continue;
    const comps = findFiles(full, /\.tsx$/, 2).map(f => path.basename(f, ".tsx")).filter(n => !n.startsWith("_") && n !== "index");
    if (comps.length > 0) {
      form_patterns.push({
        name: `Form system (${path.basename(fd)})`,
        validation_library: has(deps, "zod") ? "zod" : has(deps, "yup") ? "yup" : "unknown",
        form_library: has(deps, "react-hook-form") ? "react-hook-form" : has(deps, "formik") ? "formik" : "unknown",
        components: comps,
        has_multi_step: comps.some(c => /wizard|step|multi/i.test(c)),
        has_file_upload: comps.some(c => /upload|file|drop/i.test(c)),
      });
    }
  }

  // ── State Patterns ──
  const state_patterns: LearnedStatePattern[] = [];
  const stateSearch: [RegExp, "loading" | "empty" | "error" | "success" | "notification", string, "page" | "section" | "component" | "global"][] = [
    [/[Ss]keleton/, "loading", "Loading placeholder with animation", "component"],
    [/[Ss]pinner/, "loading", "Spinner indicator", "component"],
    [/[Pp]rogress/, "loading", "Progress bar indicator", "section"],
    [/[Ee]mpty[Ss]creen|[Ee]mpty[Ss]tate/, "empty", "Empty state with message and action", "page"],
    [/[Ee]rror[Bb]oundary/, "error", "React error boundary with fallback UI", "page"],
    [/[Tt]oast|[Ss]onner/, "notification", "Toast notification popup", "global"],
    [/[Bb]anner/, "notification", "Top banner notification", "global"],
    [/[Aa]lert/, "notification", "Alert box with severity levels", "section"],
  ];

  for (const uiDir of ["packages/ui", "packages/coss-ui"]) {
    const full = path.join(root, uiDir);
    if (!exists(full)) continue;
    for (const fp of findFiles(full, /\.tsx$/, 3)) {
      const name = path.basename(fp, ".tsx");
      for (const [re, type, desc, scope] of stateSearch) {
        if (re.test(name) && !state_patterns.some(s => s.component === name)) {
          state_patterns.push({ type, component: name, description: desc, scope });
          break;
        }
      }
    }
  }

  return { design_system, components, pages, navigation, user_flows, form_patterns, state_patterns };
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 12: Auth Patterns
// ═══════════════════════════════════════════════════════════════════════

function scanAuthPatterns(root: string, deps: string[]): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  if (has(deps, "next-auth", "@auth/core")) {
    patterns.push({ name: "NextAuth Session Pattern", type: "auth", description: "Session-based auth with provider support (Google, GitHub, email, SAML)", evidence: "next-auth in dependencies", applicable_to: ["all"], key_files: [] });
  }
  if (has(deps, "@clerk")) {
    patterns.push({ name: "Clerk Auth Pattern", type: "auth", description: "Managed auth with user management, organizations, and RBAC", evidence: "@clerk in dependencies", applicable_to: ["all"], key_files: [] });
  }
  if (has(deps, "passport")) {
    patterns.push({ name: "Passport.js Auth Pattern", type: "auth", description: "Strategy-based authentication middleware", evidence: "passport in dependencies", applicable_to: ["all"], key_files: [] });
  }

  // Check for RBAC/permissions
  const permFiles = findFiles(root, /permission|rbac|role/i, 4);
  if (permFiles.length > 0) {
    patterns.push({ name: "Role-Based Access Control", type: "auth", description: "RBAC with roles, permissions, and resource-level access control", evidence: `Found ${permFiles.length} permission/role files`, applicable_to: ["all"], key_files: permFiles.slice(0, 5).map(f => path.relative(root, f)) });
  }

  // Check for 2FA
  const twoFaFiles = findFiles(root, /two.?factor|2fa|totp|otp/i, 4);
  if (twoFaFiles.length > 0) {
    patterns.push({ name: "Two-Factor Authentication", type: "auth", description: "2FA with TOTP, backup codes, and recovery flow", evidence: `Found ${twoFaFiles.length} 2FA files`, applicable_to: ["all"], key_files: twoFaFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  // Check for SSO/SAML
  const ssoFiles = findFiles(root, /sso|saml|oidc/i, 4);
  if (ssoFiles.length > 0) {
    patterns.push({ name: "SSO/SAML Integration", type: "auth", description: "Enterprise SSO with SAML 2.0 and OIDC support", evidence: `Found ${ssoFiles.length} SSO files`, applicable_to: ["customer_portal", "internal_ops_tool"], key_files: ssoFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 13: Testing Patterns
// ═══════════════════════════════════════════════════════════════════════

function scanTestingPatterns(root: string, deps: string[]): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  const unitTests = findFiles(root, /\.(test|spec)\.(ts|tsx|js)$/, 4);
  const e2eTests = findFiles(root, /\.e2e\.(ts|js)$/, 4);
  const playwrightTests = findFiles(root, /\.pw\.(ts|js)$/, 4);

  if (unitTests.length > 0) {
    const framework = has(deps, "vitest") ? "Vitest" : has(deps, "jest") ? "Jest" : "unknown";
    patterns.push({ name: `Unit Testing (${framework})`, type: "testing", description: `${unitTests.length} unit test files using ${framework}`, evidence: `${unitTests.length} test files found`, applicable_to: ["all"], key_files: unitTests.slice(0, 5).map(f => path.relative(root, f)) });
  }

  if (e2eTests.length > 0 || playwrightTests.length > 0 || has(deps, "playwright", "@playwright")) {
    const total = e2eTests.length + playwrightTests.length;
    patterns.push({ name: "E2E Testing (Playwright)", type: "testing", description: `${total} E2E test files with browser automation`, evidence: "Playwright in dependencies", applicable_to: ["all"], key_files: [] });
  }

  if (has(deps, "cypress")) {
    patterns.push({ name: "E2E Testing (Cypress)", type: "testing", description: "Component and E2E testing with Cypress", evidence: "cypress in dependencies", applicable_to: ["all"], key_files: [] });
  }

  // Check for test utilities/fixtures
  const testUtilFiles = findFiles(root, /test.?util|test.?helper|fixture|factory/i, 3);
  if (testUtilFiles.length > 0) {
    patterns.push({ name: "Test Utilities & Fixtures", type: "testing", description: `${testUtilFiles.length} test utility/fixture files for reusable test setup`, evidence: `Found test utility files`, applicable_to: ["all"], key_files: testUtilFiles.slice(0, 5).map(f => path.relative(root, f)) });
  }

  // Check for mocking
  if (exists(path.join(root, "vitest-mocks")) || exists(path.join(root, "__mocks__"))) {
    patterns.push({ name: "Mock System", type: "testing", description: "Centralized mocking for external services and modules", evidence: "Mock directory found", applicable_to: ["all"], key_files: [] });
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 14: Error Handling
// ═══════════════════════════════════════════════════════════════════════

function scanErrorPatterns(root: string, deps: string[]): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  const errorBoundaryFiles = findFiles(root, /[Ee]rror[Bb]oundary/i, 4);
  if (errorBoundaryFiles.length > 0) {
    patterns.push({ name: "React Error Boundaries", type: "components", description: "Error boundary components that catch render errors with fallback UI", evidence: `${errorBoundaryFiles.length} error boundary files`, applicable_to: ["all"], key_files: errorBoundaryFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  if (has(deps, "@sentry")) {
    patterns.push({ name: "Sentry Error Tracking", type: "monitoring" as PatternType, description: "Automated error reporting and performance monitoring with Sentry", evidence: "@sentry in dependencies", applicable_to: ["all"], key_files: [] });
  }

  // Check for custom error classes
  const errorClassFiles = findFiles(root, /error\.ts$|errors\.ts$/i, 3);
  if (errorClassFiles.length > 0) {
    patterns.push({ name: "Custom Error Classes", type: "api", description: "Typed error classes for structured error handling", evidence: `${errorClassFiles.length} error definition files`, applicable_to: ["all"], key_files: errorClassFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 15: Deployment Config
// ═══════════════════════════════════════════════════════════════════════

function scanDeploymentPatterns(root: string): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  if (exists(path.join(root, "Dockerfile")) || exists(path.join(root, "docker-compose.yml"))) {
    patterns.push({ name: "Docker Containerization", type: "deployment", description: "Docker with Dockerfile and/or docker-compose for local and production", evidence: "Dockerfile found", applicable_to: ["all"], key_files: ["Dockerfile", "docker-compose.yml"].filter(f => exists(path.join(root, f))) });
  }

  const ciDirs = [".github/workflows", ".circleci", ".gitlab-ci.yml"];
  for (const ci of ciDirs) {
    if (exists(path.join(root, ci))) {
      const name = ci.includes("github") ? "GitHub Actions CI/CD" : ci.includes("circle") ? "CircleCI" : "GitLab CI";
      const files = ci.includes("github") ? findFiles(path.join(root, ci), /\.ya?ml$/, 1) : [ci];
      patterns.push({ name, type: "deployment", description: `Automated CI/CD pipeline with ${name}`, evidence: `${ci} found`, applicable_to: ["all"], key_files: files.map(f => path.relative(root, f)) });
    }
  }

  if (exists(path.join(root, "vercel.json")) || exists(path.join(root, ".vercel"))) {
    patterns.push({ name: "Vercel Deployment", type: "deployment", description: "Vercel platform deployment with serverless functions", evidence: "vercel.json found", applicable_to: ["all"], key_files: ["vercel.json"] });
  }

  // Env var management
  const envFiles = findFiles(root, /\.env\.example$|\.env\.sample$/i, 1);
  if (envFiles.length > 0) {
    const content = readFile(envFiles[0], 100);
    const varCount = content.split("\n").filter(l => l.includes("=") && !l.startsWith("#")).length;
    patterns.push({ name: "Environment Variable Config", type: "deployment", description: `${varCount} environment variables for runtime configuration`, evidence: `.env.example with ${varCount} vars`, applicable_to: ["all"], key_files: envFiles.map(f => path.relative(root, f)) });
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
// Layer 16: Security Patterns
// ═══════════════════════════════════════════════════════════════════════

function scanSecurityPatterns(root: string, deps: string[]): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];

  if (has(deps, "helmet")) {
    patterns.push({ name: "Helmet Security Headers", type: "api", description: "HTTP security headers (CSP, HSTS, X-Frame-Options) via Helmet", evidence: "helmet in dependencies", applicable_to: ["all"], key_files: [] });
  }

  // Rate limiting
  const rateLimitFiles = findFiles(root, /rate.?limit/i, 4);
  if (rateLimitFiles.length > 0 || has(deps, "express-rate-limit", "@upstash/ratelimit")) {
    patterns.push({ name: "Rate Limiting", type: "api", description: "API rate limiting to prevent abuse", evidence: "Rate limit implementation found", applicable_to: ["all"], key_files: rateLimitFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  // Input validation
  if (has(deps, "zod")) {
    patterns.push({ name: "Zod Runtime Validation", type: "validation", description: "Runtime type validation on API inputs using Zod schemas", evidence: "zod in dependencies", applicable_to: ["all"], key_files: [] });
  }

  // CSRF protection
  const csrfFiles = findFiles(root, /csrf/i, 3);
  if (csrfFiles.length > 0 || has(deps, "csrf", "csurf")) {
    patterns.push({ name: "CSRF Protection", type: "api", description: "Cross-site request forgery protection", evidence: "CSRF implementation found", applicable_to: ["all"], key_files: [] });
  }

  // Content Security Policy
  const cspFiles = findFiles(root, /csp|content.?security/i, 3);
  if (cspFiles.length > 0) {
    patterns.push({ name: "Content Security Policy", type: "api", description: "CSP headers to prevent XSS and injection attacks", evidence: `${cspFiles.length} CSP files found`, applicable_to: ["all"], key_files: cspFiles.slice(0, 3).map(f => path.relative(root, f)) });
  }

  return patterns;
}

// ═══════════════════════════════════════════════════════════════════════
// Assemble — all layers into LearnedApp
// ═══════════════════════════════════════════════════════════════════════

function classifyApp(features: LearnedFeature[]): string {
  const names = features.map(f => f.name.toLowerCase()).join(" ");
  if (/booking|scheduling|calendar|availability/.test(names)) return "scheduling_platform";
  if (/payment.*wallet|wallet|fintech/.test(names)) return "fintech_wallet";
  if (/marketplace|seller|buyer|store/.test(names)) return "marketplace";
  if (/compliance|audit|case/.test(names)) return "compliance_case_management";
  if (/property|tenant|rental/.test(names)) return "property_management_system";
  if (/logistics|fleet|delivery/.test(names)) return "logistics_operations_system";
  if (/approval|workflow/.test(names)) return "workflow_approval_system";
  if (/dashboard|admin|ops/.test(names)) return "internal_ops_tool";
  if (/portal|customer|account/.test(names)) return "customer_portal";
  return "other";
}

export function analyzeApp(rootDir: string, sourceUrl = ""): LearnedApp {
  const rootPkg = readJson(path.join(rootDir, "package.json"));
  const name = rootPkg?.name || path.basename(rootDir);
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
  const archPatterns: LearnedPattern[] = [];
  if (tech_stack.monorepo) archPatterns.push({ name: "Monorepo Architecture", type: "architecture", description: `Monorepo using ${tech_stack.build_tool} with shared packages`, evidence: "workspaces in package.json", applicable_to: ["all"], key_files: ["package.json", "turbo.json"] });
  if (tech_stack.orm !== "unknown") archPatterns.push({ name: `${tech_stack.orm} ORM Pattern`, type: "data_access", description: `Type-safe database access via ${tech_stack.orm}`, evidence: `${tech_stack.orm} in dependencies`, applicable_to: ["all"], key_files: [] });
  if (has(deps, "trpc", "@trpc")) archPatterns.push({ name: "tRPC API Pattern", type: "api", description: "Type-safe API layer using tRPC with router/procedure model", evidence: "trpc in dependencies", applicable_to: ["all"], key_files: [] });
  if (has(deps, "redis", "ioredis", "@upstash")) archPatterns.push({ name: "Redis Caching", type: "caching", description: "Application caching and rate limiting with Redis", evidence: "Redis in dependencies", applicable_to: ["all"], key_files: [] });
  if (has(deps, "i18next", "react-intl", "next-intl")) archPatterns.push({ name: "Internationalization", type: "localization", description: "Multi-language support with translation system", evidence: "i18n library in dependencies", applicable_to: ["all"], key_files: [] });

  // App store / plugin pattern
  if (exists(path.join(rootDir, "packages/app-store"))) {
    archPatterns.push({ name: "App Store / Plugin Architecture", type: "extensibility", description: "Pluggable app/integration system with per-app packages", evidence: "packages/app-store directory", applicable_to: ["scheduling_platform", "marketplace", "customer_portal"], key_files: ["packages/app-store"] });
  }

  // Workflow pattern
  if (features.some(f => f.name.toLowerCase().includes("workflow"))) {
    archPatterns.push({ name: "Workflow Engine", type: "automation", description: "Multi-step workflow automation with triggers, conditions, and actions", evidence: "workflows feature detected", applicable_to: ["workflow_approval_system", "scheduling_platform", "internal_ops_tool"], key_files: [] });
  }

  // Embeddable pattern
  if (features.some(f => f.name.toLowerCase().includes("embed"))) {
    archPatterns.push({ name: "Embeddable Widget", type: "distribution", description: "Iframe/script embeddable widget for third-party sites", evidence: "embed feature detected", applicable_to: ["scheduling_platform", "customer_portal"], key_files: [] });
  }

  // Audit trail
  if (features.some(f => /audit|watchlist/.test(f.name.toLowerCase()))) {
    archPatterns.push({ name: "Audit Trail", type: "compliance", description: "Append-only audit logging with actor tracking", evidence: "audit feature detected", applicable_to: ["compliance_case_management", "fintech_wallet", "internal_ops_tool"], key_files: [] });
  }

  // Stripe
  if (has(deps, "stripe")) {
    archPatterns.push({ name: "Stripe Payment Integration", type: "payments", description: "Payment processing, subscriptions, and billing via Stripe", evidence: "stripe in dependencies", applicable_to: ["marketplace", "fintech_wallet", "scheduling_platform"], key_files: [] });
  }

  // Email templates
  if (exists(path.join(rootDir, "packages/emails"))) {
    archPatterns.push({ name: "Email Template System", type: "notifications", description: "Structured email templates with provider abstraction", evidence: "packages/emails directory", applicable_to: ["all"], key_files: ["packages/emails"] });
  }

  const patterns = [...archPatterns, ...authPatterns, ...testPatterns, ...errorPatterns, ...deployPatterns, ...securityPatterns];

  const app_class = classifyApp(features);
  const description = rootPkg?.description || `${app_class.replace(/_/g, " ")} built with ${tech_stack.framework}`;
  const totalFiles = countFiles(rootDir, [".ts", ".tsx", ".js", ".jsx"]);

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

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

async function writeToNeo4j(app: LearnedApp): Promise<{ written: number; failed: number }> {
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();
  if (!ok) { console.error("[learn-app] Cannot connect to Neo4j"); return { written: 0, failed: 0 }; }

  let written = 0, failed = 0;
  const w = async (cypher: string, label: string) => {
    try { await neo4j.runCypher(cypher); written++; } catch (e: any) { console.warn(`  ✗ ${label}: ${e.message}`); failed++; }
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
    a.learned_at = '${esc(app.learned_at)}'
RETURN a.source_id
  `.trim(), "App");

  // ── Features ──
  console.log(`[neo4j] Writing ${app.features.length} features...`);
  for (const f of app.features) {
    await w(`
MERGE (f:${L.feature} {feature_id: '${esc(f.feature_id)}', source: '${esc(sid)}'})
SET f.name = '${esc(f.name)}', f.description = '${esc(f.description)}',
    f.directory = '${esc(f.directory)}', f.complexity = '${f.complexity}',
    f.file_count = ${f.file_count}, f.has_tests = ${f.has_tests}, f.has_api = ${f.has_api}
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
    m.relations = '${esc(relSummary)}'
WITH m
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_data_model}]->(m)
RETURN m.name
    `.trim(), `Model [${dm.name}]`);
  }

  // ── Integrations ──
  console.log(`[neo4j] Writing ${app.integrations.length} integrations...`);
  for (const i of app.integrations) {
    await w(`
MERGE (i:${L.integration} {name: '${esc(i.name)}', source: '${esc(sid)}'})
SET i.type = '${esc(i.type)}', i.provider = '${esc(i.provider)}',
    i.category = '${esc(i.category)}', i.auth_method = '${esc(i.auth_method)}'
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
    d.has_search = ${d.has_search}, d.has_batch = ${d.has_batch}
WITH d
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_api_domain}]->(d)
RETURN d.name
    `.trim(), `API [${d.name}]`);
  }

  // ── UI Components ──
  console.log(`[neo4j] Writing ${app.ui.components.categories.length} component groups...`);
  for (const cat of app.ui.components.categories) {
    await w(`
MERGE (c:${L.component_group} {name: '${esc(cat.name)}', source: '${esc(sid)}'})
SET c.count = ${cat.count}, c.key_components = '${esc(cat.key_components.join(", "))}'
WITH c
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_components}]->(c)
RETURN c.name
    `.trim(), `Components [${cat.name}]`);
  }

  // ── Pages ──
  console.log(`[neo4j] Writing ${app.ui.pages.sections.length} page sections...`);
  for (const s of app.ui.pages.sections) {
    await w(`
MERGE (p:${L.page_section} {name: '${esc(s.name)}', source: '${esc(sid)}'})
SET p.page_count = ${s.page_count}, p.is_public = ${s.is_public},
    p.requires_auth = ${s.requires_auth},
    p.key_routes = '${esc(s.key_routes.join(", "))}'
WITH p
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_pages}]->(p)
RETURN p.name
    `.trim(), `Pages [${s.name}]`);
  }

  // ── Design System ──
  console.log("[neo4j] Writing design system...");
  const ds = app.ui.design_system;
  await w(`
MERGE (d:${L.design_system} {source: '${esc(sid)}'})
SET d.css_framework = '${esc(ds.css_framework)}', d.component_library = '${esc(ds.component_library)}',
    d.icon_library = '${esc(ds.icon_library)}', d.color_token_count = ${ds.color_system.token_count},
    d.has_dark_mode = ${ds.color_system.has_dark_mode}, d.has_custom_theming = ${ds.color_system.has_custom_theming},
    d.font_families = '${esc(ds.typography.font_families.join(", "))}',
    d.has_display_font = ${ds.typography.has_display_font},
    d.spacing_system = '${esc(ds.spacing.system)}'
WITH d
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_design_system}]->(d)
RETURN d.source
  `.trim(), "Design System");

  // ── User Flows ──
  console.log(`[neo4j] Writing ${app.ui.user_flows.length} user flows...`);
  for (const f of app.ui.user_flows) {
    const steps = f.steps.map(s => s.name).join(" → ");
    await w(`
MERGE (uf:${L.user_flow} {name: '${esc(f.name)}', source: '${esc(sid)}'})
SET uf.section = '${esc(f.section)}', uf.step_count = ${f.step_count},
    uf.steps = '${esc(steps)}', uf.entry_point = '${esc(f.entry_point)}'
WITH uf
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_user_flow}]->(uf)
RETURN uf.name
    `.trim(), `Flow [${f.name}]`);
  }

  // ── Form Patterns ──
  console.log(`[neo4j] Writing ${app.ui.form_patterns.length} form patterns...`);
  for (const fp of app.ui.form_patterns) {
    await w(`
MERGE (f:${L.form_pattern} {name: '${esc(fp.name)}', source: '${esc(sid)}'})
SET f.validation_library = '${esc(fp.validation_library)}', f.form_library = '${esc(fp.form_library)}',
    f.components = '${esc(fp.components.join(", "))}',
    f.has_multi_step = ${fp.has_multi_step}, f.has_file_upload = ${fp.has_file_upload}
WITH f
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_form_pattern}]->(f)
RETURN f.name
    `.trim(), `Form [${fp.name}]`);
  }

  // ── State Patterns ──
  console.log(`[neo4j] Writing ${app.ui.state_patterns.length} state patterns...`);
  for (const sp of app.ui.state_patterns) {
    await w(`
MERGE (s:${L.state_pattern} {component: '${esc(sp.component)}', source: '${esc(sid)}'})
SET s.type = '${esc(sp.type)}', s.description = '${esc(sp.description)}', s.scope = '${esc(sp.scope)}'
WITH s
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_state_pattern}]->(s)
RETURN s.component
    `.trim(), `State [${sp.component}]`);
  }

  // ── Patterns ──
  console.log(`[neo4j] Writing ${app.patterns.length} patterns...`);
  for (const p of app.patterns) {
    const keyFiles = p.key_files.slice(0, 5).join(", ");
    const applicableTo = p.applicable_to.join(", ");
    await w(`
MERGE (p:${L.pattern} {name: '${esc(p.name)}'})
SET p.type = '${esc(p.type)}', p.description = '${esc(p.description)}',
    p.evidence = '${esc(p.evidence)}', p.applicable_to = '${esc(applicableTo)}',
    p.key_files = '${esc(keyFiles)}'
WITH p
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
MERGE (a)-[:${R.has_pattern}]->(p)
SET p.seen_count = COALESCE(p.seen_count, 0) + 1
RETURN p.name
    `.trim(), `Pattern [${p.name}]`);
  }

  // ── Navigation ──
  console.log("[neo4j] Writing navigation...");
  const nav = app.ui.navigation;
  await w(`
MATCH (a:${L.app} {source_id: '${esc(sid)}'})
SET a.nav_style = '${esc(nav.style)}',
    a.has_command_palette = ${nav.has_command_palette},
    a.has_mobile_nav = ${nav.has_mobile_nav},
    a.has_breadcrumbs = ${nav.has_breadcrumbs},
    a.nav_item_count = ${nav.items.length}
RETURN a.source_id
  `.trim(), "Navigation");

  return { written, failed };
}

// ═══════════════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const targetDir = args.find(a => !a.startsWith("--"));
  const sourceUrl = args.find(a => a.startsWith("--source-url="))?.split("=")[1] || "";

  if (!targetDir) {
    console.error("Usage: npx tsx src/tools/learn-app.ts <path-to-codebase> [--source-url=https://...]");
    process.exit(1);
  }

  const resolved = path.resolve(targetDir);
  if (!exists(resolved)) { console.error(`Not found: ${resolved}`); process.exit(1); }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AES App Learner — All 16 Layers");
  console.log("═══════════════════════════════════════════════════════════");

  const app = analyzeApp(resolved, sourceUrl);

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

  console.log("\n  PATTERNS:");
  for (const p of app.patterns) {
    console.log(`    [${p.type}] ${p.name}`);
  }

  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  WRITING TO NEO4J (typed nodes)");
  console.log("───────────────────────────────────────────────────────────");

  const { written, failed } = await writeToNeo4j(app);

  console.log(`\n  Neo4j: ${written} nodes written, ${failed} failed`);
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AES has learned all 16 layers from this codebase.");
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch(err => { console.error("[learn-app] Fatal:", err); process.exit(1); });
