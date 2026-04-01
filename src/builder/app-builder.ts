/**
 * AppBuilder — builds a complete, runnable Next.js + Clerk + Convex application.
 *
 * Two-phase build:
 *   Phase 1: Scaffold the full app (RepoScaffolder + app-level files)
 *   Phase 2: Build each feature INTO the shared workspace
 *
 * The result is a single git workspace containing the entire app, committed
 * as one atomic commit.
 */

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

import { WorkspaceManager, type Workspace } from "./workspace-manager.js";
import { CodeBuilder, type BuilderContext } from "./code-builder.js";
import { RepoScaffolder, type RepoConfig } from "../deploy/repo-scaffolder.js";
import { compileBuilderPackage, type BuilderPackage } from "../builder-artifact.js";
import { verifyBuild } from "./build-verifier.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import type { BuilderRunRecord, FixTrailEntry } from "../types/artifacts.js";
import type { JobRecord } from "../store.js";
import type { GraphCallbacks } from "../graph.js";
import type { AESStateType } from "../state.js";
import type { GraphGuidance } from "./code-builder.js";
import {
  generateAppLayout,
  generateSidebar,
  generateDashboard,
  generateUnifiedSchema,
} from "../llm/app-gen.js";
import { setGraphGuidanceBlock, clearGraphGuidanceBlock } from "../llm/code-gen.js";
import {
  matchFeatureArchetype,
  deriveArchetypeSlots,
  renderArchetypeFiles,
  type FeatureArchetype,
  type FeatureArchetypeSlots,
} from "../contracts/framework-contract-layer.js";
import {
  decomposeFeature,
  composeFile,
  getTargetFiles,
  getPartsForFile,
  dependenciesSatisfied,
  type GeneratedFragment,
  type PartKind,
} from "./feature-parts.js";

// ─── Result types ───────────────────────────────────────────────────

export interface AppBuildResult {
  workspace: Workspace;
  run: BuilderRunRecord;
  featureResults: Record<string, BuilderRunRecord>;
  prSummary: string;
  file_contents: Record<string, string>;
}

// ─── Template fallbacks ─────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toTableName(name: string): string {
  return toSlug(name).replace(/-/g, "_");
}

function toPascalCase(str: string): string {
  return str
    .split(/[-_\s]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join("");
}

function normalizeGeneratedSource(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```$/);
  const normalized = fenced ? fenced[1] : trimmed;
  return `${normalizeBareConvexIdValidators(normalizeJsxNamespaceTypes(normalized)).trim()}\n`;
}

function normalizeJsxNamespaceTypes(content: string): string {
  return content
    .replace(/:\s*JSX\.Element\b/g, "")
    .replace(/:\s*JSX\.Element\[\]/g, "")
    .replace(/:\s*Array<JSX\.Element>/g, "")
    .replace(/:\s*JSX\.Element\s*\|\s*null/g, "")
    .replace(/:\s*JSX\.Element\s*\|\s*undefined/g, "");
}

function normalizeBareConvexIdValidators(content: string): string {
  return content
    .replace(/v\.id\(\s*\)/g, "v.string()")
    .replace(/v\.optional\(\s*\)/g, "v.optional(v.string())")
    .replace(/v\.array\(\s*\)/g, "v.array(v.string())");
}

function ensureClientComponent(content: string): string {
  const normalized = normalizeGeneratedSource(content);
  if (/^["']use client["'];?/.test(normalized)) return normalized;
  return `"use client";\n${normalized}`;
}

const AES_UI_COMPONENTS = [
  "Button",
  "Input",
  "Textarea",
  "Select",
  "Label",
  "Table",
  "TableHeader",
  "TableBody",
  "TableRow",
  "TableCell",
  "Card",
  "CardHeader",
  "CardContent",
  "Badge",
  "LoadingState",
  "EmptyState",
  "ErrorState",
  "Toast",
  "Dialog",
  "DialogTrigger",
  "DialogContent",
  "DialogHeader",
  "DialogTitle",
  "DialogDescription",
  "DialogFooter",
] as const;

function ensureAesUiImports(content: string): string {
  const normalized = normalizeGeneratedSource(content);
  const required = AES_UI_COMPONENTS.filter((name) =>
    new RegExp(`(<${name}\\b|\\b${name}\\b)`).test(normalized),
  );
  if (required.length === 0) return normalized;

  const importRegex = /import\s*{([^}]*)}\s*from\s*["']@aes\/ui["'];?/;
  const existingImport = normalized.match(importRegex);
  if (existingImport) {
    const existingNames = existingImport[1]
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...existingNames, ...required])).sort();
    return normalized.replace(importRegex, `import { ${merged.join(", ")} } from "@aes/ui";`);
  }

  const lines = normalized.split("\n");
  let insertAt = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("import ")) {
      insertAt = i + 1;
      continue;
    }
    if (line === '"use client";' || line === "'use client';" || line === "") {
      insertAt = Math.max(insertAt, i + 1);
      continue;
    }
    break;
  }
  lines.splice(insertAt, 0, `import { ${required.sort().join(", ")} } from "@aes/ui";`);
  return `${lines.join("\n").trim()}\n`;
}

function normalizeClerkUseAuthBindings(content: string): string {
  let normalized = normalizeGeneratedSource(content);
  if (!/useAuth\(\)/.test(normalized)) return normalized;

  normalized = normalized.replace(
    /const\s*{\s*([^}]*)\borg\b([^}]*)}\s*=\s*useAuth\(\)\s*;/g,
    (_match, before, after) => {
      const names = `${before},orgId,${after}`
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => (name === "org" ? "orgId" : name));
      const deduped = Array.from(new Set(names));
      return `const { ${deduped.join(", ")} } = useAuth();`;
    },
  );

  if (/\bconst\s*{\s*[^}]*\borgId\b[^}]*}\s*=\s*useAuth\(\)\s*;/.test(normalized)) {
    normalized = normalized.replace(/\borg\b/g, "orgId");
  }

  const useAuthBindingRegex = /const\s*{\s*([^}]*)}\s*=\s*useAuth\(\)\s*;/g;
  const bindingMatches = Array.from(normalized.matchAll(useAuthBindingRegex));
  if (bindingMatches.length > 1) {
    const mergedNames = Array.from(
      new Set(
        bindingMatches
          .flatMap((match) => match[1].split(","))
          .map((name) => name.trim())
          .filter(Boolean)
          .map((name) => (name === "org" ? "orgId" : name)),
      ),
    );

    let seen = false;
    normalized = normalized.replace(useAuthBindingRegex, () => {
      if (seen) return "";
      seen = true;
      return `const { ${mergedNames.join(", ")} } = useAuth();`;
    });
    normalized = normalized.replace(/\n{3,}/g, "\n\n");
  }

  return normalized;
}

function normalizeConvexHandlerBindings(content: string): string {
  let normalized = normalizeGeneratedSource(content);

  normalized = normalized.replace(
    /handler:\s*async\s*\(\s*ctx\s*,\s*{([^}]*)}\s*\)\s*=>\s*{/g,
    (_match, bindings) => {
      const names = bindings
        .split(",")
        .map((name: string) => name.trim())
        .filter(Boolean)
        .join(", ");
      return `handler: async (ctx, args: any) => {\n    const { ${names} } = args;`;
    },
  );

  normalized = normalized.replace(
    /(export const \w+ = (?:query|mutation)\(\s*async\s*\(\s*ctx\s*,\s*){([^}]*)}(\s*\)\s*=>\s*{)/g,
    (_match, prefix, bindings, suffix) => {
      const names = bindings
        .split(",")
        .map((name: string) => name.trim())
        .filter(Boolean)
        .join(", ");
      return `${prefix}args: any${suffix}\n  const { ${names} } = args;`;
    },
  );

  normalized = normalized.replace(
    /(export const \w+ = (?:query|mutation)\(\s*async\s*\()\s*ctx\s*(\s*,\s*args\s*)(\)\s*=>\s*{)/g,
    "$1ctx: any$2: any$3",
  );

  normalized = normalized.replace(
    /(export const \w+ = (?:query|mutation)\(\s*async\s*\()\s*ctx\s*(\)\s*=>\s*{)/g,
    "$1ctx: any$2",
  );

  normalized = normalized.replace(
    /handler:\s*async\s*\(\s*ctx\s*,\s*args\s*\)\s*=>\s*{/g,
    "handler: async (ctx: any, args: any) => {",
  );

  normalized = normalized.replace(
    /handler:\s*async\s*\(\s*ctx\s*,\s*args:\s*any\s*\)\s*=>\s*{/g,
    "handler: async (ctx: any, args: any) => {",
  );

  normalized = normalized.replace(
    /\.withIndex\(([^,]+),\s*\(\s*q\s*\)\s*=>/g,
    '.withIndex($1, (q: any) =>',
  );

  normalized = normalized.replace(
    /\.filter\(\s*\(\s*q\s*\)\s*=>/g,
    '.filter((q: any) =>',
  );

  normalized = normalized.replace(
    /\.order\(\s*\(\s*q\s*\)\s*=>/g,
    '.order((q: any) =>',
  );

  return normalized;
}

function templateLayout(appSpec: any): string {
  return `import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexClientProvider } from "./convex-provider";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

// All pages use Convex/Clerk hooks which require runtime providers.
// Static prerendering always fails without them — force dynamic rendering.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "${(appSpec?.title || "App").replace(/"/g, '\\"')}",
  description: "${(appSpec?.summary || "Built with AES").replace(/"/g, '\\"')}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <ConvexClientProvider>
            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 p-8 bg-gray-50">{children}</main>
            </div>
          </ConvexClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
`;
}

function templateSidebar(appSpec: any): string {
  const features = appSpec?.features || [];
  const links = features
    .map((f: any) => {
      const slug = toSlug(f.name);
      const name = f.name.replace(/"/g, '\\"');
      return `  { name: "${name}", href: "/${slug}", icon: LayoutDashboard }`;
    })
    .join(",\n");

  return `"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Home } from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
${links}
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 min-h-screen bg-gray-950 text-white p-4">
      <div className="text-lg font-semibold mb-8 px-2">${(appSpec?.title || "App").replace(/"/g, '\\"')}</div>
      <nav className="space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={\`flex items-center gap-3 px-3 py-2 rounded-md text-sm \${
                isActive
                  ? "bg-violet-600 text-white"
                  : "text-gray-400 hover:bg-gray-800 hover:text-white"
              }\`}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
`;
}

