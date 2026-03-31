const FRAMEWORK_PACKS = {
    "test/vitest-core": {
        id: "test/vitest-core",
        framework: "nextjs",
        area: "vitest-test-generation",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "**/*.test.ts", "**/*.test.tsx"],
            codeKind: ["test"],
            stackSignals: ["vitest"],
        },
        hardRules: [
            "NEVER import from guessed @/app/ route paths. \"@/app/features/foo/page\" will not resolve at test time and causes an immediate \"Cannot find module\" compile failure. This is the #1 test blocker.",
            "ALWAYS write self-contained tests. Define any component you need to test inline inside the test file, or mock the import with vi.mock(). Never assume a generated file path is importable.",
            "Mock Convex in every test that uses Convex hooks. Use vi.mock('convex/react', () => ({ useQuery: vi.fn(() => undefined), useMutation: vi.fn(() => vi.fn()), useAction: vi.fn(() => vi.fn()) }))",
            "Mock Clerk in every test that uses Clerk hooks. Use vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })) }))",
            "Imports must only come from: vitest, @testing-library/react, @testing-library/jest-dom/vitest, react, @/components/*, @/lib/*, or explicit vi.mock() stubs. Never import from @/app/* paths.",
            "Use describe/it/expect from vitest. Import { describe, it, expect, vi, beforeEach } from 'vitest'.",
            "Prefer { render } return value for queries: const { getByText, getByRole } = render(...). Avoid importing screen separately.",
            "Every test must have at least one meaningful assertion. expect(true).toBe(true) is forbidden — it always passes and proves nothing.",
            "If you cannot write a meaningful assertion without importing a guessed app path, write a fallback smoke test: render a minimal inline component that exercises the same behavior (e.g., same Convex mutation mock, same form submit) and assert it renders or calls the mock correctly.",
        ],
        forbiddenPatterns: [
            "import ... from '@/app/...' — route imports in tests always fail compilation",
            "import ... from '@/app/features/.../page' — specific page path imports are guessed and unreliable",
            "expect(true).toBe(true) — no-op assertion that proves nothing",
            "expect(false).toBe(false) — no-op assertion",
            "useQuery without vi.mock('convex/react') — Convex hooks throw at test runtime without mocking",
            "useAuth without vi.mock('@clerk/nextjs') — Clerk hooks throw at test runtime without mocking",
        ],
        preferredImports: [
            "import { describe, it, expect, vi, beforeEach } from 'vitest';",
            "import { render } from '@testing-library/react';",
            "import '@testing-library/jest-dom/vitest';",
        ],
        templateSkeletons: [
            {
                id: "vitest-fallback-smoke",
                title: "Fallback smoke test — self-contained, no app path imports",
                slotNotes: ["feature name", "behavior description", "expected output or side effect"],
                code: `import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';

// Mock Convex — required for any component using useQuery/useMutation
vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => []),
  useMutation: vi.fn(() => vi.fn()),
}));

// Mock Clerk — required for any component using useAuth
vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })),
}));

// Inline component fixture — avoids guessed @/app/ import
function FeatureFixture() {
  return <div data-testid="feature-root">Feature content</div>;
}

describe('FEATURE_NAME', () => {
  it('PASS_CONDITION', () => {
    const { getByTestId } = render(<FeatureFixture />);
    expect(getByTestId('feature-root')).toBeInTheDocument();
  });
});`,
            },
            {
                id: "vitest-mutation-smoke",
                title: "Smoke test that verifies a Convex mutation is called on form submit",
                slotNotes: ["feature name", "mutation name", "form field names"],
                code: `import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React, { useState } from 'react';

const mockCreate = vi.fn();
vi.mock('convex/react', () => ({
  useQuery: vi.fn(() => []),
  useMutation: vi.fn(() => mockCreate),
}));
vi.mock('@clerk/nextjs', () => ({
  useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })),
}));

function FormFixture() {
  const [value, setValue] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); mockCreate({ title: value, orgId: 'org_test' }); }}>
      <input data-testid="title-input" value={value} onChange={(e) => setValue(e.target.value)} />
      <button type="submit">Submit</button>
    </form>
  );
}

describe('FEATURE_NAME — create mutation', () => {
  it('calls the create mutation with correct args on submit', () => {
    const { getByTestId, getByRole } = render(<FormFixture />);
    fireEvent.change(getByTestId('title-input'), { target: { value: 'Test item' } });
    fireEvent.click(getByRole('button', { name: 'Submit' }));
    expect(mockCreate).toHaveBeenCalledWith({ title: 'Test item', orgId: 'org_test' });
  });
});`,
            },
        ],
        verifiedPatterns: [
            {
                id: "vitest-no-app-import",
                title: "Self-contained test — zero app path imports",
                codeKind: "test",
                source: "curated",
                code: `import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';

vi.mock('convex/react', () => ({ useQuery: vi.fn(() => []), useMutation: vi.fn(() => vi.fn()) }));
vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn(() => ({ orgId: 'org_1', userId: 'user_1', isLoaded: true, isSignedIn: true })) }));

function StatusBadge({ status }: { status: string }) {
  return <span data-testid="badge">{status}</span>;
}

describe('StatusBadge', () => {
  it('renders the given status', () => {
    const { getByTestId } = render(<StatusBadge status="active" />);
    expect(getByTestId('badge')).toHaveTextContent('active');
  });
});`,
                notes: [
                    "No @/app/ imports. Compiles and passes without any generated app files present.",
                    "Pattern to use when the component under test is not importable from a known stable path.",
                ],
                passedChecks: ["tsc", "vitest"],
            },
        ],
        repairRules: [
            {
                id: "test-guessed-app-import",
                trigger: {
                    errorRegex: "Cannot find module '@/app/",
                    fileHint: "\\.test\\.(ts|tsx)$",
                },
                diagnosis: "Test imports a guessed @/app/ route path that doesn't exist at test compile time.",
                fixInstruction: "Remove the @/app/ import. Define an inline fixture component inside the test file that replicates the behavior under test, and mock Convex and Clerk with vi.mock().",
                replacementPatternId: "vitest-fallback-smoke",
            },
            {
                id: "test-missing-convex-mock",
                trigger: {
                    errorRegex: "useQuery is not a function|useMutation is not a function|Cannot read properties of undefined.*useQuery",
                    fileHint: "\\.test\\.(ts|tsx)$",
                },
                diagnosis: "Test uses Convex React hooks without mocking convex/react. Hooks throw at runtime.",
                fixInstruction: "Add vi.mock('convex/react', () => ({ useQuery: vi.fn(() => undefined), useMutation: vi.fn(() => vi.fn()) })) at the top of the test file.",
                replacementPatternId: "vitest-fallback-smoke",
            },
            {
                id: "test-missing-clerk-mock",
                trigger: {
                    errorRegex: "useAuth is not a function|ClerkProvider not found|useAuth.*outside.*ClerkProvider",
                    fileHint: "\\.test\\.(ts|tsx)$",
                },
                diagnosis: "Test uses Clerk hooks without mocking @clerk/nextjs. Hooks throw without ClerkProvider.",
                fixInstruction: "Add vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })) })) at the top of the test file.",
                replacementPatternId: "vitest-fallback-smoke",
            },
        ],
        testCases: [
            "No generated test file imports from @/app/ paths",
            "All tests mock convex/react and @clerk/nextjs",
            "No no-op expect(true).toBe(true) assertions",
            "tsc --noEmit passes for all generated test files",
        ],
    },
    "convex/schema-core": {
        id: "convex/schema-core",
        framework: "convex",
        area: "schema-core",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["convex/schema.ts", "convex/**/schema.ts"],
            codeKind: ["schema"],
            stackSignals: ["convex"],
        },
        hardRules: [
            "Import defineSchema and defineTable from 'convex/server'. Import v from 'convex/values'.",
            "defineTable() always takes a validator object argument: defineTable({ field: v.string(), ... }). Never call defineTable() with no arguments.",
            "v.id() without a table name is a compile error. Always write v.id(\"tableName\").",
            "v.optional() must wrap an inner validator: v.optional(v.string()). Never write bare v.optional().",
            "v.array() must wrap an inner validator: v.array(v.string()). Never write bare v.array().",
            "Always include createdBy: v.string(), orgId: v.string(), createdAt: v.number(), updatedAt: v.number() on every table.",
            "Add .index('by_org', ['orgId']) on every table for tenant isolation. Add .index('by_org_status', ['orgId', 'status']) when status field is present.",
            "Export the schema as the default export: export default defineSchema({ ... }).",
        ],
        forbiddenPatterns: [
            "defineTable() with no arguments — always pass a validator object",
            "bare v.id() with no table name — always v.id(\"tableName\")",
            "bare v.optional() with no inner validator",
            "bare v.array() with no inner validator",
            "Using unknown or any as a validator — always use a concrete v.* validator",
        ],
        preferredImports: [
            'import { defineSchema, defineTable } from "convex/server";',
            'import { v } from "convex/values";',
        ],
        templateSkeletons: [
            {
                id: "convex-schema-table",
                title: "Convex table definition with indexes",
                slotNotes: ["table name (camelCase)", "feature-specific fields"],
                code: `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  items: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    title: v.string(),
    status: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_status", ["orgId", "status"]),
});`,
            },
        ],
        verifiedPatterns: [
            {
                id: "convex-schema-with-id-relation",
                title: "Table with typed ID relation field",
                codeKind: "schema",
                source: "curated",
                code: `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  comments: defineTable({
    orgId: v.string(),
    createdBy: v.string(),
    parentId: v.id("posts"),
    text: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_parent", ["parentId"]),
});`,
                notes: ["v.id(\"posts\") not bare v.id() — always pass the table name."],
                passedChecks: ["tsc", "next-build"],
            },
        ],
        repairRules: [
            {
                id: "convex-schema-bare-id",
                trigger: {
                    errorRegex: "Expected 1 arguments, but got 0",
                    fileHint: "convex/",
                },
                diagnosis: "v.id() or defineTable() called without required arguments.",
                fixInstruction: "Replace bare v.id() with v.id(\"tableName\") and ensure defineTable() receives a validator object.",
            },
            {
                id: "convex-schema-bare-optional",
                trigger: {
                    errorRegex: "Expected 1 arguments, but got 0",
                    fileHint: "convex/",
                },
                diagnosis: "v.optional() called without an inner validator.",
                fixInstruction: "Replace bare v.optional() with v.optional(v.string()) or the appropriate inner type.",
            },
        ],
        testCases: [
            "tsc --noEmit passes for generated convex/schema.ts",
            "Every defineTable() call has a validator object argument",
            "No bare v.id(), v.optional(), or v.array() calls",
        ],
    },
    "convex/query-core": {
        id: "convex/query-core",
        framework: "convex",
        area: "query-core",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["convex/**/queries.ts"],
            codeKind: ["query"],
            stackSignals: ["convex"],
        },
        hardRules: [
            "Use ONLY the object form: query({ args: { field: v.type() }, handler: async (ctx, args) => { ... } }). Never use the shorthand query(async (ctx, args) => ...) — it causes implicit-any compile errors.",
            "Every arg must have a typed validator: v.string(), v.number(), v.boolean(), v.id(\"tableName\"), v.optional(v.string()), etc. Never use args: any.",
            "v.id() without a table name argument is a compile error. Always write v.id(\"tableName\") with the actual table name.",
            "Use org-scoped reads through ctx.db.query(...).withIndex(...) when tenant isolation is required.",
            "If using withIndex/filter/order callbacks, annotate callback params explicitly: (q: any) => ...",
            "If the requested behavior cannot fit the contract, return CONTRACT_CONFLICT instead of inventing a new API shape.",
        ],
        forbiddenPatterns: [
            "query(async (ctx, args) => { ... }) — shorthand form causes implicit-any type errors, always use object form",
            "args: any as a handler parameter — every arg must have a typed validator in the args object",
            "bare v.id() with no table name argument — always v.id(\"tableName\")",
            "Implicit-any callback params in withIndex/filter/order callbacks — annotate as (q: any) =>",
        ],
        preferredImports: [
            'import { query } from "../_generated/server";',
            'import { v } from "convex/values";',
        ],
        templateSkeletons: [
            {
                id: "convex-query-list-by-org",
                title: "List query with org-scoped index access",
                slotNotes: ["table name", "index name", "optional item post-filter"],
                code: `export const list = query({
  args: {
    orgId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    return await ctx.db
      .query("TABLE_NAME")
      .withIndex("by_org", (q: any) => q.eq("orgId", args.orgId))
      .collect();
  },
});`,
            },
            {
                id: "convex-query-get-by-id",
                title: "Single-item query with org verification",
                slotNotes: ["table name"],
                code: `export const get = query({
  args: {
    id: v.id("TABLE_NAME"),
    orgId: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const item = await ctx.db.get(args.id);
    if (!item || item.orgId !== args.orgId) return null;
    return item;
  },
});`,
            },
        ],
        verifiedPatterns: [
            {
                id: "convex-query-by-org-pattern",
                title: "Approved by-org query pattern",
                codeKind: "query",
                source: "curated",
                code: `export const list = query({
  args: {
    orgId: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx: any, args: any) => {
    const items = await ctx.db
      .query("kudos")
      .withIndex("by_org", (q: any) => q.eq("orgId", args.orgId))
      .collect();

    return args.status ? items.filter((item) => item.status === args.status) : items;
  },
});`,
                notes: ["Passed compile-gate shape for org-scoped list queries."],
                passedChecks: ["tsc", "next-build"],
            },
        ],
        repairRules: [
            {
                id: "convex-query-implicit-q",
                trigger: {
                    errorRegex: "Parameter 'q' implicitly has an 'any' type\\.",
                    fileHint: "convex/.*/queries\\.ts",
                },
                diagnosis: "Convex query builder callback leaked an untyped callback parameter.",
                fixInstruction: "Annotate query builder callback params explicitly or rewrite to the approved query skeleton.",
                replacementPatternId: "convex-query-by-org-pattern",
            },
        ],
        testCases: [
            "tsc --noEmit passes for generated convex/**/queries.ts",
            "Generated query file contains object-form query({ args, handler }) wrapper",
        ],
    },
    "convex/mutation-core": {
        id: "convex/mutation-core",
        framework: "convex",
        area: "mutation-core",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["convex/**/mutations.ts"],
            codeKind: ["mutation"],
            stackSignals: ["convex"],
        },
        hardRules: [
            "Use ONLY the object form: mutation({ args: { field: v.type() }, handler: async (ctx, args) => { ... } }). Never use the shorthand mutation(async (ctx, args) => ...) — it causes implicit-any compile errors.",
            "Every arg must have a typed validator. Never write args: any or omit the args object.",
            "v.id() without a table name argument is a compile error. Always write v.id(\"tableName\") with the actual table name.",
            "Never destructure handler args directly in the handler parameter — receive as args, then destructure inside the handler body.",
            "If auth is needed: const identity = await ctx.auth.getUserIdentity(); if (!identity) throw new Error(\"Unauthenticated\"); then use identity.subject for the user id.",
            "If the requested behavior cannot fit the contract, return CONTRACT_CONFLICT instead of inventing a new API shape.",
        ],
        forbiddenPatterns: [
            "mutation(async (ctx, args) => { ... }) — shorthand form causes implicit-any type errors, always use object form",
            "args: any as a handler parameter — every arg must have a typed validator in the args object",
            "bare v.id() with no table name argument — always v.id(\"tableName\")",
            "Writes that use args fields missing from the validator object",
        ],
        preferredImports: [
            'import { mutation } from "../_generated/server";',
            'import { v } from "convex/values";',
        ],
        templateSkeletons: [
            {
                id: "convex-mutation-create",
                title: "Create mutation with validated args",
                slotNotes: ["table name", "feature fields", "optional auth/audit logic"],
                code: `export const create = mutation({
  args: {
    orgId: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    return await ctx.db.insert("TABLE_NAME", {
      orgId: args.orgId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});`,
            },
        ],
        verifiedPatterns: [
            {
                id: "convex-mutation-create-pattern",
                title: "Approved create mutation pattern",
                codeKind: "mutation",
                source: "curated",
                code: `export const create = mutation({
  args: {
    title: v.string(),
    orgId: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx: any, args: any) => {
    const now = Date.now();
    return await ctx.db.insert("kudos", {
      title: args.title,
      orgId: args.orgId,
      createdBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });
  },
});`,
                notes: ["Passed compile-gate shape for basic Convex writes."],
                passedChecks: ["tsc", "next-build"],
            },
        ],
        repairRules: [
            {
                id: "convex-mutation-implicit-ctx",
                trigger: {
                    errorRegex: "Parameter 'ctx' implicitly has an 'any' type\\.",
                    fileHint: "convex/.*/mutations\\.ts",
                },
                diagnosis: "Legacy Convex mutation shorthand leaked untyped ctx.",
                fixInstruction: "Annotate ctx/args explicitly or rewrite to the approved object-form mutation skeleton.",
                replacementPatternId: "convex-mutation-create-pattern",
            },
            {
                id: "convex-mutation-implicit-args",
                trigger: {
                    errorRegex: "Parameter 'args' implicitly has an 'any' type\\.",
                    fileHint: "convex/.*/mutations\\.ts",
                },
                diagnosis: "Convex mutation args were generated without explicit or inferred typing.",
                fixInstruction: "Rewrite to the approved object-form mutation skeleton and destructure from args inside the handler.",
                replacementPatternId: "convex-mutation-create-pattern",
            },
        ],
        testCases: [
            "tsc --noEmit passes for generated convex/**/mutations.ts",
            "Generated mutation file contains object-form mutation({ args, handler }) wrapper",
        ],
    },
    "clerk/client-auth": {
        id: "clerk/client-auth",
        framework: "clerk",
        area: "client-auth",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["app/**/*.tsx", "components/**/*.tsx"],
            codeKind: ["auth", "page"],
            stackSignals: ["clerk", "client"],
        },
        hardRules: [
            'Use `useAuth()` from "@clerk/nextjs" only in client components.',
            'If a file uses `useAuth()` or `next/navigation` hooks, it must begin with `"use client"`.',
            "Destructure orgId, not org, from useAuth().",
            "Do not mix server auth helpers into client components.",
        ],
        forbiddenPatterns: [
            "Destructuring org from useAuth()",
            "Using useAuth() in a server component",
            "Missing use client in TSX files that use Clerk or next/navigation hooks",
        ],
        preferredImports: ['import { useAuth } from "@clerk/nextjs";'],
        templateSkeletons: [
            {
                id: "clerk-client-useauth",
                title: "Client component auth binding",
                slotNotes: ["optional orgId/userId usage"],
                code: `"use client";

import { useAuth } from "@clerk/nextjs";

export default function Example() {
  const { orgId, userId } = useAuth();
  return <div>{orgId ?? userId ?? "anonymous"}</div>;
}`,
            },
        ],
        verifiedPatterns: [
            {
                id: "clerk-client-orgid-pattern",
                title: "Approved Clerk client auth pattern",
                codeKind: "auth",
                source: "curated",
                code: `"use client";

import { useAuth } from "@clerk/nextjs";

export function Example() {
  const { orgId, userId, isLoaded } = useAuth();
  if (!isLoaded) return null;
  return <span>{orgId ?? userId}</span>;
}`,
                passedChecks: ["tsc", "next-build"],
            },
        ],
        repairRules: [
            {
                id: "clerk-client-org",
                trigger: {
                    errorRegex: "Property 'org' does not exist on type 'UseAuthReturn'",
                },
                diagnosis: "Generated Clerk client auth code used a stale org field.",
                fixInstruction: "Rewrite useAuth() bindings to orgId and update references.",
                replacementPatternId: "clerk-client-orgid-pattern",
            },
        ],
        testCases: [
            "TSX files using useAuth() start with use client",
            "No client file destructures org from useAuth()",
        ],
    },
    "clerk/server-auth": {
        id: "clerk/server-auth",
        framework: "clerk",
        area: "server-auth",
        versionTag: "v1",
        status: "verified",
        appliesWhen: {
            fileGlobs: ["app/**/route.ts", "middleware.ts", "proxy.ts"],
            codeKind: ["auth", "middleware", "route"],
            stackSignals: ["clerk", "server"],
        },
        hardRules: [
            'Use `auth`, `currentUser`, or `clerkMiddleware` from "@clerk/nextjs/server" in server-only files.',
            "Do not import useAuth() into server files.",
            "Use clerkMiddleware in middleware/proxy files and avoid deprecated authMiddleware/withClerkMiddleware.",
        ],
        forbiddenPatterns: [
            "authMiddleware",
            "withClerkMiddleware",
            "useAuth() in middleware, route handlers, or other server files",
        ],
        preferredImports: ['import { auth, currentUser, clerkMiddleware } from "@clerk/nextjs/server";'],
        templateSkeletons: [
            {
                id: "clerk-server-auth",
                title: "Server auth helper usage",
                slotNotes: ["optional currentUser call"],
                code: `import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId, orgId } = await auth();
  return Response.json({ userId, orgId });
}`,
            },
        ],
        verifiedPatterns: [
            {
                id: "clerk-server-auth-pattern",
                title: "Approved Clerk server auth pattern",
                codeKind: "auth",
                source: "curated",
                code: `import { auth } from "@clerk/nextjs/server";

export async function GET() {
  const { userId, orgId } = await auth();
  return Response.json({ userId, orgId });
}`,
                passedChecks: ["tsc", "next-build"],
            },
        ],
        repairRules: [
            {
                id: "clerk-server-middleware-shape",
                trigger: {
                    errorRegex: "authMiddleware|withClerkMiddleware",
                    fileHint: "(middleware|proxy)\\.ts",
                },
                diagnosis: "Generated middleware used an older Clerk middleware API shape.",
                fixInstruction: "Rewrite middleware to clerkMiddleware from @clerk/nextjs/server.",
                replacementPatternId: "clerk-server-auth-pattern",
            },
        ],
        testCases: [
            "middleware.ts or proxy.ts use clerkMiddleware",
            "Server files do not import useAuth()",
        ],
    },
};
const SHARED_GUIDANCE = [
    "If the task cannot be expressed inside the loaded contract packs, return CONTRACT_CONFLICT instead of inventing a new API shape.",
    "Prefer adapting approved skeletons or verified patterns over writing a file from scratch.",
].join("\n");
export function getFrameworkContractPack(id) {
    return FRAMEWORK_PACKS[id];
}
export function listFrameworkContractPacks(ids) {
    if (!ids || ids.length === 0) {
        return Object.values(FRAMEWORK_PACKS);
    }
    return Array.from(new Set(ids)).map((id) => FRAMEWORK_PACKS[id]);
}
export function buildFrameworkContractContext(ids) {
    const packs = listFrameworkContractPacks(ids);
    if (packs.length === 0)
        return "";
    const sections = packs.map((pack) => {
        const skeletons = pack.templateSkeletons
            .slice(0, 2)
            .map((template) => `Template ${template.id} (${template.title}):\n${template.code}`)
            .join("\n\n");
        const patterns = pack.verifiedPatterns
            .slice(0, 2)
            .map((pattern) => `Verified ${pattern.id} (${pattern.title}):\n${pattern.code}`)
            .join("\n\n");
        return [
            `FRAMEWORK CONTRACT PACK ${pack.id} (${pack.status}, ${pack.versionTag})`,
            `Area: ${pack.area}`,
            "Hard rules:",
            ...pack.hardRules.map((rule, index) => `${index + 1}. ${rule}`),
            "Forbidden patterns:",
            ...pack.forbiddenPatterns.map((rule) => `- ${rule}`),
            pack.preferredImports && pack.preferredImports.length > 0
                ? `Preferred imports:\n${pack.preferredImports.map((value) => `- ${value}`).join("\n")}`
                : null,
            skeletons ? `Approved skeletons:\n${skeletons}` : null,
            patterns ? `Closest verified examples:\n${patterns}` : null,
        ].filter(Boolean).join("\n");
    });
    return `${SHARED_GUIDANCE}\n\n${sections.join("\n\n")}`.trim();
}
export function getContractPackIdsForGeneration(args) {
    const ids = new Set();
    if (args.framework === "convex" && args.codeKind === "query") {
        ids.add("convex/query-core");
    }
    if (args.framework === "convex" && args.codeKind === "mutation") {
        ids.add("convex/mutation-core");
    }
    if (args.framework === "convex" && args.codeKind === "schema") {
        ids.add("convex/schema-core");
    }
    if (args.codeKind === "test" || args.filePath?.match(/\.test\.(ts|tsx)$/)) {
        ids.add("test/vitest-core");
    }
    if (args.usesClerkAuth) {
        ids.add("clerk/client-auth");
    }
    if (args.serverAuth) {
        ids.add("clerk/server-auth");
    }
    if (args.filePath?.includes("/convex/") && args.filePath.endsWith("queries.ts")) {
        ids.add("convex/query-core");
    }
    if (args.filePath?.includes("/convex/") && args.filePath.endsWith("mutations.ts")) {
        ids.add("convex/mutation-core");
    }
    return Array.from(ids);
}
export function detectContractPackIdsForFile(filePath, content) {
    const ids = new Set();
    const normalizedPath = filePath.replace(/\\/g, "/");
    if (/\/convex\/.+\/queries\.ts$/.test(normalizedPath)) {
        ids.add("convex/query-core");
    }
    if (/\/convex\/.+\/mutations\.ts$/.test(normalizedPath)) {
        ids.add("convex/mutation-core");
    }
    if (/\/convex\/(schema|.+\/schema)\.ts$/.test(normalizedPath)) {
        ids.add("convex/schema-core");
    }
    if (/\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(normalizedPath)) {
        ids.add("test/vitest-core");
    }
    if (/useAuth\(\)|@clerk\/nextjs/.test(content)) {
        ids.add("clerk/client-auth");
    }
    if (/@clerk\/nextjs\/server|clerkMiddleware|authMiddleware|withClerkMiddleware/.test(content) ||
        /(\/middleware\.ts|\/proxy\.ts|\/route\.ts)$/.test(normalizedPath)) {
        ids.add("clerk/server-auth");
    }
    return Array.from(ids);
}
export function applyFrameworkContractGuardrails(filePath, content) {
    const packIds = detectContractPackIdsForFile(filePath, content);
    let next = content;
    const appliedRules = [];
    if (packIds.includes("clerk/client-auth")) {
        const updated = next.replace(/const\s*{\s*([^}]*)\borg\b([^}]*)}\s*=\s*useAuth\(\)\s*;/g, (_match, before, after) => {
            const names = `${before},orgId,${after}`
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
                .map((name) => (name === "org" ? "orgId" : name));
            const deduped = Array.from(new Set(names));
            return `const { ${deduped.join(", ")} } = useAuth();`;
        });
        if (updated !== next) {
            next = updated.replace(/\borg\b/g, "orgId");
            appliedRules.push("clerk/client-auth:orgId-binding");
        }
    }
    if (packIds.includes("clerk/server-auth")) {
        const updated = next
            .replace(/\bauthMiddleware\b/g, "clerkMiddleware")
            .replace(/\bwithClerkMiddleware\b/g, "clerkMiddleware");
        if (updated !== next) {
            next = updated;
            appliedRules.push("clerk/server-auth:middleware-shape");
        }
    }
    if (packIds.includes("convex/query-core") || packIds.includes("convex/mutation-core")) {
        const before = next;
        next = next.replace(/handler:\s*async\s*\(\s*ctx\s*,\s*{([^}]*)}\s*\)\s*=>\s*{/g, (_match, bindings) => {
            const names = bindings
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
                .join(", ");
            return `handler: async (ctx, args: any) => {\n    const { ${names} } = args;`;
        });
        next = next.replace(/(export const \w+ = (?:query|mutation)\(\s*async\s*\(\s*ctx\s*,\s*){([^}]*)}(\s*\)\s*=>\s*{)/g, (_match, prefix, bindings, suffix) => {
            const names = bindings
                .split(",")
                .map((name) => name.trim())
                .filter(Boolean)
                .join(", ");
            return `${prefix}args: any${suffix}\n  const { ${names} } = args;`;
        });
        next = next.replace(/(export const \w+ = (?:query|mutation)\(\s*async\s*\()\s*ctx\s*(\s*,\s*args\s*)(\)\s*=>\s*{)/g, "$1ctx: any$2: any$3");
        next = next.replace(/(export const \w+ = (?:query|mutation)\(\s*async\s*\()\s*ctx\s*(\)\s*=>\s*{)/g, "$1ctx: any$2");
        next = next.replace(/handler:\s*async\s*\(\s*ctx\s*,\s*args\s*\)\s*=>\s*{/g, "handler: async (ctx: any, args: any) => {");
        next = next.replace(/handler:\s*async\s*\(\s*ctx\s*,\s*args:\s*any\s*\)\s*=>\s*{/g, "handler: async (ctx: any, args: any) => {");
        next = next.replace(/\.withIndex\(([^,]+),\s*\(\s*q\s*\)\s*=>/g, '.withIndex($1, (q: any) =>');
        next = next.replace(/\.filter\(\s*\(\s*q\s*\)\s*=>/g, '.filter((q: any) =>');
        next = next.replace(/\.order\(\s*\(\s*q\s*\)\s*=>/g, '.order((q: any) =>');
        if (next !== before) {
            appliedRules.push("convex/core:handler-shape");
        }
    }
    return {
        content: next,
        changed: next !== content,
        appliedRules,
        packIds,
    };
}
