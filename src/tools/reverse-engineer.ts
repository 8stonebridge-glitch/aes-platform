/**
 * Reverse Engineer — analyzes an existing codebase and writes learned
 * knowledge into Neo4j so AES can reuse it in future builds.
 *
 * Flow:
 *   1. Scan directory structure, package.json files, config files
 *   2. Extract: app metadata, features, data models, integrations, API routes, patterns
 *   3. Write everything to Neo4j as versioned entities
 *   4. Next pipeline run: graph-reader picks up this knowledge automatically
 *
 * Usage:
 *   npx tsx src/tools/reverse-engineer.ts /path/to/codebase
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getNeo4jService } from "../services/neo4j-service.js";
import {
  cypherCreateEntity,
  type EntityNode,
  type VersionNode,
} from "../graph/versioned-truth.js";

// ─── Types ──────────────────────────────────────────────────────────

interface AppAnalysis {
  name: string;
  description: string;
  appClass: string;
  techStack: TechStack;
  features: FeatureAnalysis[];
  dataModels: DataModel[];
  integrations: Integration[];
  apiRoutes: ApiRoute[];
  patterns: Pattern[];
  fileStructure: string[];
  packageCount: number;
  totalFiles: number;
}

interface TechStack {
  framework: string;
  language: string;
  runtime: string;
  database: string;
  orm: string;
  styling: string;
  testing: string;
  buildTool: string;
  monorepo: boolean;
  packages: string[];
}

interface FeatureAnalysis {
  id: string;
  name: string;
  description: string;
  directory: string;
  fileCount: number;
  dependencies: string[];
  hasTests: boolean;
  hasApi: boolean;
  complexity: "simple" | "moderate" | "complex";
}

interface DataModel {
  name: string;
  fields: string[];
  relations: string[];
  category: string;
}

interface Integration {
  name: string;
  type: string;
  provider: string;
  category: string;
}

interface ApiRoute {
  path: string;
  methods: string[];
  domain: string;
}

interface Pattern {
  name: string;
  type: string;
  description: string;
  evidence: string;
}

// ─── Scanner ────────────────────────────────────────────────────────

function scanDirectory(dir: string, maxDepth = 4, currentDepth = 0): string[] {
  if (currentDepth >= maxDepth) return [];
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(dir, fullPath);

      if (entry.isDirectory()) {
        results.push(relPath + "/");
        results.push(...scanDirectory(fullPath, maxDepth, currentDepth + 1).map((p) => path.join(relPath, p)));
      } else {
        results.push(relPath);
      }
    }
  } catch {
    // Skip permission errors
  }

  return results;
}

function readJsonSafe(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function readFileSafe(filePath: string, maxLines = 500): string {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content.split("\n").slice(0, maxLines).join("\n");
  } catch {
    return "";
  }
}

function countFiles(dir: string, extensions: string[] = []): number {
  let count = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += countFiles(fullPath, extensions);
      } else if (extensions.length === 0 || extensions.some((ext) => entry.name.endsWith(ext))) {
        count++;
      }
    }
  } catch {
    // Skip
  }
  return count;
}

// ─── Analyzers ──────────────────────────────────────────────────────

function analyzeTechStack(rootDir: string, rootPkg: any): TechStack {
  const allDeps = {
    ...(rootPkg?.dependencies || {}),
    ...(rootPkg?.devDependencies || {}),
  };
  const depNames = Object.keys(allDeps);

  // Check for nested package.json files
  const nestedPkgs: string[] = [];
  try {
    const findPkgs = (dir: string, depth = 0) => {
      if (depth > 3) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          const pkgPath = path.join(full, "package.json");
          if (fs.existsSync(pkgPath)) {
            const pkg = readJsonSafe(pkgPath);
            if (pkg?.dependencies) {
              nestedPkgs.push(...Object.keys(pkg.dependencies));
            }
          }
          findPkgs(full, depth + 1);
        }
      }
    };
    findPkgs(rootDir);
  } catch {
    // Skip
  }

  const allDepNames = [...new Set([...depNames, ...nestedPkgs])];

  const detect = (candidates: [string, string][]): string => {
    for (const [dep, label] of candidates) {
      if (allDepNames.some((d) => d.includes(dep))) return label;
    }
    return "unknown";
  };

  return {
    framework: detect([
      ["next", "Next.js"],
      ["nuxt", "Nuxt"],
      ["remix", "Remix"],
      ["svelte", "SvelteKit"],
      ["gatsby", "Gatsby"],
      ["express", "Express"],
      ["fastify", "Fastify"],
      ["nestjs", "NestJS"],
      ["@nestjs", "NestJS"],
    ]),
    language: fs.existsSync(path.join(rootDir, "tsconfig.json")) ? "TypeScript" : "JavaScript",
    runtime: "Node.js",
    database: detect([
      ["prisma", "PostgreSQL (Prisma)"],
      ["@prisma", "PostgreSQL (Prisma)"],
      ["mongoose", "MongoDB"],
      ["typeorm", "SQL (TypeORM)"],
      ["drizzle", "SQL (Drizzle)"],
      ["convex", "Convex"],
      ["supabase", "Supabase/PostgreSQL"],
      ["firebase", "Firebase"],
    ]),
    orm: detect([
      ["prisma", "Prisma"],
      ["@prisma", "Prisma"],
      ["typeorm", "TypeORM"],
      ["drizzle", "Drizzle"],
      ["mongoose", "Mongoose"],
      ["kysely", "Kysely"],
      ["sequelize", "Sequelize"],
    ]),
    styling: detect([
      ["tailwindcss", "Tailwind CSS"],
      ["styled-components", "Styled Components"],
      ["@emotion", "Emotion"],
      ["sass", "SASS/SCSS"],
    ]),
    testing: detect([
      ["vitest", "Vitest"],
      ["jest", "Jest"],
      ["playwright", "Playwright"],
      ["cypress", "Cypress"],
      ["mocha", "Mocha"],
    ]),
    buildTool: detect([
      ["turbo", "Turborepo"],
      ["nx", "Nx"],
      ["lerna", "Lerna"],
      ["vite", "Vite"],
      ["webpack", "Webpack"],
      ["esbuild", "esbuild"],
    ]),
    monorepo: !!(rootPkg?.workspaces) || fs.existsSync(path.join(rootDir, "turbo.json")) || fs.existsSync(path.join(rootDir, "nx.json")),
    packages: allDepNames.slice(0, 100), // Cap at 100
  };
}

function analyzeFeatures(rootDir: string): FeatureAnalysis[] {
  const features: FeatureAnalysis[] = [];

  // Look for features in common locations
  const featureDirs = [
    "packages/features",
    "src/features",
    "src/modules",
    "apps",
    "packages",
    "modules",
    "src/app",
    "src/pages",
  ];

  for (const featureDir of featureDirs) {
    const fullDir = path.join(rootDir, featureDir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue;

        const featPath = path.join(fullDir, entry.name);
        const fileCount = countFiles(featPath, [".ts", ".tsx", ".js", ".jsx"]);
        if (fileCount === 0) continue;

        const pkgJson = readJsonSafe(path.join(featPath, "package.json"));
        const hasTests = fs.existsSync(path.join(featPath, "__tests__")) ||
          fs.existsSync(path.join(featPath, "tests")) ||
          countFiles(featPath, [".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx"]) > 0;
        const hasApi = countFiles(featPath, [".handler.ts", ".controller.ts", ".router.ts", ".route.ts"]) > 0 ||
          fs.existsSync(path.join(featPath, "api"));

        const deps = pkgJson?.dependencies ? Object.keys(pkgJson.dependencies) : [];

        let complexity: "simple" | "moderate" | "complex" = "simple";
        if (fileCount > 50) complexity = "complex";
        else if (fileCount > 15) complexity = "moderate";

        const featureId = `feat-${entry.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();

        features.push({
          id: featureId,
          name: entry.name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          description: pkgJson?.description || inferFeatureDescription(entry.name),
          directory: path.relative(rootDir, featPath),
          fileCount,
          dependencies: deps,
          hasTests,
          hasApi,
          complexity,
        });
      }
    } catch {
      // Skip
    }
  }

  return features;
}

function inferFeatureDescription(name: string): string {
  const descriptions: Record<string, string> = {
    auth: "Authentication and authorization",
    bookings: "Booking management and scheduling",
    availability: "Availability configuration and checking",
    calendars: "Calendar integration and sync",
    payments: "Payment processing and billing",
    webhooks: "Webhook subscription and delivery",
    workflows: "Workflow automation and triggers",
    notifications: "Notification delivery (email, SMS, push)",
    onboarding: "User onboarding flow",
    settings: "User and system settings",
    organizations: "Organization/team management",
    insights: "Analytics and reporting dashboards",
    embed: "Embeddable widget/iframe support",
    "routing-forms": "Form-based routing logic",
    users: "User profile and account management",
    teams: "Team creation and member management",
    schedules: "Schedule definition and management",
    eventtypes: "Event type configuration",
    credentials: "Credential/OAuth token management",
    apps: "Third-party app/integration management",
    slots: "Time slot calculation and display",
    "form-builder": "Dynamic form construction",
    profile: "User profile management",
    membership: "Team membership and roles",
    conferencing: "Video conferencing integration",
    credits: "Credit/token balance management",
    deployment: "Deployment configuration",
    flags: "Feature flag management",
    emails: "Email template and delivery",
    sms: "SMS notification service",
    "embed-scheduling": "Embeddable scheduling widget",
  };

  const lower = name.toLowerCase().replace(/[-_]/g, "");
  for (const [key, desc] of Object.entries(descriptions)) {
    if (lower.includes(key.replace(/[-_]/g, ""))) return desc;
  }

  return `${name.replace(/[-_]/g, " ")} feature module`;
}

function analyzePrismaModels(rootDir: string): DataModel[] {
  const models: DataModel[] = [];

  // Find schema.prisma
  const schemaPaths = [
    "packages/prisma/schema.prisma",
    "prisma/schema.prisma",
    "src/prisma/schema.prisma",
    "schema.prisma",
  ];

  let schemaContent = "";
  for (const sp of schemaPaths) {
    const full = path.join(rootDir, sp);
    if (fs.existsSync(full)) {
      schemaContent = fs.readFileSync(full, "utf-8");
      break;
    }
  }

  if (!schemaContent) return models;

  // Parse models
  const modelRegex = /model\s+(\w+)\s*\{([^}]+)\}/g;
  let match;
  while ((match = modelRegex.exec(schemaContent)) !== null) {
    const name = match[1];
    const body = match[2];

    const fields: string[] = [];
    const relations: string[] = [];

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("@@")) continue;

      const fieldMatch = trimmed.match(/^(\w+)\s+(\w+)(\?|\[\])?/);
      if (fieldMatch) {
        const [, fieldName, fieldType] = fieldMatch;
        fields.push(`${fieldName}: ${fieldType}`);

        // Detect relations
        if (trimmed.includes("@relation")) {
          relations.push(fieldType);
        }
      }
    }

    const category = categorizeModel(name);

    models.push({ name, fields, relations, category });
  }

  return models;
}

function categorizeModel(name: string): string {
  const lower = name.toLowerCase();
  const categories: [string[], string][] = [
    [["user", "account", "session", "password", "profile", "membership", "role"], "auth_identity"],
    [["booking", "attendee", "seat", "schedule", "availability", "slot"], "scheduling"],
    [["payment", "billing", "credit", "proration", "subscription"], "payments"],
    [["workflow", "step", "reminder", "trigger"], "automation"],
    [["webhook", "apikey", "ratelimit"], "integration"],
    [["team", "organization", "domain"], "organization"],
    [["calendar", "event"], "calendar"],
    [["routing", "form", "response"], "routing"],
    [["audit", "report", "watchlist"], "audit"],
    [["feature", "flag", "deployment"], "infrastructure"],
    [["credential", "oauth", "token", "accesscode"], "auth_oauth"],
    [["notification", "email", "sms"], "notifications"],
  ];

  for (const [keywords, cat] of categories) {
    if (keywords.some((kw) => lower.includes(kw))) return cat;
  }
  return "general";
}

function analyzeIntegrations(rootDir: string): Integration[] {
  const integrations: Integration[] = [];

  // Check app-store style directories
  const appStoreDirs = [
    "packages/app-store",
    "src/integrations",
    "packages/integrations",
    "apps/integrations",
  ];

  for (const appDir of appStoreDirs) {
    const fullDir = path.join(rootDir, appDir);
    if (!fs.existsSync(fullDir)) continue;

    try {
      const entries = fs.readdirSync(fullDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name.startsWith("_")) continue;

        const appPath = path.join(fullDir, entry.name);
        const configPath = path.join(appPath, "_metadata.ts");
        const pkgPath = path.join(appPath, "package.json");

        let type = "unknown";
        let category = categorizeIntegration(entry.name);

        // Try to read config for more info
        const config = readFileSafe(configPath, 50);
        if (config.includes("video") || config.includes("conferencing")) type = "video_conferencing";
        else if (config.includes("calendar")) type = "calendar";
        else if (config.includes("payment")) type = "payment";
        else if (config.includes("crm") || config.includes("CRM")) type = "crm";
        else if (config.includes("messaging")) type = "messaging";
        else if (config.includes("analytics")) type = "analytics";
        else if (config.includes("automation")) type = "automation";
        else type = category;

        integrations.push({
          name: entry.name,
          type,
          provider: entry.name.replace(/[-_]/g, " "),
          category,
        });
      }
    } catch {
      // Skip
    }
  }

  // Also check package.json for integration-like dependencies
  const rootPkg = readJsonSafe(path.join(rootDir, "package.json"));
  const allDeps = Object.keys({
    ...(rootPkg?.dependencies || {}),
    ...(rootPkg?.devDependencies || {}),
  });

  const integrationDeps: [string, string, string][] = [
    ["stripe", "payment", "Stripe"],
    ["@stripe", "payment", "Stripe"],
    ["paypal", "payment", "PayPal"],
    ["@sendgrid", "email", "SendGrid"],
    ["nodemailer", "email", "Nodemailer"],
    ["resend", "email", "Resend"],
    ["twilio", "sms", "Twilio"],
    ["@slack", "messaging", "Slack"],
    ["aws-sdk", "cloud", "AWS"],
    ["@aws-sdk", "cloud", "AWS"],
    ["@google-cloud", "cloud", "Google Cloud"],
    ["firebase", "backend", "Firebase"],
    ["@supabase", "backend", "Supabase"],
    ["@clerk", "auth", "Clerk"],
    ["@auth0", "auth", "Auth0"],
    ["next-auth", "auth", "NextAuth"],
    ["@sentry", "monitoring", "Sentry"],
    ["posthog", "analytics", "PostHog"],
  ];

  for (const [dep, type, provider] of integrationDeps) {
    if (allDeps.some((d) => d.startsWith(dep)) && !integrations.some((i) => i.provider.toLowerCase() === provider.toLowerCase())) {
      integrations.push({ name: dep, type, provider, category: type });
    }
  }

  return integrations;
}

function categorizeIntegration(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("video") || lower.includes("zoom") || lower.includes("meet") || lower.includes("teams") || lower.includes("jitsi") || lower.includes("daily")) return "video_conferencing";
  if (lower.includes("calendar") || lower.includes("ical") || lower.includes("caldav")) return "calendar";
  if (lower.includes("payment") || lower.includes("stripe") || lower.includes("paypal") || lower.includes("btcpay")) return "payment";
  if (lower.includes("crm") || lower.includes("hubspot") || lower.includes("salesforce") || lower.includes("pipedrive")) return "crm";
  if (lower.includes("analytics") || lower.includes("ga4") || lower.includes("posthog") || lower.includes("plausible")) return "analytics";
  if (lower.includes("zapier") || lower.includes("make") || lower.includes("n8n")) return "automation";
  if (lower.includes("slack") || lower.includes("discord") || lower.includes("telegram") || lower.includes("whatsapp")) return "messaging";
  if (lower.includes("email") || lower.includes("sendgrid") || lower.includes("resend")) return "email";
  return "other";
}

function analyzeApiRoutes(rootDir: string): ApiRoute[] {
  const routes: ApiRoute[] = [];

  // Next.js API routes (pages/api or app/api)
  const apiDirs = [
    "apps/web/pages/api",
    "apps/web/app/api",
    "apps/api/v1/pages/api",
    "apps/api/v2/src/modules",
    "src/pages/api",
    "src/app/api",
    "pages/api",
    "app/api",
  ];

  for (const apiDir of apiDirs) {
    const fullDir = path.join(rootDir, apiDir);
    if (!fs.existsSync(fullDir)) continue;

    const scanRoutes = (dir: string, prefix: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
          const full = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            scanRoutes(full, `${prefix}/${entry.name}`);
          } else if (entry.name.match(/\.(ts|js|tsx|jsx)$/) && !entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
            const routePath = `${prefix}/${entry.name.replace(/\.(ts|js|tsx|jsx)$/, "").replace(/^index$/, "")}`;
            const content = readFileSafe(full, 30);
            const methods: string[] = [];
            if (content.includes("GET") || content.includes("get")) methods.push("GET");
            if (content.includes("POST") || content.includes("post") || content.includes("create") || content.includes("Create")) methods.push("POST");
            if (content.includes("PUT") || content.includes("put") || content.includes("PATCH") || content.includes("patch") || content.includes("update") || content.includes("Update")) methods.push("PUT");
            if (content.includes("DELETE") || content.includes("delete") || content.includes("remove") || content.includes("Remove")) methods.push("DELETE");
            if (methods.length === 0) methods.push("GET"); // default

            const domain = prefix.split("/").filter(Boolean)[0] || "root";
            routes.push({ path: routePath.replace(/\/+/g, "/"), methods, domain });
          }
        }
      } catch {
        // Skip
      }
    };

    scanRoutes(fullDir, "/api");
  }

  // tRPC routers
  const trpcDirs = [
    "packages/trpc/server/routers",
    "src/server/routers",
    "src/trpc/routers",
  ];

  for (const trpcDir of trpcDirs) {
    const fullDir = path.join(rootDir, trpcDir);
    if (!fs.existsSync(fullDir)) continue;

    const scanTrpc = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
          const full = path.join(dir, entry.name);

          if (entry.isDirectory()) {
            routes.push({
              path: `trpc/${entry.name}`,
              methods: ["QUERY", "MUTATION"],
              domain: entry.name,
            });
            scanTrpc(full);
          }
        }
      } catch {
        // Skip
      }
    };

    scanTrpc(fullDir);
  }

  return routes;
}

function analyzePatterns(rootDir: string, techStack: TechStack, features: FeatureAnalysis[]): Pattern[] {
  const patterns: Pattern[] = [];

  // Architecture patterns
  if (techStack.monorepo) {
    patterns.push({
      name: "Monorepo Architecture",
      type: "architecture",
      description: `Monorepo using ${techStack.buildTool} with shared packages`,
      evidence: "workspaces config in package.json",
    });
  }

  if (techStack.orm === "Prisma") {
    patterns.push({
      name: "Prisma ORM Pattern",
      type: "data_access",
      description: "Type-safe database access via Prisma with generated client",
      evidence: "schema.prisma found",
    });
  }

  // Check for specific patterns
  const patternChecks: [string[], string, string, string][] = [
    [["trpc", "@trpc"], "tRPC API Pattern", "api", "Type-safe API layer using tRPC with router/procedure model"],
    [["next-auth", "@auth"], "NextAuth Pattern", "auth", "Authentication via NextAuth.js with provider support"],
    [["@clerk"], "Clerk Auth Pattern", "auth", "Authentication and user management via Clerk"],
    [["zod"], "Zod Validation Pattern", "validation", "Runtime type validation using Zod schemas"],
    [["react-hook-form", "@hookform"], "React Hook Form Pattern", "forms", "Performant form handling with React Hook Form"],
    [["@tanstack/react-query"], "React Query Pattern", "data_fetching", "Server state management with React Query"],
    [["tailwindcss"], "Tailwind CSS Pattern", "styling", "Utility-first CSS with Tailwind"],
    [["@radix-ui", "shadcn"], "Radix/Shadcn UI Pattern", "components", "Accessible component primitives with Radix UI"],
    [["i18next", "@calcom/i18n"], "i18n Pattern", "localization", "Internationalization with translation keys"],
    [["stripe"], "Stripe Integration Pattern", "payments", "Payment processing with Stripe API"],
    [["webhooks", "webhook"], "Webhook Pattern", "integration", "Event-driven webhook subscription and delivery"],
    [["redis", "ioredis", "@upstash"], "Redis Caching Pattern", "caching", "Application caching and rate limiting with Redis"],
  ];

  for (const [deps, name, type, description] of patternChecks) {
    if (deps.some((d) => techStack.packages.some((p) => p.includes(d)))) {
      patterns.push({ name, type, description, evidence: `Found ${deps[0]} in dependencies` });
    }
  }

  // Check for directory-based patterns
  if (fs.existsSync(path.join(rootDir, "packages/emails"))) {
    patterns.push({
      name: "Email Template System",
      type: "notifications",
      description: "Structured email templates with provider abstraction",
      evidence: "packages/emails directory found",
    });
  }

  if (fs.existsSync(path.join(rootDir, "packages/app-store"))) {
    patterns.push({
      name: "App Store / Plugin Architecture",
      type: "extensibility",
      description: "Pluggable app/integration system with per-app packages",
      evidence: "packages/app-store directory found",
    });
  }

  // Feature-derived patterns
  const featureNames = features.map((f) => f.name.toLowerCase());
  if (featureNames.some((f) => f.includes("workflow"))) {
    patterns.push({
      name: "Workflow Engine Pattern",
      type: "automation",
      description: "Multi-step workflow automation with triggers and actions",
      evidence: "workflows feature detected",
    });
  }

  if (featureNames.some((f) => f.includes("routing") || f.includes("form"))) {
    patterns.push({
      name: "Form Routing Pattern",
      type: "routing",
      description: "Dynamic form-based routing to appropriate handlers",
      evidence: "routing-forms feature detected",
    });
  }

  if (featureNames.some((f) => f.includes("audit") || f.includes("watchlist"))) {
    patterns.push({
      name: "Audit Trail Pattern",
      type: "compliance",
      description: "Append-only audit logging with actor tracking",
      evidence: "audit feature detected",
    });
  }

  if (featureNames.some((f) => f.includes("embed"))) {
    patterns.push({
      name: "Embeddable Widget Pattern",
      type: "distribution",
      description: "Iframe/script-embeddable widget for third-party sites",
      evidence: "embed feature detected",
    });
  }

  return patterns;
}

function classifyApp(features: FeatureAnalysis[], integrations: Integration[], dataModels: DataModel[]): string {
  const featureNames = features.map((f) => f.name.toLowerCase()).join(" ");
  const integrationTypes = integrations.map((i) => i.type).join(" ");

  if (featureNames.includes("booking") || featureNames.includes("scheduling") || featureNames.includes("calendar")) return "scheduling_platform";
  if (featureNames.includes("payment") && featureNames.includes("wallet")) return "fintech_wallet";
  if (featureNames.includes("marketplace") || featureNames.includes("seller") || featureNames.includes("buyer")) return "marketplace";
  if (featureNames.includes("compliance") || featureNames.includes("audit") || featureNames.includes("case")) return "compliance_case_management";
  if (featureNames.includes("property") || featureNames.includes("tenant") || featureNames.includes("rental")) return "property_management_system";
  if (featureNames.includes("logistics") || featureNames.includes("fleet") || featureNames.includes("delivery")) return "logistics_operations_system";
  if (featureNames.includes("approval") || featureNames.includes("workflow")) return "workflow_approval_system";
  if (featureNames.includes("dashboard") || featureNames.includes("admin") || featureNames.includes("ops")) return "internal_ops_tool";
  if (featureNames.includes("portal") || featureNames.includes("customer") || featureNames.includes("account")) return "customer_portal";
  return "other";
}

// ─── Main Analysis ──────────────────────────────────────────────────

export function analyzeCodebase(rootDir: string): AppAnalysis {
  console.log(`\n[reverse-engineer] Analyzing codebase at: ${rootDir}`);

  const rootPkg = readJsonSafe(path.join(rootDir, "package.json"));
  const name = rootPkg?.name || path.basename(rootDir);

  console.log(`[reverse-engineer] App name: ${name}`);

  // Tech stack
  console.log("[reverse-engineer] Analyzing tech stack...");
  const techStack = analyzeTechStack(rootDir, rootPkg);

  // Features
  console.log("[reverse-engineer] Extracting features...");
  const features = analyzeFeatures(rootDir);
  console.log(`[reverse-engineer] Found ${features.length} features`);

  // Data models
  console.log("[reverse-engineer] Parsing data models...");
  const dataModels = analyzePrismaModels(rootDir);
  console.log(`[reverse-engineer] Found ${dataModels.length} data models`);

  // Integrations
  console.log("[reverse-engineer] Mapping integrations...");
  const integrations = analyzeIntegrations(rootDir);
  console.log(`[reverse-engineer] Found ${integrations.length} integrations`);

  // API routes
  console.log("[reverse-engineer] Scanning API routes...");
  const apiRoutes = analyzeApiRoutes(rootDir);
  console.log(`[reverse-engineer] Found ${apiRoutes.length} API routes/procedures`);

  // Patterns
  console.log("[reverse-engineer] Identifying patterns...");
  const patterns = analyzePatterns(rootDir, techStack, features);
  console.log(`[reverse-engineer] Found ${patterns.length} patterns`);

  // File structure
  const fileStructure = scanDirectory(rootDir, 2);
  const totalFiles = countFiles(rootDir, [".ts", ".tsx", ".js", ".jsx"]);

  // App class
  const appClass = classifyApp(features, integrations, dataModels);

  const description = rootPkg?.description ||
    `${appClass.replace(/_/g, " ")} built with ${techStack.framework}, ${techStack.language}, ${techStack.database}`;

  return {
    name,
    description,
    appClass,
    techStack,
    features,
    dataModels,
    integrations,
    apiRoutes,
    patterns,
    fileStructure,
    packageCount: features.length,
    totalFiles,
  };
}

// ─── Neo4j Writer ───────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

async function writeToNeo4j(analysis: AppAnalysis): Promise<void> {
  const neo4j = getNeo4jService();
  const ok = await neo4j.connect();

  if (!ok) {
    console.error("[reverse-engineer] Cannot connect to Neo4j — learned knowledge will NOT be persisted");
    return;
  }

  const now = new Date().toISOString().split("T")[0];
  const sourceId = `learned-${analysis.name}`.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  let written = 0;
  let failed = 0;

  async function safeWrite(cypher: string, label: string): Promise<boolean> {
    try {
      await neo4j.runCypher(cypher);
      written++;
      return true;
    } catch (err: any) {
      console.warn(`[reverse-engineer] ${label} failed: ${err.message}`);
      failed++;
      return false;
    }
  }

  // 1. Write App entity
  console.log("[reverse-engineer] Writing app entity to Neo4j...");
  const appEntity: EntityNode = {
    entity_id: sourceId,
    name: analysis.name,
    system: "aes-learned",
    entity_type: "contract",
    created_at: now,
  };

  const appVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
    version_id: `${sourceId}-v1`,
    created_at: now,
    promoted_actor: "reverse-engineer",
    snapshot_name: analysis.name,
    snapshot_description: analysis.description,
    snapshot_text: JSON.stringify({
      app_class: analysis.appClass,
      tech_stack: analysis.techStack,
      feature_count: analysis.features.length,
      model_count: analysis.dataModels.length,
      integration_count: analysis.integrations.length,
      total_files: analysis.totalFiles,
    }),
  };

  const appCypher = cypherCreateEntity(appEntity, appVersion, analysis.name)
    .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
    .replace("MERGE (v)-[:SNAPSHOT_OF]->(d)", "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)");

  await safeWrite(appCypher, `App entity [${sourceId}]`);

  // Set app properties for fast queries
  const appPropsCypher = `
MATCH (e:Entity {entity_id: '${sourceId}'})
SET e.app_class = '${esc(analysis.appClass)}',
    e.framework = '${esc(analysis.techStack.framework)}',
    e.language = '${esc(analysis.techStack.language)}',
    e.database = '${esc(analysis.techStack.database)}',
    e.orm = '${esc(analysis.techStack.orm)}',
    e.monorepo = ${analysis.techStack.monorepo},
    e.feature_count = ${analysis.features.length},
    e.model_count = ${analysis.dataModels.length},
    e.integration_count = ${analysis.integrations.length},
    e.total_files = ${analysis.totalFiles},
    e.learned_from = 'reverse-engineer',
    e.learned_at = '${now}'
RETURN e.entity_id
  `.trim();

  await safeWrite(appPropsCypher, `App properties [${sourceId}]`);

  // 2. Write Feature entities
  console.log(`[reverse-engineer] Writing ${analysis.features.length} feature entities...`);
  for (const feat of analysis.features) {
    const featId = `${sourceId}-${feat.id}`;

    const featEntity: EntityNode = {
      entity_id: featId,
      name: feat.name,
      system: "aes-learned",
      entity_type: "feature_spec",
      created_at: now,
    };

    const featVersion: Omit<VersionNode, "version_number" | "status" | "promoted_at"> = {
      version_id: `${featId}-v1`,
      created_at: now,
      promoted_actor: "reverse-engineer",
      snapshot_name: feat.name,
      snapshot_description: feat.description,
      snapshot_text: JSON.stringify({
        directory: feat.directory,
        file_count: feat.fileCount,
        has_tests: feat.hasTests,
        has_api: feat.hasApi,
        complexity: feat.complexity,
        dependencies: feat.dependencies,
      }),
    };

    const featCypher = cypherCreateEntity(featEntity, featVersion, feat.name)
      .replace("MATCH (d:Decision", "OPTIONAL MATCH (d:Decision")
      .replace("MERGE (v)-[:SNAPSHOT_OF]->(d)", "FOREACH (_ IN CASE WHEN d IS NOT NULL THEN [1] ELSE [] END |\n  MERGE (v)-[:SNAPSHOT_OF]->(d)\n)");

    await safeWrite(featCypher, `Feature [${feat.name}]`);

    // Link feature to app
    await safeWrite(
      `MATCH (a:Entity {entity_id: '${sourceId}'})\nMATCH (f:Entity {entity_id: '${featId}'})\nMERGE (a)-[:HAS_FEATURE]->(f)\nRETURN a.entity_id`,
      `Feature link [${feat.name}]`
    );

    // Set feature properties
    await safeWrite(
      `MATCH (e:Entity {entity_id: '${featId}'})\nSET e.complexity = '${feat.complexity}', e.file_count = ${feat.fileCount}, e.has_tests = ${feat.hasTests}, e.has_api = ${feat.hasApi}, e.directory = '${esc(feat.directory)}', e.learned_from = '${esc(analysis.name)}'\nRETURN e.entity_id`,
      `Feature properties [${feat.name}]`
    );
  }

  // 3. Write Pattern entities
  console.log(`[reverse-engineer] Writing ${analysis.patterns.length} pattern entities...`);
  for (const pattern of analysis.patterns) {
    const patternId = `${sourceId}-pattern-${pattern.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;

    // Use MERGE to avoid duplicates for common patterns
    const patternCypher = `
MERGE (p:Pattern {name: '${esc(pattern.name)}'})
ON CREATE SET p.type = '${esc(pattern.type)}',
              p.description = '${esc(pattern.description)}',
              p.created_at = '${now}',
              p.learned_from = '${esc(analysis.name)}'
ON MATCH SET p.seen_count = COALESCE(p.seen_count, 0) + 1
WITH p
MATCH (a:Entity {entity_id: '${sourceId}'})
MERGE (a)-[:USES_PATTERN]->(p)
RETURN p.name
    `.trim();

    await safeWrite(patternCypher, `Pattern [${pattern.name}]`);
  }

  // 4. Write Integration/CatalogEntry nodes
  console.log(`[reverse-engineer] Writing ${analysis.integrations.length} integration entries...`);
  for (const integ of analysis.integrations) {
    const integCypher = `
MERGE (c:CatalogEntry {name: '${esc(integ.name)}'})
ON CREATE SET c.type = '${esc(integ.type)}',
              c.provider = '${esc(integ.provider)}',
              c.category = '${esc(integ.category)}',
              c.created_at = '${now}',
              c.learned_from = '${esc(analysis.name)}'
ON MATCH SET c.seen_count = COALESCE(c.seen_count, 0) + 1
WITH c
MATCH (a:Entity {entity_id: '${sourceId}'})
MERGE (a)-[:USES_INTEGRATION]->(c)
RETURN c.name
    `.trim();

    await safeWrite(integCypher, `Integration [${integ.name}]`);
  }

  // 5. Write Data Model summary
  console.log(`[reverse-engineer] Writing ${analysis.dataModels.length} data model entries...`);
  const modelCategories = new Map<string, DataModel[]>();
  for (const model of analysis.dataModels) {
    if (!modelCategories.has(model.category)) modelCategories.set(model.category, []);
    modelCategories.get(model.category)!.push(model);
  }

  for (const [category, models] of modelCategories) {
    const modelNames = models.map((m) => m.name).join(", ");
    const modelCypher = `
MERGE (dm:DataModelGroup {name: '${esc(category)}', source: '${esc(analysis.name)}'})
ON CREATE SET dm.models = '${esc(modelNames)}',
              dm.model_count = ${models.length},
              dm.created_at = '${now}',
              dm.learned_from = '${esc(analysis.name)}'
WITH dm
MATCH (a:Entity {entity_id: '${sourceId}'})
MERGE (a)-[:HAS_DATA_MODELS]->(dm)
RETURN dm.name
    `.trim();

    await safeWrite(modelCypher, `Data model group [${category}]`);
  }

  // 6. Write individual data models (top 50 most important)
  const importantModels = analysis.dataModels.slice(0, 50);
  for (const model of importantModels) {
    const fieldSummary = model.fields.slice(0, 20).join(", ");
    const relationSummary = model.relations.join(", ");

    const modelCypher = `
MERGE (m:DataModel {name: '${esc(model.name)}', source: '${esc(analysis.name)}'})
ON CREATE SET m.category = '${esc(model.category)}',
              m.fields = '${esc(fieldSummary)}',
              m.relations = '${esc(relationSummary)}',
              m.field_count = ${model.fields.length},
              m.relation_count = ${model.relations.length},
              m.created_at = '${now}'
WITH m
MATCH (dm:DataModelGroup {name: '${esc(model.category)}', source: '${esc(analysis.name)}'})
MERGE (dm)-[:CONTAINS_MODEL]->(m)
RETURN m.name
    `.trim();

    await safeWrite(modelCypher, `Data model [${model.name}]`);
  }

  console.log(`\n[reverse-engineer] Neo4j write complete: ${written} succeeded, ${failed} failed`);
}

// ─── CLI Entry ──────────────────────────────────────────────────────

async function main() {
  const targetDir = process.argv[2];

  if (!targetDir) {
    console.error("Usage: npx tsx src/tools/reverse-engineer.ts <path-to-codebase>");
    process.exit(1);
  }

  const resolved = path.resolve(targetDir);
  if (!fs.existsSync(resolved)) {
    console.error(`Directory not found: ${resolved}`);
    process.exit(1);
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AES Reverse Engineer — Learning from existing codebase");
  console.log("═══════════════════════════════════════════════════════════");

  // Analyze
  const analysis = analyzeCodebase(resolved);

  // Print summary
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  ANALYSIS SUMMARY");
  console.log("───────────────────────────────────────────────────────────");
  console.log(`  App:            ${analysis.name}`);
  console.log(`  App Class:      ${analysis.appClass}`);
  console.log(`  Framework:      ${analysis.techStack.framework}`);
  console.log(`  Language:        ${analysis.techStack.language}`);
  console.log(`  Database:        ${analysis.techStack.database}`);
  console.log(`  ORM:             ${analysis.techStack.orm}`);
  console.log(`  Styling:         ${analysis.techStack.styling}`);
  console.log(`  Testing:         ${analysis.techStack.testing}`);
  console.log(`  Build Tool:      ${analysis.techStack.buildTool}`);
  console.log(`  Monorepo:        ${analysis.techStack.monorepo}`);
  console.log(`  Total Files:     ${analysis.totalFiles}`);
  console.log(`  Features:        ${analysis.features.length}`);
  console.log(`  Data Models:     ${analysis.dataModels.length}`);
  console.log(`  Integrations:    ${analysis.integrations.length}`);
  console.log(`  API Routes:      ${analysis.apiRoutes.length}`);
  console.log(`  Patterns:        ${analysis.patterns.length}`);
  console.log("───────────────────────────────────────────────────────────");

  console.log("\n  TOP FEATURES:");
  for (const feat of analysis.features.slice(0, 15)) {
    console.log(`    ${feat.complexity === "complex" ? "★" : feat.complexity === "moderate" ? "◆" : "·"} ${feat.name} (${feat.fileCount} files, ${feat.complexity})`);
  }

  console.log("\n  PATTERNS:");
  for (const p of analysis.patterns) {
    console.log(`    ✦ ${p.name} [${p.type}]`);
  }

  console.log("\n  INTEGRATIONS (by type):");
  const byType = new Map<string, string[]>();
  for (const i of analysis.integrations) {
    if (!byType.has(i.type)) byType.set(i.type, []);
    byType.get(i.type)!.push(i.provider);
  }
  for (const [type, providers] of byType) {
    console.log(`    ${type}: ${providers.slice(0, 8).join(", ")}${providers.length > 8 ? ` (+${providers.length - 8} more)` : ""}`);
  }

  // Write to Neo4j
  console.log("\n───────────────────────────────────────────────────────────");
  console.log("  WRITING TO NEO4J");
  console.log("───────────────────────────────────────────────────────────");

  await writeToNeo4j(analysis);

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  AES has learned from this codebase.");
  console.log("  Next pipeline run will use this knowledge automatically.");
  console.log("═══════════════════════════════════════════════════════════\n");

  process.exit(0);
}

main().catch((err) => {
  console.error("[reverse-engineer] Fatal error:", err);
  process.exit(1);
});
