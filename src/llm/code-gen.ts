/**
 * LLM-powered code generation for AES features.
 *
 * Each function tries the LLM first; returns null when the model is
 * unavailable so the caller can fall back to its template path.
 */

import { getLLM, isLLMAvailable, acquireLLMSlot, releaseLLMSlot } from "./provider.js";
import { getGenerationGroundTruthForPacks } from "./current-api-context.js";
import type { FrameworkContractPackId } from "../contracts/framework-contract-layer.js";

// ─── Shared helpers ──────────────────────────────────────────────────

interface FeatureContext {
  name: string;
  description: string;
  summary?: string;
  outcome: string;
  actor_ids?: string[];
  destructive_actions?: { action_name: string; reversible: boolean; confirmation_required: boolean; audit_logged: boolean }[];
  audit_required?: boolean;
}

interface AppContext {
  title: string;
  summary: string;
  roles?: { role_id: string; name: string; description: string }[];
  permissions?: { role_id: string; resource: string; effect: string }[];
}

const LLM_TIMEOUT_MS = 30_000;

/** Race a promise against a timeout; resolves to null on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Basic validation: reject empty, too-short, or LLM-refusal responses. */
function validateCodeResponse(text: string): boolean {
  if (!text || text.length < 50) return false;
  const trimmed = text.trimStart();
  if (/^(I |Sorry|I'm sorry|I cannot|I can't|Unfortunately)/i.test(trimmed)) return false;
  return true;
}

async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  contractPackIds: FrameworkContractPackId[] = [],
): Promise<string | null> {
  if (!isLLMAvailable()) return null;

  const llm = getLLM();
  if (!llm) return null;

  const groundTruth = await getGenerationGroundTruthForPacks(contractPackIds);
  const slotId = await acquireLLMSlot("code-gen");
  try {
    const response = await withTimeout(
      llm.invoke([
        { role: "system", content: `${groundTruth}\n\n${systemPrompt}` },
        { role: "user", content: userPrompt },
      ]),
      LLM_TIMEOUT_MS,
    );

    if (!response) return null; // timed out

    const text = typeof response.content === "string"
      ? response.content
      : String(response.content);

    // Strip markdown fences if present
    const cleaned = text
      .replace(/^```(?:typescript|tsx|ts|jsx)?\n?/m, "")
      .replace(/\n?```\s*$/m, "")
      .trim();

    if (!validateCodeResponse(cleaned)) return null;

    return cleaned;
  } catch {
    return null;
  } finally {
    releaseLLMSlot(slotId);
  }
}