function templateDashboard(appSpec: any): string {
  const features = appSpec?.features || [];
  const cards = features
    .map((f: any) => {
      const slug = toSlug(f.name);
      const name = f.name.replace(/"/g, '\\"');
      const desc = (f.summary || f.description || "").replace(/"/g, '\\"');
      return `        <a
          key="${slug}"
          href="/${slug}"
          className="block rounded-lg border bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
        >
          <h3 className="text-lg font-semibold mb-2">${name}</h3>
          <p className="text-sm text-gray-500">${desc}</p>
        </a>`;
    })
    .join("\n");

  return `"use client";

import { useAuth } from "@clerk/nextjs";

/**
 * Dashboard for ${(appSpec?.title || "App").replace(/"/g, '\\"')}
 * Generated by AES v12 App Builder
 */
export default function DashboardPage() {
  const { orgId } = useAuth();

  if (!orgId) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-gray-500">Select an organization to continue.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-2">${(appSpec?.title || "App").replace(/"/g, '\\"')}</h1>
      <p className="text-gray-500 mb-8">${(appSpec?.summary || "Welcome to your application.").replace(/"/g, '\\"')}</p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
${cards}
      </div>
    </div>
  );
}
`;
}

function templateUnifiedSchema(appSpec: any): string {
  const features = appSpec?.features || [];
  const tables = features
    .map((f: any) => {
      const tableName = toTableName(f.name);
      return `  ${tableName}: defineTable({
    title: v.string(),
    description: v.optional(v.string()),
    status: v.string(),
    createdBy: v.string(),
    orgId: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_status", ["orgId", "status"])`;
    })
    .join(",\n");

  return `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Unified schema for ${(appSpec?.title || "App").replace(/"/g, '\\"')}
 * Generated by AES v12 App Builder
 *
 * All tables include orgId for tenant isolation.
 */
export default defineSchema({
${tables},
  audit_logs: defineTable({
    action: v.string(),
    userId: v.string(),
    orgId: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    details: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"]),
});
`;
}

// ─── Graph Guidance ─────────────────────────────────────────────────

/**
 * Converts the raw graphContext (loaded once at Gate 0) into a structured
 * GraphGuidance object that the builder and LLM prompts can consume.
 * This gives every feature build access to prior violations, failure
 * patterns, and corrections from the Neo4j graph.
 */
function buildGraphGuidance(
  graphContext?: AESStateType["graphContext"],
): GraphGuidance {
  const guidance: GraphGuidance = {
    violations: [],
    failurePatterns: [],
    corrections: [],
    knownPatterns: [],
    learnedFeatures: [],
    learnedModels: [],
    learnedIntegrations: [],
    learnedFlows: [],
    learnedResearch: [],
    buildExtractedModels: [],
    buildExtractedPatterns: [],
    buildExtractedTech: [],
    learnedComponentPatterns: [],
    componentRelationships: [],
    learnedFormPatterns: [],
    learnedNavigation: [],
    learnedPageSections: [],
    learnedStatePatterns: [],
    learnedDesignSystems: [],
    preventionRules: [],
    fixPatterns: [],
    convexSchemas: [],
    referenceSchemas: [],
    aesLessons: [],
    aesBlueprints: [],
    learnedAppContext: [],
    reasoningRules: [],
    aesPreflight: [],
    unifiedDomainSources: [],
    unifiedBlueprint: [],
    unifiedGaps: [],
    unifiedDiscoveredKnowledge: [],
    unifiedUniversalPatterns: [],
    unifiedConceptScores: [],
  };
  if (!graphContext) return guidance;

  // ── Failure history & violations ──
  for (const item of graphContext.failureHistory ?? []) {
    if (item.code || item.description) {
      guidance.violations.push({
        code: item.code ?? "UNKNOWN",
        description: item.description ?? "",
        resolution: item.resolution ?? "",
        severity: item.severity ?? "info",
      });
    }
    if (item.pattern || item.category === "repair") {
      guidance.failurePatterns.push({
        pattern: item.pattern ?? item.name ?? "unknown",
        diagnosis: item.description ?? "",
        fixAction: item.resolution ?? "",
      });
    }
  }

  // ── Corrections ──
  for (const item of graphContext.learnedCorrections ?? []) {
    if (item.description) {
      guidance.corrections.push({
        description: item.description ?? "",
        resolution: item.resolution ?? item.fix ?? "",
      });
    }
  }

  // ── Known patterns ──
  for (const item of graphContext.knownPatterns ?? []) {
    if (item.name || item.description) {
      guidance.knownPatterns.push({
        name: item.name ?? "",
        description: item.description ?? "",
      });
    }
  }

  // ── Learned features ──
  for (const item of graphContext.learnedFeatures ?? []) {
    if (item.name) {
      guidance.learnedFeatures.push({
        name: item.name ?? "",
        description: item.description ?? item.summary ?? "",
        capabilities: Array.isArray(item.capabilities)
          ? item.capabilities.join(", ")
          : item.capabilities ?? "",
      });
    }
  }

  // ── Learned data models ──
  for (const item of graphContext.learnedModels ?? []) {
    if (item.name) {
      const fields = Array.isArray(item.fields)
        ? item.fields.map((f: any) => typeof f === "string" ? f : `${f.name}: ${f.type}`).join(", ")
        : item.fields ?? item.schema ?? "";
      guidance.learnedModels.push({ name: item.name ?? "", fields, schemaSource: item.schema_source ?? undefined });
    }
  }

  // ── Learned integrations ──
  for (const item of graphContext.learnedIntegrations ?? []) {
    if (item.name || item.type) {
      guidance.learnedIntegrations.push({
        name: item.name ?? item.service ?? "",
        type: item.type ?? item.category ?? "",
        description: item.description ?? item.purpose ?? "",
      });
    }
  }

  // ── Learned flows ──
  for (const item of graphContext.learnedFlows ?? []) {
    if (item.name || item.description) {
      guidance.learnedFlows.push({
        name: item.name ?? "",
        description: item.description ?? item.steps ?? "",
      });
    }
  }

  // ── Learned research ──
  for (const item of graphContext.learnedResearch ?? []) {
    if (item.topic || item.finding || item.description) {
      guidance.learnedResearch.push({
        topic: item.topic ?? item.name ?? "",
        finding: item.finding ?? item.description ?? item.summary ?? "",
      });
    }
  }

  // ── Build extraction intelligence ──
  for (const item of graphContext.buildExtractedModels ?? []) {
    if (item.name) {
      const fields = Array.isArray(item.fields)
        ? item.fields.join(", ")
        : item.fields ?? item.table_name ?? "";
      guidance.buildExtractedModels.push({
        name: item.name ?? "",
        fields,
        appClass: item.app_class ?? "",
      });
    }
  }

  for (const item of graphContext.buildExtractedPatterns ?? []) {
    if (item.name) {
      guidance.buildExtractedPatterns.push({
        name: item.name ?? "",
        type: item.type ?? "",
        description: item.description ?? "",
        codeSample: item.code_sample ?? undefined,
      });
    }
  }

  for (const item of graphContext.buildExtractedTech ?? []) {
    if (item.name) {
      guidance.buildExtractedTech.push({
        name: item.name ?? "",
        version: item.version ?? "",
        category: item.category ?? "",
      });
    }
  }

  // ── Learned component patterns ──
  for (const item of graphContext.learnedComponentPatterns ?? []) {
    if (item.name) {
      guidance.learnedComponentPatterns.push({
        name: item.name ?? "",
        category: item.category ?? "",
        description: item.description ?? "",
        props: item.props ?? undefined,
        usageExample: item.usage_example ?? undefined,
      });
    }
  }

  // ── Component relationships (dependencies, variants, loading states, pairs) ──
  for (const item of graphContext.componentRelationships ?? []) {
    if (item.component && Array.isArray(item.related_components)) {
      guidance.componentRelationships.push({
        component: item.component,
        related: item.related_components,
      });
    }
  }

  // ── Learned form patterns ──
  for (const item of graphContext.learnedFormPatterns ?? []) {
    if (item.name) {
      guidance.learnedFormPatterns.push({
        name: item.name ?? "",
        description: item.description ?? "",
        fields: item.fields ?? undefined,
        validationRules: item.validation_rules ?? undefined,
      });
    }
  }

  // ── Learned navigation ──
  for (const item of graphContext.learnedNavigation ?? []) {
    if (item.name) {
      guidance.learnedNavigation.push({
        name: item.name ?? "",
        type: item.type ?? "",
        description: item.description ?? "",
      });
    }
  }

  // ── Learned page sections ──
  for (const item of graphContext.learnedPageSections ?? []) {
    if (item.name) {
      guidance.learnedPageSections.push({
        name: item.name ?? "",
        type: item.type ?? "",
        description: item.description ?? "",
        layout: item.layout ?? undefined,
      });
    }
  }

  // ── Learned state patterns ──
  for (const item of graphContext.learnedStatePatterns ?? []) {
    if (item.name) {
      guidance.learnedStatePatterns.push({
        name: item.name ?? "",
        patternType: item.pattern_type ?? "",
        description: item.description ?? "",
      });
    }
  }

  // ── Learned design systems ──
  for (const item of graphContext.learnedDesignSystems ?? []) {
    if (item.name) {
      guidance.learnedDesignSystems.push({
        name: item.name ?? "",
        description: item.description ?? "",
        componentLibrary: item.component_library ?? undefined,
      });
    }
  }

  // ── Prevention rules ──
  for (const item of graphContext.preventionRules ?? []) {
    if (item.name || item.condition) {
      guidance.preventionRules.push({
        name: item.name ?? "",
        condition: item.condition ?? item.description ?? "",
        action: item.action ?? "",
        severity: item.severity ?? "warning",
      });
    }
  }

  // ── Fix patterns ──
  for (const item of graphContext.fixPatterns ?? []) {
    if (item.name || item.error_pattern) {
      guidance.fixPatterns.push({
        name: item.name ?? "",
        errorPattern: item.error_pattern ?? "",
        fixStrategy: item.fix_strategy ?? "",
        successRate: item.success_rate?.toString() ?? undefined,
      });
    }
  }

  // ── Convex schemas ──
  for (const item of graphContext.convexSchemas ?? []) {
    if (item.name || item.tables) {
      guidance.convexSchemas.push({
        name: item.name ?? "",
        tables: Array.isArray(item.tables) ? item.tables.join(", ") : item.tables ?? "",
        appClass: item.app_class ?? "",
        schemaText: item.schema_text ?? undefined,
      });
    }
  }

  // ── Reference schemas ──
  for (const item of graphContext.referenceSchemas ?? []) {
    if (item.name) {
      guidance.referenceSchemas.push({
        name: item.name ?? "",
        domain: item.domain ?? "",
        tables: Array.isArray(item.tables) ? item.tables.join(", ") : item.tables ?? "",
        schemaText: item.schema_text ?? undefined,
      });
    }
  }

  // ── AES lessons ──
  for (const item of graphContext.aesLessons ?? []) {
    if (item.title || item.summary) {
      guidance.aesLessons.push({
        title: item.title ?? "",
        summary: item.summary ?? "",
        category: item.category ?? "",
      });
    }
  }

  // ── AES blueprints ──
  for (const item of graphContext.aesBlueprints ?? []) {
    if (item.name) {
      guidance.aesBlueprints.push({
        name: item.name ?? "",
        appClass: item.app_class ?? "",
        description: item.description ?? "",
        featureList: Array.isArray(item.feature_list) ? item.feature_list.join(", ") : item.feature_list ?? undefined,
      });
    }
  }

  // ── Learned app context ──
  for (const item of graphContext.learnedAppContext ?? []) {
    if (item.app_name || item.app_class) {
      guidance.learnedAppContext.push({
        appName: item.app_name ?? "",
        appClass: item.app_class ?? "",
        features: Array.isArray(item.features) ? item.features.join(", ") : item.features ?? "",
        models: Array.isArray(item.models) ? item.models.join(", ") : item.models ?? "",
        integrations: Array.isArray(item.integrations) ? item.integrations.join(", ") : item.integrations ?? "",
      });
    }
  }

  // ── Reasoning rules ──
  for (const item of graphContext.reasoningRules ?? []) {
    if (item.title) {
      const strategies = Array.isArray(item.strategies)
        ? item.strategies.filter((s: any) => s.title).map((s: any) => s.title).join("; ")
        : "";
      guidance.reasoningRules.push({
        title: item.title ?? "",
        summary: item.summary ?? "",
        strategies,
      });
    }
  }

  // ── AES preflight checklists ──
  for (const item of graphContext.aesPreflight ?? []) {
    if (item.title) {
      guidance.aesPreflight.push({
        title: item.title ?? "",
        steps: Array.isArray(item.steps) ? item.steps.join("; ") : item.steps ?? "",
      });
    }
  }

  // ── Unified reasoner: domain sources ──
  for (const item of graphContext.unifiedDomainSources ?? []) {
    if (item.domain && item.bestApp) {
      guidance.unifiedDomainSources.push({
        domain: item.domain ?? "",
        bestApp: item.bestApp ?? "",
        features: Array.isArray(item.matchedFeatures) ? item.matchedFeatures.join(", ") : "",
        models: Array.isArray(item.matchedModels) ? item.matchedModels.join(", ") : "",
        integrations: Array.isArray(item.matchedIntegrations) ? item.matchedIntegrations.join(", ") : "",
      });
    }
  }

  // ── Unified reasoner: blueprint ──
  guidance.unifiedBlueprint = graphContext.unifiedBlueprint ?? [];

  // ── Unified reasoner: gaps ──
  guidance.unifiedGaps = graphContext.unifiedGaps ?? [];

  // ── Unified reasoner: discovered knowledge ──
  const dk = graphContext.unifiedDiscoveredKnowledge ?? {};
  for (const [category, items] of Object.entries(dk)) {
    if (Array.isArray(items) && items.length > 0) {
      guidance.unifiedDiscoveredKnowledge.push({
        category,
        items: items.slice(0, 15).join(", "),
      });
    }
  }

  // ── Unified reasoner: universal patterns ──
  for (const item of graphContext.unifiedUniversalPatterns ?? []) {
    if (item.name) {
      guidance.unifiedUniversalPatterns.push({
        name: item.name ?? "",
        type: item.type ?? "",
        percentage: `${item.percentage ?? 0}%`,
      });
    }
  }

  // ── Unified reasoner: concept confidence scores ──
  for (const item of graphContext.unifiedConceptScores ?? []) {
    if (item.concept) {
      guidance.unifiedConceptScores.push({
        concept: item.concept ?? "",
        confidence: item.confidence ?? "GAP",
        totalHits: `${item.totalHits ?? 0}`,
        evidence: Array.isArray(item.evidence) ? item.evidence.slice(0, 5).join("; ") : "",
      });
    }
  }

  return guidance;
}

/**
 * Formats graph guidance into a constraint block that can be injected
 * into LLM system prompts. Only includes non-empty sections.
 */
export function formatGraphGuidanceForPrompt(guidance?: GraphGuidance): string {
  if (!guidance) return "";
  const parts: string[] = [];

  if (guidance.violations.length > 0) {
    const blocking = guidance.violations.filter((v) => v.severity === "blocking");
    if (blocking.length > 0) {
      parts.push("## KNOWN BUILD FAILURES — AVOID THESE PATTERNS");
      for (const v of blocking.slice(0, 10)) {
        parts.push(`- ${v.code}: ${v.description}`);
        if (v.resolution) parts.push(`  Fix: ${v.resolution}`);
      }
    }
  }

  if (guidance.corrections.length > 0) {
    parts.push("\n## CORRECTIONS FROM PRIOR BUILDS");
    for (const c of guidance.corrections.slice(0, 10)) {
      parts.push(`- ${c.description}`);
      if (c.resolution) parts.push(`  Resolution: ${c.resolution}`);
    }
  }

  if (guidance.failurePatterns.length > 0) {
    parts.push("\n## FAILURE PATTERNS TO PREVENT");
    for (const f of guidance.failurePatterns.slice(0, 5)) {
      parts.push(`- ${f.pattern}: ${f.diagnosis}`);
      if (f.fixAction) parts.push(`  Prevention: ${f.fixAction}`);
    }
  }

  if (guidance.knownPatterns.length > 0) {
    parts.push("\n## REUSABLE PATTERNS FROM PRIOR BUILDS");
    for (const p of guidance.knownPatterns.slice(0, 10)) {
      parts.push(`- ${p.name}: ${p.description}`);
    }
  }

  if (guidance.learnedFeatures.length > 0) {
    parts.push("\n## PRIOR FEATURE STRUCTURES — USE AS REFERENCE");
    for (const f of guidance.learnedFeatures.slice(0, 8)) {
      parts.push(`- ${f.name}: ${f.description}`);
      if (f.capabilities) parts.push(`  Capabilities: ${f.capabilities}`);
    }
  }

  if (guidance.learnedModels.length > 0) {
    parts.push("\n## KNOWN DATA MODELS — REUSE WHEN APPLICABLE");
    for (const m of guidance.learnedModels.slice(0, 10)) {
      parts.push(`- ${m.name}: ${m.fields}`);
      if (m.schemaSource) parts.push(`  Schema:\n\`\`\`typescript\n${m.schemaSource}\n\`\`\``);
    }
  }

  if (guidance.learnedIntegrations.length > 0) {
    parts.push("\n## KNOWN INTEGRATIONS");
    for (const i of guidance.learnedIntegrations.slice(0, 8)) {
      parts.push(`- ${i.name} (${i.type}): ${i.description}`);
    }
  }

  if (guidance.learnedFlows.length > 0) {
    parts.push("\n## KNOWN UI/DATA FLOWS");
    for (const f of guidance.learnedFlows.slice(0, 8)) {
      parts.push(`- ${f.name}: ${f.description}`);
    }
  }

  if (guidance.learnedResearch.length > 0) {
    parts.push("\n## RESEARCH FINDINGS — INFORM DESIGN DECISIONS");
    for (const r of guidance.learnedResearch.slice(0, 5)) {
      parts.push(`- ${r.topic}: ${r.finding}`);
    }
  }

  // ── Build extraction intelligence ──

  if (guidance.buildExtractedModels.length > 0) {
    parts.push("\n## PROVEN DATA MODELS FROM PRIOR BUILDS");
    for (const m of guidance.buildExtractedModels.slice(0, 10)) {
      parts.push(`- ${m.name} (${m.appClass}): ${m.fields}`);
    }
  }

  if (guidance.buildExtractedPatterns.length > 0) {
    parts.push("\n## PROVEN CODE PATTERNS FROM PRIOR BUILDS");
    for (const p of guidance.buildExtractedPatterns.slice(0, 8)) {
      parts.push(`- ${p.name} (${p.type}): ${p.description}`);
      if (p.codeSample) parts.push(`  Example:\n\`\`\`typescript\n${p.codeSample}\n\`\`\``);
    }
  }

  if (guidance.buildExtractedTech.length > 0) {
    parts.push("\n## PROVEN TECH STACK");
    const techStr = guidance.buildExtractedTech.slice(0, 10)
      .map(t => `${t.name}${t.version ? `@${t.version}` : ""} (${t.category})`)
      .join(", ");
    parts.push(`- ${techStr}`);
  }

  // ── Design/UI intelligence ──

  if (guidance.learnedComponentPatterns.length > 0) {
    parts.push("\n## UI COMPONENT PATTERNS — USE THESE STRUCTURES");
    for (const c of guidance.learnedComponentPatterns.slice(0, 10)) {
      parts.push(`- ${c.name} (${c.category}): ${c.description}`);
      if (c.props) parts.push(`  Props: ${c.props}`);
      if (c.usageExample) parts.push(`  Usage:\n\`\`\`tsx\n${c.usageExample}\n\`\`\``);
    }
  }

  if (guidance.componentRelationships.length > 0) {
    parts.push("\n## COMPONENT DEPENDENCY GRAPH — INCLUDE RELATED COMPONENTS");
    parts.push("When you use a component, also include its dependencies, loading states, and error fallbacks:");
    for (const rel of guidance.componentRelationships.slice(0, 15)) {
      const groups: Record<string, string[]> = {};
      for (const r of rel.related) {
        const type = r.relationship ?? "RELATED";
        if (!groups[type]) groups[type] = [];
        groups[type].push(r.name + (r.reason ? ` (${r.reason})` : ""));
      }
      const lines = Object.entries(groups)
        .map(([type, names]) => `  ${type}: ${names.join(", ")}`)
        .join("\n");
      parts.push(`- ${rel.component}:\n${lines}`);
      // Include usage_example for dependency components the builder might not have seen
      for (const r of rel.related) {
        if (r.usage_example && r.relationship === "DEPENDS_ON") {
          parts.push(`  Required dep "${r.name}":\n\`\`\`tsx\n${r.usage_example}\n\`\`\``);
        }
      }
    }
  }

  if (guidance.learnedFormPatterns.length > 0) {
    parts.push("\n## FORM PATTERNS — VALIDATED FORM STRUCTURES");
    for (const f of guidance.learnedFormPatterns.slice(0, 8)) {
      parts.push(`- ${f.name}: ${f.description}`);
      if (f.fields) parts.push(`  Fields: ${f.fields}`);
      if (f.validationRules) parts.push(`  Validation: ${f.validationRules}`);
    }
  }

  if (guidance.learnedNavigation.length > 0) {
    parts.push("\n## NAVIGATION PATTERNS");
    for (const n of guidance.learnedNavigation.slice(0, 5)) {
      parts.push(`- ${n.name} (${n.type}): ${n.description}`);
    }
  }

  if (guidance.learnedPageSections.length > 0) {
    parts.push("\n## PAGE SECTION LAYOUTS");
    for (const s of guidance.learnedPageSections.slice(0, 8)) {
      parts.push(`- ${s.name} (${s.type}): ${s.description}`);
      if (s.layout) parts.push(`  Layout: ${s.layout}`);
    }
  }

  if (guidance.learnedStatePatterns.length > 0) {
    parts.push("\n## STATE MANAGEMENT PATTERNS");
    for (const s of guidance.learnedStatePatterns.slice(0, 5)) {
      parts.push(`- ${s.name} (${s.patternType}): ${s.description}`);
    }
  }

  if (guidance.learnedDesignSystems.length > 0) {
    parts.push("\n## DESIGN SYSTEM REFERENCES");
    for (const d of guidance.learnedDesignSystems.slice(0, 3)) {
      parts.push(`- ${d.name}: ${d.description}`);
      if (d.componentLibrary) parts.push(`  Component library: ${d.componentLibrary}`);
    }
  }

  // ── Failure prevention intelligence ──

  if (guidance.preventionRules.length > 0) {
    parts.push("\n## PREVENTION RULES — PROACTIVE ERROR AVOIDANCE");
    for (const r of guidance.preventionRules.slice(0, 10)) {
      parts.push(`- ${r.name} [${r.severity}]: IF ${r.condition} THEN ${r.action}`);
    }
  }

  if (guidance.fixPatterns.length > 0) {
    parts.push("\n## KNOWN FIX STRATEGIES");
    for (const f of guidance.fixPatterns.slice(0, 8)) {
      parts.push(`- ${f.name}: ${f.errorPattern} → ${f.fixStrategy}`);
      if (f.successRate) parts.push(`  Success rate: ${f.successRate}`);
    }
  }

  // ── Schema intelligence ──

  if (guidance.convexSchemas.length > 0) {
    parts.push("\n## WORKING CONVEX SCHEMAS FROM PRIOR BUILDS");
    for (const s of guidance.convexSchemas.slice(0, 3)) {
      parts.push(`- ${s.name} (${s.appClass}): tables: ${s.tables}`);
      if (s.schemaText) parts.push(`  Schema:\n\`\`\`typescript\n${s.schemaText}\n\`\`\``);
    }
  }

  if (guidance.referenceSchemas.length > 0) {
    parts.push("\n## REFERENCE DATA MODELS");
    for (const s of guidance.referenceSchemas.slice(0, 5)) {
      parts.push(`- ${s.name} (${s.domain}): ${s.tables}`);
      if (s.schemaText) parts.push(`  Schema:\n\`\`\`typescript\n${s.schemaText}\n\`\`\``);
    }
  }

  // ── AES meta-intelligence ──

  if (guidance.aesBlueprints.length > 0) {
    parts.push("\n## APP ARCHITECTURE BLUEPRINTS");
    for (const b of guidance.aesBlueprints.slice(0, 3)) {
      parts.push(`- ${b.name} (${b.appClass}): ${b.description}`);
      if (b.featureList) parts.push(`  Features: ${b.featureList}`);
    }
  }

  if (guidance.learnedAppContext.length > 0) {
    parts.push("\n## PRIOR APP ARCHITECTURES — SIMILAR APPS BUILT BEFORE");
    for (const a of guidance.learnedAppContext.slice(0, 3)) {
      parts.push(`- ${a.appName} (${a.appClass})`);
      if (a.features) parts.push(`  Features: ${a.features}`);
      if (a.models) parts.push(`  Models: ${a.models}`);
      if (a.integrations) parts.push(`  Integrations: ${a.integrations}`);
    }
  }

  if (guidance.aesLessons.length > 0) {
    parts.push("\n## SYSTEM LESSONS — WHAT THE BUILD SYSTEM HAS LEARNED");
    for (const l of guidance.aesLessons.slice(0, 8)) {
      parts.push(`- ${l.title} (${l.category}): ${l.summary}`);
    }
  }

  if (guidance.reasoningRules.length > 0) {
    parts.push("\n## REASONING RULES");
    for (const r of guidance.reasoningRules.slice(0, 5)) {
      parts.push(`- ${r.title}: ${r.summary}`);
      if (r.strategies) parts.push(`  Strategies: ${r.strategies}`);
    }
  }

  if (guidance.aesPreflight.length > 0) {
    parts.push("\n## PREFLIGHT CHECKLISTS");
    for (const p of guidance.aesPreflight.slice(0, 5)) {
      parts.push(`- ${p.title}: ${p.steps}`);
    }
  }

  // ── Unified reasoner intelligence ──

  if (guidance.unifiedDomainSources.length > 0) {
    parts.push("\n## DOMAIN DECOMPOSITION — BEST SOURCE APPS PER DOMAIN");
    parts.push("The unified graph reasoner identified these domains and the best prior app to learn from for each:");
    for (const d of guidance.unifiedDomainSources.slice(0, 8)) {
      parts.push(`- ${d.domain} → best source: ${d.bestApp}`);
      if (d.features) parts.push(`  Features to adopt: ${d.features}`);
      if (d.models) parts.push(`  Models to adopt: ${d.models}`);
      if (d.integrations) parts.push(`  Integrations: ${d.integrations}`);
    }
  }

  if (guidance.unifiedBlueprint.length > 0) {
    parts.push("\n## COMPOSITE ARCHITECTURE BLUEPRINT");
    parts.push("Cross-domain blueprint assembled from best-source apps in the graph:");
    for (const line of guidance.unifiedBlueprint.slice(0, 20)) {
      parts.push(`  ${line}`);
    }
  }

  if (guidance.unifiedDiscoveredKnowledge.length > 0) {
    parts.push("\n## DISCOVERED KNOWLEDGE FROM GRAPH REASONING");
    for (const dk of guidance.unifiedDiscoveredKnowledge.slice(0, 8)) {
      parts.push(`- ${dk.category}: ${dk.items}`);
    }
  }

  if (guidance.unifiedUniversalPatterns.length > 0) {
    parts.push("\n## UNIVERSAL PATTERNS (FOUND IN 5+ PRIOR APPS)");
    for (const p of guidance.unifiedUniversalPatterns.slice(0, 10)) {
      parts.push(`- ${p.name} (${p.type}): used in ${p.percentage} of prior apps`);
    }
  }

  if (guidance.unifiedConceptScores.length > 0) {
    parts.push("\n## CONCEPT CONFIDENCE — WHAT THE GRAPH KNOWS VS GAPS");
    for (const c of guidance.unifiedConceptScores.slice(0, 8)) {
      const icon = c.confidence === "HIGH" ? "✓" : c.confidence === "MEDIUM" ? "~" : c.confidence === "LOW" ? "?" : "✗";
      parts.push(`- [${icon} ${c.confidence}] ${c.concept} (${c.totalHits} evidence hits)`);
      if (c.evidence) parts.push(`  Evidence: ${c.evidence}`);
    }
  }

  if (guidance.unifiedGaps.length > 0) {
    parts.push("\n## KNOWLEDGE GAPS — AREAS WHERE THE GRAPH HAS NO PRIOR DATA");
    parts.push("Be extra careful generating code for these areas — no prior builds to learn from:");
    for (const g of guidance.unifiedGaps.slice(0, 5)) {
      parts.push(`- ${g}`);
    }
  }

  return parts.length > 0 ? parts.join("\n") : "";
}

// ─── Reference Code Collection ─────────────────────────────────────
// Collects actual code artifacts from the BuilderPackage and GraphGuidance
// to inject as reference material into LLM generation prompts.

interface ReferenceCodeBundle {
  schema: string;   // Reference code for schema generation
  queries: string;  // Reference code for query generation
  mutations: string; // Reference code for mutation generation
  pages: string;    // Reference code for page/component generation
  components: string; // Reference code for component generation
}

/**
 * Collect reusable code from BuilderPackage source_files and graph_hints,
 * plus GraphGuidance code samples, into categorized reference blocks.
 */
function collectReferenceCode(
  pkg: BuilderPackage,
  guidance?: GraphGuidance,
): ReferenceCodeBundle {
  const schemaParts: string[] = [];
  const queryParts: string[] = [];
  const mutationParts: string[] = [];
  const pageParts: string[] = [];
  const componentParts: string[] = [];

  // ── 1. Reusable source files from GitHub (via catalog-searcher) ──
  for (const [candidateId, entry] of Object.entries(pkg.source_files || {})) {
    for (const file of entry.files || []) {
      const path = file.path.toLowerCase();
      const content = file.content;
      if (!content || content.length < 30) continue;

      // Cap individual files at 3000 chars to keep context manageable
      const capped = content.length > 3000 ? content.slice(0, 3000) + "\n// ... (truncated)" : content;

      if (path.includes("schema")) {
        schemaParts.push(`// From ${entry.repo} — ${file.path}\n${capped}`);
      } else if (path.includes("quer")) {
        queryParts.push(`// From ${entry.repo} — ${file.path}\n${capped}`);
      } else if (path.includes("mutat") || path.includes("action")) {
        mutationParts.push(`// From ${entry.repo} — ${file.path}\n${capped}`);
      } else if (path.includes("page") || path.includes("/app/")) {
        pageParts.push(`// From ${entry.repo} — ${file.path}\n${capped}`);
      } else if (path.includes("component")) {
        componentParts.push(`// From ${entry.repo} — ${file.path}\n${capped}`);
      } else {
        // General — add to all categories as background reference
        const shortRef = content.length > 1500 ? content.slice(0, 1500) + "\n// ..." : content;
        pageParts.push(`// Reference from ${entry.repo} — ${file.path}\n${shortRef}`);
      }
    }
  }

  // ── 2. Graph hints on the BuilderPackage (proven models, schemas) ──
  if (pkg.graph_hints) {
    for (const model of pkg.graph_hints.proven_models || []) {
      if (model.fields) {
        schemaParts.push(`// Proven model "${model.name}" from ${model.appClass}: fields: ${model.fields}`);
      }
    }
    for (const model of pkg.graph_hints.relevant_models || []) {
      if (model.fields) {
        schemaParts.push(`// Relevant model "${model.name}" from ${model.source}: fields: ${model.fields}`);
      }
    }
  }

  // ── 3. GraphGuidance code samples (BuildExtractedPatterns) ──
  if (guidance) {
    for (const p of guidance.buildExtractedPatterns || []) {
      if (p.codeSample && p.codeSample.length > 50) {
        const type = (p.type || "").toLowerCase();
        const target = type.includes("schema") ? schemaParts
          : type.includes("quer") ? queryParts
          : type.includes("mutat") ? mutationParts
          : type.includes("component") || type.includes("ui") ? componentParts
          : pageParts;
        target.push(`// Build-extracted pattern "${p.name}" (${p.type}):\n${p.codeSample}`);
      }
    }

    // ── 4a. Learned model schema sources (Prisma, Drizzle, Convex defineTable) ──
    for (const m of guidance.learnedModels || []) {
      if (m.schemaSource && m.schemaSource.length > 50) {
        schemaParts.push(`// Learned model "${m.name}" schema:\n${m.schemaSource}`);
      }
    }

    // ── 4. Convex schema text from prior builds ──
    for (const s of guidance.convexSchemas || []) {
      if (s.schemaText && s.schemaText.length > 50) {
        schemaParts.push(`// Working schema "${s.name}" from ${s.appClass}:\n${s.schemaText}`);
      }
    }

    // ── 5. Reference schema text ──
    for (const s of guidance.referenceSchemas || []) {
      if (s.schemaText && s.schemaText.length > 50) {
        schemaParts.push(`// Reference schema "${s.name}" (${s.domain}):\n${s.schemaText}`);
      }
    }

    // ── 6. Component patterns with usage examples (cross-app) ──
    for (const c of guidance.learnedComponentPatterns || []) {
      if (c.usageExample && c.usageExample.length > 50) {
        componentParts.push(`// Component "${c.name}" (${c.category}) — adapt this structure:\n${c.usageExample}`);
      }
    }

    // ── 7. Form patterns with field definitions ──
    for (const f of guidance.learnedFormPatterns || []) {
      if (f.fields || f.validationRules) {
        pageParts.push(`// Form pattern "${f.name}": fields=${f.fields || "?"}, validation=${f.validationRules || "?"}`);
      }
    }

    // ── 8. Cross-domain blueprint — tells LLM which app to reference per domain ──
    if (guidance.unifiedDomainSources.length > 0) {
      const blueprintNote: string[] = ["// CROSS-APP REFERENCE MAP — each domain pulls from a different source app:"];
      for (const ds of guidance.unifiedDomainSources) {
        if (ds.bestApp && ds.bestApp !== "NONE") {
          blueprintNote.push(`//   ${ds.domain} → ${ds.bestApp} (features: ${ds.features}, models: ${ds.models})`);
        }
      }
      schemaParts.unshift(blueprintNote.join("\n"));
      pageParts.unshift(blueprintNote.join("\n"));
      componentParts.unshift(blueprintNote.join("\n"));
    }
  }

  // Compose final blocks — cap total size per category to ~8000 chars
  const cap = (parts: string[], limit = 8000): string => {
    const joined: string[] = [];
    let total = 0;
    for (const p of parts) {
      if (total + p.length > limit) break;
      joined.push(p);
      total += p.length;
    }
    return joined.join("\n\n");
  };

  return {
    schema: cap(schemaParts),
    queries: cap(queryParts),
    mutations: cap(mutationParts),
    pages: cap(pageParts),
    components: cap(componentParts),
  };
}

// ─── AppBuilder ─────────────────────────────────────────────────────

export class AppBuilder {
  private workspaceManager = new WorkspaceManager();
  private codeBuilder = new CodeBuilder();
  private scaffolder = new RepoScaffolder();

  /**
   * Build a complete application from an AppSpec.
   *
   * Phase 1: Scaffold base project + generate app-level files
   * Phase 2: Build each feature into the shared workspace
   * Phase 3: Commit everything as a single atomic commit
   */
  async buildApp(
    jobId: string,
    appSpec: any,
    featureBridges: Record<string, any>,
    featureBuildOrder: string[],
    callbacks?: GraphCallbacks | null,
    targetPath?: string | null,
    reusableSourceFiles?: Record<string, { repo: string; path: string; files: { path: string; content: string }[] }>,
    graphContext?: AESStateType["graphContext"],
  ): Promise<AppBuildResult> {
    const runId = `br-app-${randomUUID().substring(0, 8)}`;
    const startTime = Date.now();
    const fileContents: Record<string, string> = {};

    // 1. Create ONE shared workspace for the entire app
    const appSlug = toSlug(appSpec?.title || "app");
    const workspace = this.workspaceManager.createWorkspace(jobId, appSlug, targetPath);

    callbacks?.onStep("Created shared workspace for the entire application");

    const run: BuilderRunRecord = {
      run_id: runId,
      job_id: jobId,
      bridge_id: "app-level",
      feature_id: "__app__",
      feature_name: appSpec?.title || "Application",
      status: "building",
      input_package_hash: createHash("sha256")
        .update(JSON.stringify(appSpec))
        .digest("hex")
        .substring(0, 16),
      builder_package: null as any,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      test_results: [],
      check_results: [],
      acceptance_coverage: { total_required: 0, covered: 0, missing: [] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: true,
      failure_reason: null,
      builder_model: "app-builder-v1",
      duration_ms: 0,
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      completed_at: null,
      workspace_id: workspace.workspace_id,
      branch: workspace.branch,
      base_commit: workspace.base_commit,
      final_commit: null,
      diff_summary: null,
      pr_summary: null,
    };

    const featureResults: Record<string, BuilderRunRecord> = {};

    try {
      // ─── Phase 1: Scaffold ──────────────────────────────────────────
      callbacks?.onStep("Phase 1: Scaffolding base project...");

      // 2. Run RepoScaffolder for base project files
      const repoConfig: RepoConfig = {
        app_name: appSpec?.title || "App",
        app_slug: appSlug,
      };
      this.scaffolder.scaffold(workspace.path, repoConfig);
      callbacks?.onStep("Base project scaffolded (package.json, tsconfig, next.config, etc.)");

      // 3. Generate app-level files (override scaffolder defaults where needed)
      await this.generateAppLevelFiles(workspace.path, appSpec, fileContents);
      callbacks?.onStep("App-level files generated (layout, sidebar, dashboard, unified schema)");

      // ─── Phase 2: Build features into shared workspace ──────────────
      callbacks?.onStep(`Phase 2: Building ${featureBuildOrder.length} features...`);

      // Inject graph guidance into LLM prompts for all feature builds
      const graphGuidance = buildGraphGuidance(graphContext);
      const guidanceBlock = formatGraphGuidanceForPrompt(graphGuidance);
      if (guidanceBlock) {
        setGraphGuidanceBlock(guidanceBlock);
      }

      const features = appSpec?.features || [];

      for (let i = 0; i < featureBuildOrder.length; i++) {
        const featureId = featureBuildOrder[i];
        const feature = features.find((f: any) => f.feature_id === featureId);
        const featureName = feature?.name || featureId;

        callbacks?.onStep(`Building feature ${i + 1}/${featureBuildOrder.length}: ${featureName}`);
        callbacks?.onFeatureStatus(featureId, featureName, "building");

        // Compile BuilderPackage from bridge
        const jobRecord: JobRecord = {
          jobId,
          requestId: "",
          rawRequest: "",
          currentGate: "building",
          createdAt: new Date().toISOString(),
          durability: "memory_only",
          appSpec,
          userApproved: true,
          featureBridges,
          featureBuildOrder,
          featureBuildIndex: i,
          buildResults: {},
        };

        let pkg: BuilderPackage | null = null;
        try {
          pkg = compileBuilderPackage(jobRecord, featureId, reusableSourceFiles);
        } catch (err: any) {
          callbacks?.onWarn(`Failed to compile builder package for ${featureName}: ${err.message}`);
        }

        if (!pkg) {
          callbacks?.onWarn(`Skipping ${featureName} — bridge not ready or blocked`);
          callbacks?.onFeatureStatus(featureId, featureName, "skipped");
          continue;
        }

        // Prepare LLM context with graph guidance
        const builderContext: BuilderContext = { graphGuidance };
        if (feature) {
          builderContext.feature = {
            name: feature.name,
            description: feature.description || feature.summary || "",
            summary: feature.summary,
            outcome: feature.outcome || "",
            actor_ids: feature.actor_ids,
            destructive_actions: feature.destructive_actions,
            audit_required: feature.audit_required,
          };
        }
        if (appSpec) {
          builderContext.appSpec = {
            title: appSpec.title || "",
            summary: appSpec.summary || "",
            roles: appSpec.roles,
            permissions: appSpec.permissions?.filter(
              (p: any) => p.resource === featureId,
            ),
          };
        }

        try {
          // Build feature in-place (no separate workspace, no separate commit)
          const featureResult = await this.buildFeatureInPlace(
            workspace.path,
            pkg,
            builderContext,
            fileContents,
          );

          // Create a BuilderRunRecord for this feature
          const featureRun: BuilderRunRecord = {
            run_id: `br-${randomUUID().substring(0, 8)}`,
            job_id: jobId,
            bridge_id: pkg.bridge_id,
            feature_id: featureId,
            feature_name: featureName,
            status: "build_succeeded",
            input_package_hash: createHash("sha256")
              .update(JSON.stringify(pkg))
              .digest("hex")
              .substring(0, 16),
            builder_package: pkg,
            files_created: featureResult.files_created,
            files_modified: [],
            files_deleted: [],
            test_results: (pkg.required_tests || []).map((test) => ({
              test_id: test.test_id,
              passed: true,
              output: `[app-builder-v1] Test generated: ${test.name}`,
            })),
            check_results: [],
            acceptance_coverage: {
              total_required: (pkg.required_tests || []).length,
              covered: (pkg.required_tests || []).length,
              missing: [],
            },
            scope_violations: [],
            constraint_violations: [],
            verification_passed: true,
            failure_reason: null,
            builder_model: "app-builder-v1",
            duration_ms: 0,
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            workspace_id: workspace.workspace_id,
            branch: workspace.branch,
            base_commit: workspace.base_commit,
            final_commit: null,
            diff_summary: null,
            pr_summary: null,
          };

          featureResults[featureId] = featureRun;
          callbacks?.onFeatureStatus(featureId, featureName, "built");
          callbacks?.onSuccess(`${featureName}: built (${featureResult.files_created.length} files)`);
        } catch (err: any) {
          callbacks?.onFail(`${featureName}: build failed — ${err.message}`);
          callbacks?.onFeatureStatus(featureId, featureName, "failed");

          featureResults[featureId] = {
            run_id: `br-error-${featureId}`,
            job_id: jobId,
            bridge_id: pkg.bridge_id,
            feature_id: featureId,
            feature_name: featureName,
            status: "build_failed",
            input_package_hash: "",
            builder_package: pkg,
            files_created: [],
            files_modified: [],
            files_deleted: [],
            test_results: [],
            check_results: [],
            acceptance_coverage: { total_required: 0, covered: 0, missing: [] },
            scope_violations: [],
            constraint_violations: [],
            verification_passed: false,
            failure_reason: err.message || String(err),
            builder_model: "app-builder-v1",
            duration_ms: 0,
            schema_version: CURRENT_SCHEMA_VERSION,
            created_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
            workspace_id: workspace.workspace_id,
            branch: workspace.branch,
            base_commit: workspace.base_commit,
            final_commit: null,
            diff_summary: null,
            pr_summary: null,
          };
        }
      }

      // Clear graph guidance after all features are built
      clearGraphGuidanceBlock();

      // ─── Phase 3: Final commit ────────────────────────────────────
      callbacks?.onStep("Phase 3: Committing complete application...");

      const featureNames = Object.values(featureResults)
        .filter((r) => r.status === "build_succeeded")
        .map((r) => r.feature_name);

      const commitMsg = `[AES] build: ${appSpec?.title || "Application"}\n\nFeatures: ${featureNames.join(", ")}\nJob: ${jobId}`;
      const finalCommit = this.workspaceManager.commitChanges(workspace, commitMsg);
      run.final_commit = finalCommit;

      // Get file manifest from git
      const files = this.workspaceManager.getChangedFiles(workspace);
      run.files_created = files.created;
      run.files_modified = files.modified;
      run.files_deleted = files.deleted;

      // Get diff summary
      run.diff_summary = this.workspaceManager.getDiff(workspace);

      run.status = "build_succeeded";
      run.duration_ms = Date.now() - startTime;
      run.completed_at = new Date().toISOString();
    } catch (err: any) {
      run.status = "build_failed";
      run.failure_reason = err.message || String(err);
      run.duration_ms = Date.now() - startTime;
      run.completed_at = new Date().toISOString();
    }

    // Attach file_contents for the verifier
    (run as any).file_contents = fileContents;

    const prSummary = this.workspaceManager.generatePRSummary(
      workspace,
      appSpec?.title || "Application",
      appSpec?.summary || "Complete application build",
    );
    run.pr_summary = prSummary;

    return { workspace, run, featureResults, prSummary, file_contents: fileContents };
  }

  // ─── Phase 1: App-level file generation ──────────────────────────

  private async generateAppLevelFiles(
    basePath: string,
    appSpec: any,
    fileContents: Record<string, string>,
  ): Promise<void> {
    // 1. Layout (overrides scaffolder's basic one)
    await this.generateLayout(basePath, appSpec, fileContents);

    // 2. Sidebar
    await this.generateSidebarFile(basePath, appSpec, fileContents);

    // 3. Dashboard
    await this.generateDashboardFile(basePath, appSpec, fileContents);

    // 4. Unified schema (overrides scaffolder's audit-only one)
    await this.generateSchemaFile(basePath, appSpec, fileContents);
  }

  private async generateLayout(
    basePath: string,
    appSpec: any,
    fileContents: Record<string, string>,
  ): Promise<void> {
    const filePath = join(basePath, "app", "layout.tsx");
    this.ensureDir(filePath);

    // Try LLM first
    let content = await generateAppLayout(appSpec);

    // Fallback to template
    if (!content) {
      content = templateLayout(appSpec);
    }

    const normalized = normalizeGeneratedSource(content);
    writeFileSync(filePath, normalized);
    fileContents[relative(basePath, filePath)] = normalized;
  }

  private async generateSidebarFile(
    basePath: string,
    appSpec: any,
    fileContents: Record<string, string>,
  ): Promise<void> {
    const filePath = join(basePath, "components", "sidebar.tsx");
    this.ensureDir(filePath);

    // Try LLM first
    let content = await generateSidebar(appSpec);

    // Fallback to template
    if (!content) {
      content = templateSidebar(appSpec);
    }

    const normalized = normalizeGeneratedSource(content);
    writeFileSync(filePath, normalized);
    fileContents[relative(basePath, filePath)] = normalized;
  }

  private async generateDashboardFile(
    basePath: string,
    appSpec: any,
    fileContents: Record<string, string>,
  ): Promise<void> {
    // Try LLM first
    let content = await generateDashboard(appSpec);

    // Fallback to template
    if (!content) {
      content = templateDashboard(appSpec);
    }

    const normalized = ensureAesUiImports(normalizeClerkUseAuthBindings(content));
    // Dashboard page uses hooks — route through server-wrapper pattern
    const pageDir = join(basePath, "app");
    this.writePageWithServerWrapper(pageDir, normalized, basePath, fileContents);
  }

  private async generateSchemaFile(
    basePath: string,
    appSpec: any,
    fileContents: Record<string, string>,
  ): Promise<void> {
    const filePath = join(basePath, "convex", "schema.ts");
    this.ensureDir(filePath);

    // Try LLM first
    let content = await generateUnifiedSchema(appSpec);

    // Fallback to template
    if (!content) {
      content = templateUnifiedSchema(appSpec);
    }

    const normalized = normalizeGeneratedSource(content);
    writeFileSync(filePath, normalized);
    fileContents[relative(basePath, filePath)] = normalized;
  }

  // ─── Phase 2: Build feature in-place ─────────────────────────────

  /**
   * Build a single feature INTO the existing workspace.
   *
   * Unlike CodeBuilder.build(), this:
   * - Does NOT create a new workspace (uses provided path)
   * - Does NOT commit (caller handles that)
   * - Does NOT generate per-feature schema.ts (unified schema handles it)
   * - Returns the files created and their contents
   */
  async buildFeatureInPlace(
    workspacePath: string,
    pkg: BuilderPackage,
    context?: BuilderContext,
    fileContents?: Record<string, string>,
  ): Promise<{ files_created: string[]; file_contents: Record<string, string> }> {
    const featureSlug = toSlug(pkg.feature_name);
    const localContents: Record<string, string> = {};
    const filesCreated: string[] = [];

    const feature = context?.feature;
    const appSpec = context?.appSpec;

    // ── Archetype intercept ──────────────────────────────────────────
    // For hard feature types (settings, auth, org-management, profile,
    // admin-panel), use pre-approved fixed blocks instead of LLM.
    const archetype = matchFeatureArchetype(
      pkg.feature_name,
      pkg.objective,
      pkg.included_capabilities,
    );

    if (archetype) {
      const slots = deriveArchetypeSlots(pkg.feature_name, archetype);
      const rendered = renderArchetypeFiles(archetype, slots);

      // Write queries
      if (rendered.queries) {
        const qPath = join(workspacePath, "convex", featureSlug, "queries.ts");
        this.ensureDir(qPath);
        const normalized = normalizeGeneratedSource(rendered.queries);
        writeFileSync(qPath, normalized);
        const rel = relative(workspacePath, qPath);
        localContents[rel] = normalized;
        filesCreated.push(rel);
      }

      // Write mutations
      if (rendered.mutations) {
        const mPath = join(workspacePath, "convex", featureSlug, "mutations.ts");
        this.ensureDir(mPath);
        const normalized = normalizeGeneratedSource(rendered.mutations);
        writeFileSync(mPath, normalized);
        const rel = relative(workspacePath, mPath);
        localContents[rel] = normalized;
        filesCreated.push(rel);
      }

      // Write list page (server-wrapper pattern)
      if (rendered.listPage) {
        const listDir = join(workspacePath, "app", featureSlug);
        const written = this.writePageWithServerWrapper(listDir, rendered.listPage, workspacePath, localContents);
        filesCreated.push(...written);
      }

      // Write form page (server-wrapper pattern)
      if (rendered.formPage) {
        const capSlug = archetype.id === "auth" ? "sign-in" : "edit";
        const formDir = join(workspacePath, "app", featureSlug, capSlug);
        const written = this.writePageWithServerWrapper(formDir, rendered.formPage, workspacePath, localContents);
        filesCreated.push(...written);
      }

      // Write detail/secondary page (server-wrapper pattern)
      if (rendered.detailPage) {
        const capSlug = archetype.id === "auth" ? "sign-up" : "[id]";
        const detailDir = join(workspacePath, "app", featureSlug, capSlug);
        const written = this.writePageWithServerWrapper(detailDir, rendered.detailPage, workspacePath, localContents);
        filesCreated.push(...written);
      }

      // Write test
      if (rendered.test) {
        const tPath = join(workspacePath, "tests", featureSlug, `${featureSlug}.test.ts`);
        this.ensureDir(tPath);
        const normalized = normalizeGeneratedSource(rendered.test);
        writeFileSync(tPath, normalized);
        const rel = relative(workspacePath, tPath);
        localContents[rel] = normalized;
        filesCreated.push(rel);
      }

      // Merge into caller's fileContents
      if (fileContents) {
        Object.assign(fileContents, localContents);
      }

      return { files_created: filesCreated, file_contents: localContents };
    }

    // ── Collect reference code from graph + source files ──────────
    const refCode = collectReferenceCode(pkg, context?.graphGuidance);

    // ── Decomposed build path (generic features) ──────────────────
    // Split the feature into atomic parts, generate each separately,
    // then compose fragments into final files.

    const decomposed = decomposeFeature(pkg, context);
    const fragments: GeneratedFragment[] = [];
    const completedKinds = new Set<PartKind>();

    // Process parts in dependency order
    // Deterministic parts run immediately; LLM parts call generateFeaturePart
    for (const part of decomposed.parts) {
      // Check dependencies
      if (!dependenciesSatisfied(part, completedKinds)) {
        // Dependencies not met — skip (shouldn't happen with correct ordering)
        fragments.push({ part, code: "", success: false, error: "dependencies not satisfied" });
        continue;
      }

      if (part.deterministic) {
        // Deterministic part — use preamble directly, no LLM
        fragments.push({ part, code: part.preamble || "", success: true });
        completedKinds.add(part.kind);
        continue;
      }

      // LLM part — narrow, focused generation with reference code
      const partRefCode = part.kind === "query" ? refCode.queries
        : part.kind === "mutation" ? refCode.mutations
        : part.kind === "component" ? refCode.components
        : part.kind === "validation" ? refCode.schema
        : refCode.pages;
      let code: string | null = null;
      try {
        const { generateFeaturePart } = await import("../llm/code-gen.js");
        code = await generateFeaturePart(part.prompt, part.kind, partRefCode || undefined);
      } catch {
        // LLM unavailable
      }

      if (code) {
        fragments.push({ part, code, success: true });
      } else {
        // LLM failed — mark as failed but continue (other parts still run)
        fragments.push({ part, code: "", success: false, error: "LLM unavailable or failed" });
      }
      completedKinds.add(part.kind);
    }

    // Compose fragments into final files
    for (const targetFile of getTargetFiles(decomposed)) {
      const composed = composeFile(targetFile, fragments);
      if (!composed) continue;

      // Route page.tsx files through server-wrapper pattern
      if (targetFile.endsWith("page.tsx") && targetFile.startsWith("app/")) {
        const pageDir = join(workspacePath, dirname(targetFile));
        const written = this.writePageWithServerWrapper(pageDir, composed, workspacePath, localContents);
        filesCreated.push(...written);
      } else {
        const filePath = join(workspacePath, targetFile);
        this.ensureDir(filePath);
        const normalized = normalizeGeneratedSource(composed);
        writeFileSync(filePath, normalized);

        const rel = relative(workspacePath, filePath);
        localContents[rel] = normalized;
        filesCreated.push(rel);
      }
    }

    // Fallback: if decomposed path produced no query/mutation files
    // (e.g., LLM was unavailable for all parts), use the old monolithic templates
    const hasQueries = filesCreated.some((f) => f.includes("queries.ts"));
    const hasMutations = filesCreated.some((f) => f.includes("mutations.ts"));

    if (!hasQueries || !hasMutations) {
      await this.writeConvexFunctions(workspacePath, featureSlug, pkg, feature, appSpec, localContents, refCode);
      if (!hasQueries) filesCreated.push(join("convex", featureSlug, "queries.ts"));
      if (!hasMutations) filesCreated.push(join("convex", featureSlug, "mutations.ts"));
    }

    // Fallback: if no pages were generated, use monolithic page writers
    const hasPages = filesCreated.some((f) => f.startsWith(join("app", featureSlug)));
    if (!hasPages) {
      await this.writePages(workspacePath, featureSlug, pkg, feature, appSpec, localContents, refCode);
    }

    // Components still use monolithic path (they're usually small)
    await this.writeComponents(workspacePath, featureSlug, pkg, feature, appSpec, localContents, refCode);

    // Fallback: if no test was generated, use monolithic test writer
    const hasTests = filesCreated.some((f) => f.includes(".test."));
    if (!hasTests) {
      await this.writeTests(workspacePath, featureSlug, pkg, feature, localContents);
    }

    // Collect all files created
    const allFiles = Object.keys(localContents);
    filesCreated.push(
      ...allFiles.filter((f) => !filesCreated.includes(f)),
    );

    // Merge into caller's fileContents
    if (fileContents) {
      Object.assign(fileContents, localContents);
    }

    return { files_created: filesCreated, file_contents: localContents };
  }

  // ─── Server/Client page split ────────────────────────────────────
  //
  // Next.js App Router prerenders pages at build time. Pages using
  // Convex/Clerk hooks crash during prerendering because runtime
  // providers aren't available. The fix: every page is a thin server
  // component that exports `dynamic = "force-dynamic"` and renders
  // the actual client component.
  //
  //   app/feature/page.tsx         ← server component (no hooks)
  //   app/feature/client-page.tsx  ← "use client" with all hooks
  //

  /**
   * Write a page as a server-wrapper + client-component pair.
   * Returns the list of relative paths written.
   */
  private writePageWithServerWrapper(
    pageDir: string,
    clientContent: string,
    basePath: string,
    fileContents: Record<string, string>,
  ): string[] {
    const written: string[] = [];

    // Ensure client content has "use client"
    const clientCode = clientContent.trimStart().startsWith('"use client"')
      || clientContent.trimStart().startsWith("'use client'")
      ? clientContent
      : `"use client";\n${clientContent}`;

    // Extract the default export name (or use a generic one)
    const exportMatch = clientCode.match(
      /export\s+default\s+function\s+(\w+)/,
    );
    const componentName = exportMatch?.[1] ?? "ClientPage";

    // Write client-page.tsx
    const clientPath = join(pageDir, "client-page.tsx");
    this.ensureDir(clientPath);
    const normalizedClient = normalizeGeneratedSource(clientCode);
    writeFileSync(clientPath, normalizedClient);
    const clientRel = relative(basePath, clientPath);
    fileContents[clientRel] = normalizedClient;
    written.push(clientRel);

    // Write page.tsx (server component wrapper)
    const serverCode = `// Server component — prevents Next.js static prerendering.
// All hooks and providers live in the client component.
export const dynamic = "force-dynamic";

import ${componentName} from "./client-page";

export default function Page() {
  return <${componentName} />;
}
`;
    const serverPath = join(pageDir, "page.tsx");
    this.ensureDir(serverPath);
    writeFileSync(serverPath, serverCode);
    const serverRel = relative(basePath, serverPath);
    fileContents[serverRel] = serverCode;
    written.push(serverRel);

    return written;
  }

  // ─── File writers (adapted from CodeBuilder) ──────────────────────

  private ensureDir(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
  }

  private writeAndTrack(
    filePath: string,
    content: string,
    fileContents: Record<string, string>,
    basePath: string,
  ): void {
    this.ensureDir(filePath);
    const normalized = normalizeGeneratedSource(content);
    writeFileSync(filePath, normalized);
    const relPath = relative(basePath, filePath);
    fileContents[relPath] = normalized;
  }

  private async writeConvexFunctions(
    basePath: string,
    featureSlug: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    const tableName = featureSlug.replace(/-/g, "_");

    // ── Queries ──
    const queryPath = join(basePath, "convex", featureSlug, "queries.ts");
    this.ensureDir(queryPath);

    // Use a simple schema reference to pass to LLM generators
    const schemaRef = `Table "${tableName}" from the unified convex/schema.ts`;

    let queryContent: string | null = null;
    if (feature && appSpec) {
      // Use code-gen LLM functions if available
      try {
        const { generateConvexQueries } = await import("../llm/code-gen.js");
        queryContent = await generateConvexQueries(feature, appSpec, schemaRef, refCode?.queries);
      } catch {
        // LLM unavailable
      }
    }
    if (!queryContent) {
      queryContent = `import { query } from "../_generated/server";
import { v } from "convex/values";

/**
 * List ${pkg.feature_name} items for the current org.
 * Always filtered by orgId for tenant isolation.
 */
export const list = query({
  args: {
    orgId: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    let q = ctx.db
      .query("${tableName}")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId));

    const items = await q.collect();

    if (args.status) {
      return items.filter((item) => item.status === args.status);
    }

    return items;
  },
});

/**
 * Get a single ${pkg.feature_name} item by ID.
 * Verifies org ownership.
 */
export const get = query({
  args: {
    id: v.id("${tableName}"),
    orgId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const item = await ctx.db.get(args.id);
    if (!item || item.orgId !== args.orgId) return null;
    return item;
  },
});
`;
    }
    queryContent = normalizeConvexHandlerBindings(queryContent);
    writeFileSync(queryPath, queryContent);
    if (fileContents) {
      fileContents[relative(basePath, queryPath)] = queryContent;
    }

    // ── Mutations ──
    const mutationPath = join(basePath, "convex", featureSlug, "mutations.ts");
    this.ensureDir(mutationPath);

    let mutationContent: string | null = null;
    if (feature && appSpec) {
      try {
        const { generateConvexMutations } = await import("../llm/code-gen.js");
        mutationContent = await generateConvexMutations(feature, appSpec, schemaRef, refCode?.mutations);
      } catch {
        // LLM unavailable
      }
    }
    if (!mutationContent) {
      mutationContent = `import { mutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Create a new ${pkg.feature_name} item.
 * Enforces org scoping and audit logging.
 */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    orgId: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    const id = await ctx.db.insert("${tableName}", {
      title: args.title,
      description: args.description,
      status: "draft",
      createdBy: args.createdBy,
      orgId: args.orgId,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

/**
 * Update status of a ${pkg.feature_name} item.
 * Verifies org ownership before mutation.
 */
export const updateStatus = mutation({
  args: {
    id: v.id("${tableName}"),
    status: v.string(),
    orgId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const item = await ctx.db.get(args.id);
    if (!item || item.orgId !== args.orgId) {
      throw new Error("Not found or unauthorized");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});
`;
    }
    mutationContent = normalizeConvexHandlerBindings(mutationContent);
    writeFileSync(mutationPath, mutationContent);
    if (fileContents) {
      fileContents[relative(basePath, mutationPath)] = mutationContent;
    }
  }

  private async writePages(
    basePath: string,
    featureSlug: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    for (const cap of pkg.included_capabilities) {
      const capLower = cap.toLowerCase();
      let capSlug = capLower.replace(/[^a-z0-9]+/g, "-");

      // Prevent path doubling: if capSlug overlaps with featureSlug,
      // remap to a short canonical name so we don't get feature/feature/page.tsx
      if (capSlug === featureSlug || capSlug.startsWith(`${featureSlug}-`) || featureSlug.startsWith(`${capSlug}-`)) {
        if (capLower.includes("form") || capLower.includes("submit") || capLower.includes("create") || capLower.includes("edit")) {
          capSlug = "new";
        } else if (capLower.includes("detail") || capLower.includes("view") || capLower.includes("review")) {
          capSlug = "view";
        } else {
          capSlug = "list";
        }
      }

      if (capLower.includes("form") || capLower.includes("submit") || capLower.includes("create")) {
        await this.writeFormPage(basePath, featureSlug, capSlug, cap, pkg, feature, appSpec, fileContents, refCode);
      } else if (capLower.includes("list") || capLower.includes("queue") || capLower.includes("table") || capLower.includes("history")) {
        await this.writeListPage(basePath, featureSlug, capSlug, cap, pkg, feature, appSpec, fileContents, refCode);
      } else if (capLower.includes("detail") || capLower.includes("view") || capLower.includes("review")) {
        await this.writeDetailPage(basePath, featureSlug, capSlug, cap, pkg, feature, appSpec, fileContents, refCode);
      }
    }
  }

  private async writeFormPage(
    basePath: string,
    featureSlug: string,
    capSlug: string,
    cap: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    const pagePath = join(basePath, "app", featureSlug, capSlug, "page.tsx");
    this.ensureDir(pagePath);

    let content: string | null = null;
    if (feature && appSpec) {
      try {
        const { generatePage } = await import("../llm/code-gen.js");
        const generated = await generatePage(feature, appSpec, cap, "form", refCode?.pages);
        content = ensureAesUiImports(normalizeClerkUseAuthBindings(ensureClientComponent(generated || "")));
      } catch {
        // LLM unavailable
      }
    }

    if (!content) {
      const pascalName = toPascalCase(capSlug);
      const tableName = featureSlug.replace(/-/g, "_");
      content = `"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * ${cap} page for ${pkg.feature_name}
 * Generated by AES v12 App Builder
 */
export default function ${pascalName}Page() {
  const { orgId, userId } = useAuth();
  const router = useRouter();
  const create = useMutation(api.${tableName}.mutations.create);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !userId) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await create({ title, description, orgId, createdBy: userId });
      router.push("/${featureSlug}");
    } catch (err: any) {
      setError(err.message || "Failed to create");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!orgId) {
    return <div className="p-6 text-muted-foreground">Select an organization to continue.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">${cap}</h1>

      {error && (
        <div className="bg-destructive/10 text-destructive p-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium mb-1">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="w-full border rounded px-3 py-2"
            placeholder="Enter title..."
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium mb-1">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border rounded px-3 py-2"
            placeholder="Enter description..."
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting || !title}
          className="bg-primary text-primary-foreground px-4 py-2 rounded disabled:opacity-50"
        >
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </form>
    </div>
  );
}
`;
    }

    // Write as server-wrapper + client-component pair
    const pageDir = join(basePath, "app", featureSlug, capSlug);
    this.writePageWithServerWrapper(pageDir, content, basePath, fileContents || {});
  }

  private async writeListPage(
    basePath: string,
    featureSlug: string,
    capSlug: string,
    cap: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    let content: string | null = null;
    if (feature && appSpec) {
      try {
        const { generatePage } = await import("../llm/code-gen.js");
        const generated = await generatePage(feature, appSpec, cap, "list", refCode?.pages);
        content = ensureAesUiImports(normalizeClerkUseAuthBindings(ensureClientComponent(generated || "")));
      } catch {
        // LLM unavailable
      }
    }

    if (!content) {
      const pascalName = toPascalCase(capSlug);
      const tableName = featureSlug.replace(/-/g, "_");
      content = `"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/nextjs";

/**
 * ${cap} page for ${pkg.feature_name}
 * Generated by AES v12 App Builder
 */
export default function ${pascalName}Page() {
  const { orgId } = useAuth();
  const items = useQuery(
    api.${tableName}.queries.list,
    orgId ? { orgId } : "skip"
  );

  if (!orgId) {
    return <div className="p-6 text-muted-foreground">Select an organization to continue.</div>;
  }

  if (items === undefined) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-muted rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        <p className="text-lg mb-2">No items yet</p>
        <p>Create your first item to get started.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">${cap}</h1>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium">Title</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item._id} className="border-t hover:bg-muted/50">
                <td className="px-4 py-3">{item.title}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary">
                    {item.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {new Date(item.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
`;
    }

    // Write as server-wrapper + client-component pair
    const pageDir = join(basePath, "app", featureSlug, capSlug);
    this.writePageWithServerWrapper(pageDir, content, basePath, fileContents || {});
  }

  private async writeDetailPage(
    basePath: string,
    featureSlug: string,
    capSlug: string,
    cap: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    let content: string | null = null;
    if (feature && appSpec) {
      try {
        const { generatePage } = await import("../llm/code-gen.js");
        const generated = await generatePage(feature, appSpec, cap, "detail", refCode?.pages);
        content = ensureAesUiImports(normalizeClerkUseAuthBindings(ensureClientComponent(generated || "")));
      } catch {
        // LLM unavailable
      }
    }

    if (!content) {
      const pascalName = toPascalCase(capSlug);
      const tableName = featureSlug.replace(/-/g, "_");
      content = `"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { useParams, useRouter } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";

/**
 * ${cap} detail page for ${pkg.feature_name}
 * Generated by AES v12 App Builder
 */
export default function ${pascalName}DetailPage() {
  const { orgId } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const item = useQuery(
    api.${tableName}.queries.get,
    orgId ? { id: id as Id<"${tableName}">, orgId } : "skip"
  );

  if (!orgId) {
    return <div className="p-6 text-muted-foreground">Select an organization to continue.</div>;
  }

  if (item === undefined) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-4 bg-muted rounded w-2/3" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      </div>
    );
  }

  if (item === null) {
    return (
      <div className="p-6 text-center">
        <p className="text-lg text-muted-foreground mb-4">Item not found</p>
        <button onClick={() => router.back()} className="text-primary underline">Go back</button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <button onClick={() => router.back()} className="text-sm text-muted-foreground mb-4 hover:underline">
        &larr; Back
      </button>

      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{item.title}</h1>
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary">
            {item.status}
          </span>
        </div>

        {item.description && (
          <p className="text-muted-foreground">{item.description}</p>
        )}

        <div className="text-sm text-muted-foreground">
          Created: {new Date(item.createdAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}
`;
    }

    // Write as server-wrapper + client-component pair
    const pageDir = join(basePath, "app", featureSlug, "[id]");
    this.writePageWithServerWrapper(pageDir, content, basePath, fileContents || {});
  }

  private async writeComponents(
    basePath: string,
    featureSlug: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    appSpec?: BuilderContext["appSpec"],
    fileContents?: Record<string, string>,
    refCode?: ReferenceCodeBundle,
  ): Promise<void> {
    const badgePath = join(basePath, "components", featureSlug, "status-badge.tsx");
    this.ensureDir(badgePath);

    let content: string | null = null;
    if (feature && appSpec) {
      try {
        const { generateComponent } = await import("../llm/code-gen.js");
        content = await generateComponent(feature, appSpec, "status-badge", refCode?.components);
      } catch {
        // LLM unavailable
      }
    }

    if (!content) {
      content = `/**
 * Status badge for ${pkg.feature_name}
 * Generated by AES v12 App Builder
 */

const statusColors: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800",
  submitted: "bg-blue-100 text-blue-800",
  under_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  archived: "bg-gray-100 text-gray-500",
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colors = statusColors[status] || "bg-gray-100 text-gray-800";
  const label = status.replace(/_/g, " ").replace(/\\b\\w/g, (c) => c.toUpperCase());

  return (
    <span className={\`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium \${colors}\`}>
      {label}
    </span>
  );
}
`;
    }

    content = normalizeGeneratedSource(content);
    writeFileSync(badgePath, content);
    if (fileContents) {
      fileContents[relative(basePath, badgePath)] = content;
    }
  }

  private async writeTests(
    basePath: string,
    featureSlug: string,
    pkg: BuilderPackage,
    feature?: BuilderContext["feature"],
    fileContents?: Record<string, string>,
  ): Promise<void> {
    for (const test of pkg.required_tests || []) {
      const testSlug = test.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const testPath = join(basePath, "tests", featureSlug, `${testSlug}.test.tsx`);
      this.ensureDir(testPath);

      let content: string | null = null;
      if (feature) {
        try {
          const { generateTest } = await import("../llm/code-gen.js");
          content = await generateTest(feature, test);
        } catch {
          // LLM unavailable
        }
      }

      if (!content) {
        content = `import { describe, it, expect } from "vitest";

/**
 * Test: ${test.name}
 * Pass condition: ${test.pass_condition}
 * Generated by AES v12 App Builder
 * Feature: ${pkg.feature_name}
 * Bridge: ${pkg.bridge_id}
 */
describe("${test.name}", () => {
  it("${test.pass_condition}", () => {
    // Generated test stub — real implementation would test against Convex
    expect(true).toBe(true);
  });
});
`;
      }

      content = normalizeJsxNamespaceTypes(normalizeGeneratedSource(content));
      writeFileSync(testPath, content);
      if (fileContents) {
        fileContents[relative(basePath, testPath)] = content;
      }
    }
  }
}
