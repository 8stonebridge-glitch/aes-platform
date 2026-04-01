/**
 * LLM-powered generation for app-level files (layout, sidebar, dashboard, unified schema).
 *
 * Each function tries the LLM first; returns null when the model is
 * unavailable so the caller can fall back to its template path.
 */

import { getLLM, isLLMAvailable, safeLLMCall } from "./provider.js";
import { getGenerationGroundTruthForPacks } from "./current-api-context.js";
import type { FrameworkContractPackId } from "../contracts/framework-contract-layer.js";

// ─── Shared helpers ──────────────────────────────────────────────────

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  contractPackIds: FrameworkContractPackId[] = [],
): Promise<string | null> {
  if (!isLLMAvailable()) return null;

  const llm = getLLM();
  if (!llm) return null;
  const groundTruth = await getGenerationGroundTruthForPacks(contractPackIds);

  const response = await safeLLMCall("app-gen", () =>
    llm.invoke([
      { role: "system", content: `${groundTruth}\n\n${systemPrompt}` },
      { role: "user", content: userPrompt },
    ])
  );

  if (!response) return null;

  const text = typeof response.content === "string"
    ? response.content
    : String(response.content);

  // Strip markdown fences if present
  return text
    .replace(/^```(?:typescript|tsx|ts|jsx)?\\n?/m, "")
    .replace(/\\n?```\\s*$/m, "")
    .trim();
}

const STACK_PREAMBLE = `You are generating code for a Next.js 15 + Clerk + Convex + Tailwind CSS application.

Treat these library contracts as exact ground truth, not suggestions:
- Clerk client contract: import useAuth from "@clerk/nextjs" only inside client components. useAuth() is a client hook and should destructure orgId, userId, isLoaded, isSignedIn, sessionId, orgRole, or orgSlug when needed. Never destructure org from useAuth().
- Clerk server contract: import auth, currentUser, or clerkMiddleware from "@clerk/nextjs/server" only in server files. Use await auth() in server components, route handlers, and server actions. Never use useAuth() in a server file. If middleware is generated, use clerkMiddleware and never use authMiddleware or withClerkMiddleware.
- Convex server contract: import query and mutation from "./_generated/server" and validators from "convex/values". Always write query({ args: { ... }, handler: async (ctx, args) => { ... } }) or mutation({ args: { ... }, handler: async (ctx, args) => { ... } }). Never destructure handler args directly in the function signature.
- Convex auth contract: if a Convex server function needs auth, call const identity = await ctx.auth.getUserIdentity(); and handle the null case before reading identity.subject or any custom claims.
- Convex client contract: import useQuery, useMutation, useAction, or usePaginatedQuery from "convex/react" only inside client components, and use api from "@/convex/_generated/api".
- Next.js App Router contract: any file using useAuth(), next/navigation hooks, or convex/react hooks must begin with "use client" on line 1.
- TypeScript contract: never emit implicit-any callback parameters. If a callback parameter would otherwise be untyped, annotate it explicitly or type the collection before mapping/filtering.

Do not invent older APIs, deprecated helpers, or alternative return shapes.`;

const AES_UI_RULES = `
CRITICAL: You MUST use @aes/ui components. NEVER use raw HTML elements:
- Use <Button> from "@aes/ui" instead of <button>
- Use <Input> from "@aes/ui" instead of <input>
- Use <Card>, <CardHeader>, <CardContent> from "@aes/ui" instead of raw <div> containers
- Use <Badge> from "@aes/ui" instead of custom <span> badges
- Do not pass href or as="a" to Button. If navigation is needed, wrap Button inside <a> or use router/navigation separately.
`;

// ─── Public generators ───────────────────────────────────────────────

/**
 * Generate the root layout.tsx with ClerkProvider, ConvexClientProvider, and Sidebar.
 */