const STACK_PREAMBLE = `You are generating code for a Next.js 15 + Clerk + Convex + Tailwind CSS application.

These are HARD RULES enforced by the compile gate. Any violation causes a TypeScript build failure.

━━━ CONVEX SERVER (convex/*.ts files) ━━━

IMPORTS:
  import { query, mutation } from "../_generated/server";
  import { v } from "convex/values";

REQUIRED SHAPE — ALWAYS use the object form, never the shorthand:
  ✅ export const list = query({
       args: { orgId: v.string() },
       handler: async (ctx, args) => {
         return await ctx.db.query("myTable").withIndex("by_org", (q: any) => q.eq("orgId", args.orgId)).collect();
       },
     });

  ❌ FORBIDDEN: export const list = query(async (ctx, args) => { ... })
     — shorthand form causes "Parameter 'ctx' implicitly has an 'any' type" build failure.

VALIDATORS — every arg must be typed. Forbidden:
  ❌ args: any     ← compile error
  ❌ v.id()        ← compile error, "Expected 1 arguments, but got 0"
  ❌ v.optional()  ← compile error, "Expected 1 arguments, but got 0"
  ❌ v.array()     ← compile error, "Expected 1 arguments, but got 0"

Correct: v.string(), v.number(), v.boolean(), v.id("tableName"), v.optional(v.string()), v.array(v.string())

CONVEX AUTH in server functions:
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  const userId = identity.subject;

CONVEX QUERY CALLBACKS — always annotate:
  .withIndex("by_org", (q: any) => q.eq("orgId", args.orgId))
  .filter((q: any) => q.eq(q.field("status"), "active"))

━━━ CONVEX SCHEMA (convex/schema.ts) ━━━

IMPORTS:
  import { defineSchema, defineTable } from "convex/server";
  import { v } from "convex/values";

  ✅ export default defineSchema({
       items: defineTable({
         orgId: v.string(),
         createdBy: v.string(),
         title: v.string(),
         status: v.optional(v.string()),
         createdAt: v.number(),
         updatedAt: v.number(),
       }).index("by_org", ["orgId"]).index("by_org_status", ["orgId", "status"]),
     });

  ❌ FORBIDDEN: defineTable()       ← "Expected 1 arguments, but got 0"
  ❌ FORBIDDEN: defineTable(v.any()) ← use an explicit object shape, not v.any()

Every table MUST include: orgId, createdBy, createdAt, updatedAt.

━━━ CLERK CLIENT (client components) ━━━

IMPORTS:
  import { useAuth } from "@clerk/nextjs";

ALLOWED destructuring: { orgId, userId, isLoaded, isSignedIn, sessionId, orgRole, orgSlug, getToken, signOut }

  ✅ const { orgId, userId, isLoaded } = useAuth();
  ❌ FORBIDDEN: const { org } = useAuth()  ← "org" DOES NOT EXIST on UseAuthReturn. Build failure.

━━━ CLERK SERVER (server components, route handlers, middleware) ━━━

IMPORTS:
  import { auth, currentUser, clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

  ✅ const { userId, orgId } = await auth();
  ❌ FORBIDDEN: authMiddleware       ← deprecated, build failure
  ❌ FORBIDDEN: withClerkMiddleware  ← deprecated, build failure

━━━ CONVEX REACT CLIENT (client components) ━━━

IMPORTS:
  import { useQuery, useMutation } from "convex/react";
  import { api } from "@/convex/_generated/api";

━━━ NEXT.JS APP ROUTER — "use client" DIRECTIVE ━━━

A file MUST begin with "use client" on line 1 if it uses ANY of:
  useAuth, useQuery, useMutation, useAction, useState, useEffect,
  useRouter, useParams, usePathname, useSearchParams, usePaginatedQuery

"use client" must be the absolute first line — before any imports.

━━━ TYPESCRIPT ━━━

Never emit implicit-any parameters. If a callback param would be untyped, annotate explicitly.
JSX return type: never write JSX.Element explicitly. Let TypeScript infer the return type.

Do not invent older APIs, deprecated helpers, or alternative return shapes.`;

const AES_UI_RULES = `
CRITICAL: You MUST use @aes/ui components. NEVER use raw HTML elements:
- Use <Button> from "@aes/ui" instead of <button>
- Use <Input> from "@aes/ui" instead of <input>
- Use <Textarea> from "@aes/ui" instead of <textarea>
- Use <Table>, <TableHeader>, <TableBody>, <TableRow>, <TableCell> from "@aes/ui" instead of <table>/<thead>/<tbody>/<tr>/<td>/<th>
- Use <Card>, <CardHeader>, <CardContent> from "@aes/ui" instead of raw <div> containers
- Use <Badge> from "@aes/ui" instead of custom <span> badges
- Use <Label> from "@aes/ui" instead of <label>
- Use <Select> from "@aes/ui" instead of <select>
- Use <Dialog> from "@aes/ui" for confirmation dialogs

Import from "@aes/ui": { Button, Input, Textarea, Table, TableHeader, TableBody, TableRow, TableCell, Card, CardHeader, CardContent, Badge, Label, Select, Dialog }
`;

// ─── Public generators ───────────────────────────────────────────────

