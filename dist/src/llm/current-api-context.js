import { buildFrameworkContractContext, } from "../contracts/framework-contract-layer.js";
const HERMES_BASE_URL = (process.env.HERMES_RELEASE_URL ||
    process.env.HERMES_INTERNAL_URL ||
    process.env.HERMES_URL ||
    "").replace(/\/+$/, "");
const GENERAL_GENERATION_CONTEXT = `
CURRENT API CONTRACTS (validated March 2026):
- Next.js 15 App Router: any TSX file that uses client hooks such as useParams, useRouter, usePathname, useSearchParams, useAuth, useQuery, useMutation, useState, or useEffect must begin with "use client" on the first line. "use client" must be the absolute first line of the file — before any imports.
- Next.js 15 App Router server route props changed: params and searchParams may be async in server components, and cookies()/headers() are async helpers. Do not use legacy getServerSideProps/getStaticProps patterns inside app/.
- Convex React: useQuery/useMutation/useAction/usePaginatedQuery are client hooks imported from "convex/react", and pages using them must be client components.
- Convex server functions: ALWAYS use the object form: query({ args: { field: v.string() }, handler: async (ctx, args) => { ... } }). NEVER use the shorthand form query(async (ctx, args) => ...) — it causes implicit-any compile errors.
- Convex validators: v.id() without a table name causes "Expected 1 arguments, got 0". Always write v.id("tableName"). Same for v.optional(v.string()) and v.array(v.string()) — never bare v.optional() or v.array().
- Convex schema: defineTable() always takes a validator object argument. Never call defineTable() with no arguments.
- Clerk client: useAuth() returns { orgId, userId, isLoaded, isSignedIn, sessionId, orgRole, orgSlug }. The property "org" does NOT exist. Never destructure org from useAuth().
- Clerk server: use auth(), currentUser(), or clerkMiddleware() from "@clerk/nextjs/server". authMiddleware and withClerkMiddleware are deprecated and will cause build failures.
- React 19: prefer current functional component patterns and avoid outdated assumptions about legacy data fetching or deprecated React APIs.
- AES UI: every rendered JSX symbol from @aes/ui must be explicitly imported from "@aes/ui" in the same file. Common examples are Button, Card, CardHeader, CardContent, Badge, Input, Label, Select, Table, TableHeader, TableBody, TableRow, and TableCell.

KNOWN AES FAILURE CORRECTIONS:
- If a page renders <Button>, <Card>, or other @aes/ui components, import those exact symbols from "@aes/ui".
- If a page uses next/navigation, Clerk hooks, or Convex React hooks, mark it as a client component with "use client" as the first line.
- Never generate const { org } = useAuth() — use orgId instead.
- Never generate bare v.id() — always pass the table name: v.id("tableName").
- Never generate query(async (ctx, args) => { ... }) — always use query({ args: {...}, handler: async (ctx, args) => {...} }).
`.trim();
const HERMES_RECALL_SEEDS = [
    {
        label: "Clerk auth contract",
        errorMessage: "Property 'org' does not exist on type 'UseAuthReturn'",
    },
    {
        label: "AES UI imports",
        errorMessage: "Cannot find name 'Button'",
    },
    {
        label: "Next.js client directive",
        errorMessage: "useParams from next/navigation without use client",
    },
    {
        label: "Convex handler args",
        errorMessage: "Parameter 'args' implicitly has an 'any' type.",
    },
    {
        label: "Convex handler ctx",
        errorMessage: "Parameter 'ctx' implicitly has an 'any' type.",
    },
    {
        label: "Convex query builder",
        errorMessage: "Parameter 'q' implicitly has an 'any' type.",
    },
    {
        label: "Convex defineTable arity",
        errorMessage: "Expected 1 arguments, but got 0",
    },
    {
        label: "Convex bare v.id",
        errorMessage: "Expected 1 arguments, but got 0. v.id()",
    },
];
const contextCache = new Map();
async function fetchHermesCorrections() {
    if (!HERMES_BASE_URL)
        return "";
    const results = await Promise.allSettled(HERMES_RECALL_SEEDS.map(async (seed) => {
        const response = await fetch(`${HERMES_BASE_URL}/repair/recall`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                error_message: seed.errorMessage,
                limit: 1,
            }),
        });
        if (!response.ok)
            return null;
        const data = await response.json();
        const match = data.matches?.[0];
        if (!match?.diagnosis || !match.fix_action)
            return null;
        const successRate = typeof match.success_rate === "number"
            ? ` (success ${(match.success_rate * 100).toFixed(0)}%)`
            : "";
        return `- ${seed.label}: ${match.diagnosis}. Preferred fix: ${match.fix_action}.${successRate}`;
    }));
    const lines = results
        .map((result) => (result.status === "fulfilled" ? result.value : null))
        .filter((value) => Boolean(value));
    return lines.length > 0
        ? `HERMES LEARNED CORRECTIONS:\n${lines.join("\n")}`
        : "";
}
export async function getGenerationGroundTruth() {
    return getGenerationGroundTruthForPacks([]);
}
export async function getGenerationGroundTruthForPacks(contractPackIds) {
    const ids = Array.from(new Set(contractPackIds)).sort();
    const cacheKey = ids.join("|");
    const cached = contextCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
    }
    const contractContext = buildFrameworkContractContext(ids);
    const baseContext = contractContext
        ? `${GENERAL_GENERATION_CONTEXT}\n\n${contractContext}`
        : GENERAL_GENERATION_CONTEXT;
    let value = baseContext;
    try {
        const hermesCorrections = await fetchHermesCorrections();
        value = hermesCorrections
            ? `${baseContext}\n\n${hermesCorrections}`
            : baseContext;
    }
    catch {
        value = baseContext;
    }
    contextCache.set(cacheKey, {
        value,
        expiresAt: Date.now() + 5 * 60 * 1000,
    });
    return value;
}