export async function generateAppLayout(appSpec: any): Promise<string | null> {
  const features = appSpec?.features || [];
  const featureList = features.map((f: any) => `- ${f.name}: ${f.summary || f.description || ""}`).join("\n");

  const system = `${STACK_PREAMBLE}

You are generating the root layout.tsx for a Next.js App Router application.

App: ${appSpec?.title || "App"}
Summary: ${appSpec?.summary || ""}

Features:
${featureList}

Generate a root layout that:
1. Wraps everything in <ClerkProvider> from @clerk/nextjs
2. Inside that, wraps in <ConvexClientProvider> from "./convex-provider"
3. Renders a sidebar navigation (imported from "@/components/sidebar") on the left
4. Main content area on the right (flex layout)
5. Has proper metadata with the app title
6. Imports globals.css

Import { Sidebar } from "@/components/sidebar".
The layout must be a default export: export default function RootLayout.
Do NOT add "use client" — this is a server component.

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(system, `Generate root layout.tsx for "${appSpec?.title || "App"}".`);
}

/**
 * Generate the sidebar navigation component.
 */
export async function generateSidebar(appSpec: any): Promise<string | null> {
  const features = appSpec?.features || [];
  const featureList = features.map((f: any) => {
    const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `- ${f.name} → route: /${slug}`;
  }).join("\n");

  const system = `${STACK_PREAMBLE}
${AES_UI_RULES}

You are generating a sidebar navigation component for a Next.js application.

App: ${appSpec?.title || "App"}
Summary: ${appSpec?.summary || ""}

Features and routes:
${featureList}

Generate a "use client" sidebar component that:
1. Shows the app title at the top
2. Has a "Dashboard" link to "/" with a Home icon
3. Has a link for each feature using the route slug
4. Uses lucide-react icons (import { Home, LayoutDashboard, ... } from "lucide-react")
5. Highlights the active route using usePathname() from "next/navigation"
6. Uses Link from "next/link" for navigation
7. Has a dark background (bg-gray-950) with white text
8. Is 64 (w-64) wide and full height (min-h-screen)
9. Named export: export function Sidebar()

Output ONLY the TypeScript/JSX code, no markdown fences, no explanation.`;

  return callLLM(system, `Generate sidebar component for "${appSpec?.title || "App"}".`);
}

/**
 * Generate the dashboard/home page.
 */
export async function generateDashboard(appSpec: any): Promise<string | null> {
  const features = appSpec?.features || [];
  const featureList = features.map((f: any) => {
    const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `- ${f.name} (/${slug}): ${f.summary || f.description || ""}`;
  }).join("\n");

  const system = `${STACK_PREAMBLE}
${AES_UI_RULES}

You are generating a dashboard page for a Next.js application.

App: ${appSpec?.title || "App"}
Summary: ${appSpec?.summary || ""}

Features:
${featureList}

Generate a "use client" dashboard page that:
1. Shows a welcome message with the app title
2. Has a grid of feature cards (one per feature) that link to the feature routes
3. Each card has the feature name and a brief description
4. Uses Card, CardHeader, CardContent, and Button from @aes/ui when needed
5. Uses useAuth() from @clerk/nextjs with orgId (not org) because this is a client component
6. Has a responsive grid layout (grid-cols-1 md:grid-cols-2 lg:grid-cols-3)
7. Is a default export: export default function DashboardPage()
8. Imports every @aes/ui component it renders

Output ONLY the TypeScript/JSX code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate dashboard page for "${appSpec?.title || "App"}".`,
    ["clerk/client-auth"],
  );
}

/**
 * Generate the unified Convex schema for all features.
 */
export async function generateUnifiedSchema(appSpec: any): Promise<string | null> {
  const features = appSpec?.features || [];
  const featureList = features.map((f: any) =>
    `- ${f.name}: ${f.description || f.summary || ""} (actors: ${(f.actor_ids || []).join(", ")})`
  ).join("\n");

  const system = `${STACK_PREAMBLE}

You are generating a unified Convex schema.ts file for an entire application.

App: ${appSpec?.title || "App"}
Summary: ${appSpec?.summary || ""}

Features:
${featureList}

Generate a single schema file that:
1. Imports defineSchema, defineTable from "convex/server" and v from "convex/values"
2. Defines ONE table per feature with feature-specific fields (not generic title/description)
3. Table names are snake_case derived from feature names
4. Every table includes: createdBy (v.string()), orgId (v.string()), createdAt (v.number()), updatedAt (v.number())
5. Every table has at minimum: .index("by_org", ["orgId"])
6. Includes an audit_logs table with action, userId, orgId, resourceType, resourceId, details (optional), createdAt
7. Uses defineSchema({...}) as the default export
8. Uses proper Convex value types: v.string(), v.number(), v.boolean(), v.optional(v.string()), etc.
9. Never emit bare validators that require inner arguments. In particular, never emit bare v.id(), v.optional(), or v.array().
10. If the target table is unknown, use v.string() instead.
11. Generates validators that match current Convex syntax and avoids legacy handler signatures or deprecated APIs

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(system, `Generate unified Convex schema for "${appSpec?.title || "App"}" with ${features.length} features.`);
}