export async function generateConvexSchema(
  feature: FeatureContext,
  appSpec: AppContext,
): Promise<string | null> {
  const system = `${STACK_PREAMBLE}

You are generating a Convex schema file for a feature.

Feature: ${feature.name}
Description: ${feature.description}
Outcome: ${feature.outcome}
App: ${appSpec.title} — ${appSpec.summary}

Generate a TypeScript file that exports a Convex table definition using defineTable().
The schema should have fields specific to this feature, not generic placeholders.
Include proper field types (v.string(), v.number(), v.boolean(), v.optional(v.string()), etc.).
Never emit bare validators that require inner arguments. In particular, never emit bare v.id(), v.optional(), or v.array().
If the relation target is unknown, use v.string() instead of guessing.
Always include: createdBy (v.string()), orgId (v.string()), createdAt (v.number()), updatedAt (v.number()).
Add indexes for orgId, status (if present), and createdAt.

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate the Convex schema for the "${feature.name}" feature.`,
    ["convex/schema-core"],
  );
}

export async function generateConvexQueries(
  feature: FeatureContext,
  appSpec: AppContext,
  schemaContent: string,
): Promise<string | null> {
  const system = `${STACK_PREAMBLE}

You are generating Convex query functions for a feature.

Feature: ${feature.name}
Description: ${feature.description}
Outcome: ${feature.outcome}
App: ${appSpec.title} — ${appSpec.summary}

Here is the Convex schema these queries will read from:
\`\`\`typescript
${schemaContent}
\`\`\`

Generate query functions that:
1. Always filter by orgId for tenant isolation
2. Include a "list" query and a "get" (by id) query
3. Add any additional queries that make sense for this feature
4. Use proper Convex query patterns (ctx.db.query, withIndex, etc.)
5. Use the exact Convex object form: query({ args: { ... }, handler: async (ctx, args) => { ... } })
6. Never destructure handler args in the function signature

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate Convex queries for "${feature.name}".`,
    ["convex/query-core"],
  );
}

export async function generateConvexMutations(
  feature: FeatureContext,
  appSpec: AppContext,
  schemaContent: string,
): Promise<string | null> {
  const destructiveNote = feature.destructive_actions?.length
    ? `\nThis feature has destructive actions: ${feature.destructive_actions.map(a => a.action_name).join(", ")}. Generate mutations for these with proper guards.`
    : "";
  const auditNote = feature.audit_required
    ? "\nThis feature requires audit logging — add audit trail entries in mutations."
    : "";

  const system = `${STACK_PREAMBLE}

You are generating Convex mutation functions for a feature.

Feature: ${feature.name}
Description: ${feature.description}
Outcome: ${feature.outcome}
App: ${appSpec.title} — ${appSpec.summary}
${destructiveNote}${auditNote}

Here is the Convex schema these mutations will write to:
\`\`\`typescript
${schemaContent}
\`\`\`

Generate mutation functions that:
1. Always verify orgId ownership before writes
2. Include "create" and at least one update mutation
3. Include mutations for any feature-specific workflows
4. Use proper Convex mutation patterns
5. Use the exact Convex object form: mutation({ args: { ... }, handler: async (ctx, args) => { ... } })
6. Never destructure handler args in the function signature
7. If auth is needed, call await ctx.auth.getUserIdentity() and handle null before using identity data

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate Convex mutations for "${feature.name}".`,
    ["convex/mutation-core"],
  );
}

export async function generatePage(
  feature: FeatureContext,
  appSpec: AppContext,
  capability: string,
  pageType: "form" | "list" | "detail",
): Promise<string | null> {
  const typeInstructions: Record<string, string> = {
    form: `Generate a form page with:
- useMutation() hook for submission
- Proper form validation and error handling
- Loading state during submission
- Success redirect after submission
- All form fields use @aes/ui components (Input, Textarea, Select, Label, Button)
- Wrap the form in a Card with CardHeader and CardContent`,

    list: `Generate a list/table page with:
- useQuery() hook for data fetching
- A Table component from @aes/ui with TableHeader, TableBody, TableRow, TableCell
- Loading skeleton state
- Empty state when no data
- Status badges using Badge from @aes/ui
- Clickable rows or action buttons`,

    detail: `Generate a detail view page with:
- useQuery() hook for fetching a single item by ID
- useParams() for route parameter
- Back navigation button using Button from @aes/ui
- Status display using Badge from @aes/ui
- All content wrapped in Card from @aes/ui
- Not found state handling`,
  };

  const system = `${STACK_PREAMBLE}
${AES_UI_RULES}

You are generating a React page component (Next.js "use client").

Feature: ${feature.name}
Description: ${feature.description}
Capability: ${capability}
Page type: ${pageType}
App: ${appSpec.title} — ${appSpec.summary}

${typeInstructions[pageType]}

The page should use:
- useAuth() from @clerk/nextjs for orgId/userId only because this is a client component
- Convex hooks (useQuery/useMutation) from convex/react
- Feature-specific field names derived from the feature description (NOT generic "title"/"description")

Output ONLY the TypeScript/JSX code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate a ${pageType} page for capability "${capability}" of feature "${feature.name}".`,
    ["clerk/client-auth", "convex/query-core", "convex/mutation-core"],
  );
}

export async function generateComponent(
  feature: FeatureContext,
  appSpec: AppContext,
  componentType: string,
): Promise<string | null> {
  const system = `${STACK_PREAMBLE}
${AES_UI_RULES}

You are generating a React component.

Feature: ${feature.name}
Description: ${feature.description}
Component type: ${componentType}
App: ${appSpec.title} — ${appSpec.summary}

Generate a reusable component that:
- Uses @aes/ui components (Badge for status, Card for containers, etc.)
- Has proper TypeScript props interface
- Never use explicit JSX namespace types like JSX.Element or Array<JSX.Element>; prefer inference
- Is well-documented with JSDoc

Output ONLY the TypeScript/JSX code, no markdown fences, no explanation.`;

  return callLLM(system, `Generate a ${componentType} component for "${feature.name}".`);
}

export async function generateTest(
  feature: FeatureContext,
  testDef: { name: string; pass_condition: string },
): Promise<string | null> {
  const system = `${STACK_PREAMBLE}

━━━ TEST FILE RULES (enforced — violations cause immediate compile failure) ━━━

You are generating a Vitest test file.

Feature: ${feature.name}
Test name: ${testDef.name}
Pass condition: ${testDef.pass_condition}

IMPORTS — HARD RULES:
  ✅ import { describe, it, expect, vi, beforeEach } from 'vitest';
  ✅ import { render, fireEvent } from '@testing-library/react';
  ✅ import '@testing-library/jest-dom/vitest';
  ✅ import React from 'react';
  ✅ import { SomeComponent } from '@/components/...';   ← only if path is known to exist

  ❌ FORBIDDEN: import ... from '@/app/...'
     — Generated app route paths DO NOT EXIST at test compile time. This causes
       "Cannot find module '@/app/features/...'" and fails the entire test run.
     — If you need a component, DEFINE IT INLINE in the test file instead.

MOCKING — REQUIRED when hooks are used:
  // Always add both mocks at the top of the file, before imports or test code:
  vi.mock('convex/react', () => ({
    useQuery: vi.fn(() => []),
    useMutation: vi.fn(() => vi.fn()),
    useAction: vi.fn(() => vi.fn()),
  }));
  vi.mock('@clerk/nextjs', () => ({
    useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })),
  }));

FALLBACK SMOKE TEST — use this pattern when you cannot import the component:
  Define a minimal inline component inside the test file that:
  - Exercises the same behavior described in the pass condition
  - Uses the same Convex mock shape (same mutation name, same args shape)
  - Can be rendered and asserted against without any external file dependency

ASSERTIONS:
  ❌ FORBIDDEN: expect(true).toBe(true)  — proves nothing, always passes
  ✅ REQUIRED: assert something meaningful about what renders, what gets called, or what state changes
  — Use getByTestId, getByRole, getByText from the render() return value (not screen)
  — Use toBeInTheDocument(), toHaveTextContent(), toHaveBeenCalledWith() from jest-dom

Output ONLY the TypeScript code, no markdown fences, no explanation.`;

  return callLLM(
    system,
    `Generate a test for "${testDef.name}" with pass condition: "${testDef.pass_condition}".`,
    ["test/vitest-core"],
  );
}
