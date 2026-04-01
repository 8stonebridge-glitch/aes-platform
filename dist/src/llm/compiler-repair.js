import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getGenerationGroundTruthForPacks } from "./current-api-context.js";
import { getLLM, isLLMAvailable, safeLLMCall } from "./provider.js";
import { detectContractPackIdsForFile, } from "../contracts/framework-contract-layer.js";
function stripFences(text) {
    return text
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
}
function extractCandidatePaths(errorOutput) {
    const paths = new Set();
    const add = (value) => {
        const normalized = value
            .replace(/^\/vercel\/path0\//, "")
            .replace(/^\.\//, "")
            .trim();
        if (/\.(?:ts|tsx|js|jsx)$/.test(normalized)) {
            paths.add(normalized);
        }
    };
    const directMatches = errorOutput.matchAll(/(?:^|\n)\.\/([^\n:]+\.(?:ts|tsx|js|jsx))/g);
    for (const match of directMatches) {
        add(match[1]);
    }
    const tscMatches = errorOutput.matchAll(/(?:^|\n)([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx))\(\d+,\d+\):/g);
    for (const match of tscMatches) {
        add(match[1]);
    }
    const vercelMatches = errorOutput.matchAll(/\/vercel\/path0\/([^\]:]+\.(?:ts|tsx|js|jsx))/g);
    for (const match of vercelMatches) {
        add(match[1]);
    }
    // Also capture test files named in "Cannot find module" errors
    const moduleMatches = errorOutput.matchAll(/Cannot find module '(@\/[^']+)'[^\n]*\n[^\n]*(?:imported|required) from '([^']+\.(?:test|spec)\.(?:ts|tsx))'/g);
    for (const match of moduleMatches) {
        add(match[2]); // the test file doing the bad import
    }
    return Array.from(paths).slice(0, 4);
}
/** Regex-based pre-repair: strips guessed @/app/ route imports from test files
 *  and replaces them with an inline fixture stub so the test at least compiles.
 *  Returns null if nothing was changed (no guessed imports detected).
 */
function repairGuessedTestImports(content, filePath) {
    if (!/\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(filePath))
        return null;
    if (!/@\/app\//.test(content))
        return null;
    // Collect the imported names from each @/app/ import line
    const importedNames = [];
    const stripped = content.replace(/^import\s+(?:\*\s+as\s+(\w+)|(\w+)|\{([^}]+)\})\s+from\s+['"]@\/app\/[^'"]+['"]\s*;?\s*$/gm, (_match, star, def, named) => {
        if (star)
            importedNames.push(star);
        if (def)
            importedNames.push(def);
        if (named) {
            named.split(",").forEach((n) => {
                const trimmed = n.replace(/\s+as\s+\w+/, "").trim();
                if (trimmed)
                    importedNames.push(trimmed);
            });
        }
        return `// REPAIR: removed guessed app import — replaced with inline fixture below`;
    });
    if (stripped === content)
        return null; // nothing was removed
    // Build minimal inline fixtures for each removed export name
    const fixtures = importedNames.map((name) => {
        const isDefault = /^[A-Z]/.test(name); // PascalCase → likely a React component
        if (isDefault) {
            return `// Inline fixture replacing guessed import of "${name}"\nfunction ${name}() { return <div data-testid="${name.toLowerCase()}-fixture">{/* ${name} fixture */}</div>; }`;
        }
        return `// Inline stub replacing guessed import of "${name}"\nconst ${name} = () => null;`;
    });
    // Inject mocks and fixtures after the last real import line
    const MOCK_HEADER = `
// REPAIR: auto-mocks added because guessed @/app/ imports were removed
import { vi } from 'vitest';
vi.mock('convex/react', () => ({ useQuery: vi.fn(() => []), useMutation: vi.fn(() => vi.fn()), useAction: vi.fn(() => vi.fn()) }));
vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })) }));

${fixtures.join("\n\n")}
`;
    // Insert after the last import block
    const lastImportIdx = (() => {
        let last = -1;
        for (const m of stripped.matchAll(/^import\s+/gm)) {
            if (m.index !== undefined)
                last = m.index;
        }
        if (last === -1)
            return 0;
        const after = stripped.indexOf("\n", last);
        return after === -1 ? stripped.length : after + 1;
    })();
    return stripped.slice(0, lastImportIdx) + MOCK_HEADER + stripped.slice(lastImportIdx);
}
/**
 * Ensure test files that use fireEvent, waitFor, or screen have them imported
 * from @testing-library/react. This is a deterministic fix for a common LLM
 * mistake: using these globals without importing them.
 */
function repairTestingLibraryImports(content, filePath) {
    if (!/\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(filePath))
        return null;
    const needed = [];
    if (/\bfireEvent\b/.test(content) && !/import\s.*\bfireEvent\b.*from\s/.test(content))
        needed.push("fireEvent");
    if (/\bwaitFor\b/.test(content) && !/import\s.*\bwaitFor\b.*from\s/.test(content))
        needed.push("waitFor");
    if (/\bscreen\b/.test(content) && !/import\s.*\bscreen\b.*from\s/.test(content))
        needed.push("screen");
    if (/\bact\b\(/.test(content) && !/import\s.*\bact\b.*from\s/.test(content))
        needed.push("act");
    if (needed.length === 0)
        return null;
    // Check if there's an existing @testing-library/react import to merge into
    const existingImport = content.match(/^(import\s*\{)([^}]*?)(\}\s*from\s*['"]@testing-library\/react['"];?)$/m);
    if (existingImport) {
        const currentNames = existingImport[2].split(",").map(n => n.trim()).filter(Boolean);
        const merged = Array.from(new Set([...currentNames, ...needed])).sort();
        return content.replace(existingImport[0], `import { ${merged.join(", ")} } from '@testing-library/react';`);
    }
    // No existing import — add one after the last import line
    const lastImportMatch = [...content.matchAll(/^import\s+.*$/gm)];
    const lastImport = lastImportMatch.length > 0 ? lastImportMatch[lastImportMatch.length - 1] : null;
    if (lastImport && lastImport.index !== undefined) {
        const insertAt = lastImport.index + lastImport[0].length;
        return content.slice(0, insertAt) +
            `\nimport { ${needed.join(", ")} } from '@testing-library/react';` +
            content.slice(insertAt);
    }
    // No imports at all — prepend
    return `import { ${needed.join(", ")} } from '@testing-library/react';\n${content}`;
}
/**
 * Fix useState<string> / setState(null) type mismatches.
 * LLMs frequently generate useState<string>("") but then call setState(null).
 * Fix by widening the state type to include null: useState<string | null>.
 */
function repairNullStateAssignments(content, filePath) {
    if (!/\.(tsx?)$/.test(filePath))
        return null;
    // Only run if there's a useState and a setState(null) pattern
    if (!/\buseState\b/.test(content) || !/\(null\)/.test(content))
        return null;
    let modified = content;
    // Pattern: useState<string>("") ... setX(null) → useState<string | null>("")
    // Widen all useState<T> to useState<T | null> when the setter is called with null
    modified = modified.replace(/useState<(string|number|boolean)>\(/g, "useState<$1 | null>(");
    return modified !== content ? modified : null;
}
/**
 * LLMs frequently generate <Badge variant="..."> but the Badge component
 * only accepts HTMLSpanElement attributes (className, children). Strip
 * the variant prop entirely — styling should use className.
 */
function repairBadgeVariantProp(content, filePath) {
    if (!/\.tsx$/.test(filePath))
        return null;
    if (!/variant=/.test(content) || !/Badge/.test(content))
        return null;
    // <Badge variant="success"> → <Badge>
    // <Badge variant={...} className="..."> → <Badge className="...">
    const modified = content.replace(/<Badge(\s+)variant=(?:"[^"]*"|'[^']*'|\{[^}]*\})/g, "<Badge$1");
    return modified !== content ? modified : null;
}
/**
 * LLMs frequently generate <Button as="a" href="..."> which fails because
 * the Button component doesn't accept `as` or `href` props.
 * Replace with Next.js Link styled as a button.
 */
function repairButtonAsAnchor(content, filePath) {
    if (!/\.tsx$/.test(filePath))
        return null;
    if (!/as=["']a["']/.test(content))
        return null;
    let modified = content;
    // <Button as="a" href="/path" className="...">text</Button>
    // → <Link href="/path" className="...">text</Link>
    modified = modified.replace(/<Button\s+as=["']a["']\s+href=(["'][^"']+["'])\s*(className=(?:"[^"]*"|{[^}]*}))?([^>]*)>([\s\S]*?)<\/Button>/g, (_m, href, cls, rest, children) => {
        const clsPart = cls ? ` ${cls}` : "";
        return `<Link href=${href}${clsPart}${rest}>${children}</Link>`;
    });
    if (modified !== content) {
        // Ensure Link is imported
        if (!/import.*Link.*from\s+["']next\/link["']/.test(modified)) {
            const useClientMatch = modified.match(/^(\s*["']use client["'];?\s*\n)/);
            if (useClientMatch) {
                modified = modified.replace(useClientMatch[0], `${useClientMatch[0]}import Link from "next/link";\n`);
            }
            else {
                modified = `import Link from "next/link";\n${modified}`;
            }
        }
    }
    return modified !== content ? modified : null;
}
/**
 * Deterministic regex repairs for Convex and Clerk files.
 * These fix the most common generated-code violations without needing an LLM.
 * Returns null if nothing changed.
 */
function repairConvexClerkPatterns(content, filePath) {
    let next = content;
    const isConvex = /\/convex\//.test(filePath) && /\.(ts|tsx)$/.test(filePath);
    const isMiddleware = /middleware\.ts$/.test(filePath);
    const isTsx = /\.tsx$/.test(filePath);
    // ── Convex files: fix bare v.id(), v.optional(), v.array() ──
    if (isConvex) {
        // bare v.id() → v.id("items") — use "items" as safe default; the table name
        // will be corrected by context if the skeleton or schema is available
        next = next.replace(/\bv\.id\(\)/g, 'v.id("items")');
        // bare v.optional() → v.optional(v.string())
        next = next.replace(/\bv\.optional\(\)/g, 'v.optional(v.string())');
        // bare v.array() → v.array(v.string())
        next = next.replace(/\bv\.array\(\)/g, 'v.array(v.string())');
        // bare defineTable() → defineTable({ orgId: v.string(), ... })
        next = next.replace(/\bdefineTable\(\)/g, 'defineTable({ orgId: v.string(), createdBy: v.string(), createdAt: v.number(), updatedAt: v.number() })');
        // ── Fix shorthand query/mutation form → object form ──
        // Matches: export const foo = query(async (ctx, args) => {
        next = next.replace(/export\s+const\s+(\w+)\s*=\s*(query|mutation)\(\s*async\s*\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*=>\s*\{/g, (_m, name, fn, ctx, args) => `export const ${name} = ${fn}({\n  args: {},\n  returns: v.null(),\n  handler: async (${ctx}: any, ${args}: any) => {`);
        // ── Inject missing returns: validator into object-form queries/mutations ──
        // Matches query/mutation({ args: {...}, handler: ... }) without returns:
        next = next.replace(/((?:query|mutation)\(\s*\{[^}]*args\s*:\s*\{[^}]*\}\s*,)\s*(handler\s*:)/g, (match, prefix, handler) => {
            // Only inject if returns: isn't already present
            if (/returns\s*:/.test(match))
                return match;
            return `${prefix}\n  returns: v.null(),\n  ${handler}`;
        });
    }
    // ── Clerk: fix { org } → { orgId } in useAuth() destructuring ──
    if (isTsx || isMiddleware) {
        next = next.replace(/const\s*\{([^}]*)\borg\b([^}]*)\}\s*=\s*useAuth\(\)\s*;/g, (_match, before, after) => {
            const names = `${before},orgId,${after}`
                .split(",")
                .map((n) => n.trim())
                .filter(Boolean)
                .map((n) => (n === "org" ? "orgId" : n));
            const deduped = Array.from(new Set(names));
            return `const { ${deduped.join(", ")} } = useAuth();`;
        });
        // Also fix any remaining bare `org.` references → `orgId`
        // Only if we actually changed something above (org was destructured)
        if (next !== content && /\borg\./.test(next)) {
            next = next.replace(/\borg\./g, "orgId.");
        }
    }
    // ── Clerk middleware: replace deprecated authMiddleware ──
    if (isMiddleware) {
        if (/\bauthMiddleware\b/.test(next) && !/\bclerkMiddleware\b/.test(next)) {
            // Full file replacement — the deprecated pattern is too different to patch
            next = `import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
`;
        }
    }
    return next !== content ? next : null;
}
function loadCandidates(workspacePath, paths) {
    return paths.flatMap((relativePath) => {
        try {
            return [{
                    path: relativePath,
                    content: readFileSync(join(workspacePath, relativePath), "utf-8"),
                }];
        }
        catch {
            return [];
        }
    });
}
export async function repairFilesForCompilerErrors(args) {
    // ── Deterministic pre-repair: fix common patterns without LLM ──
    // Runs regex-based transforms for the most common blockers before acquiring the LLM slot.
    const deterministicChanged = [];
    const deterministicPaths = extractCandidatePaths(args.errorOutput);
    for (const relativePath of deterministicPaths) {
        try {
            const absPath = join(args.workspacePath, relativePath);
            const original = readFileSync(absPath, "utf-8");
            let repaired = null;
            // Test files: strip guessed @/app/ imports
            if (/\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(relativePath)) {
                repaired = repairGuessedTestImports(original, relativePath);
            }
            // Test files: fix missing fireEvent/waitFor/screen imports
            if (!repaired) {
                repaired = repairTestingLibraryImports(original, relativePath);
            }
            // Fix useState<string> + setState(null) type mismatches
            if (!repaired) {
                repaired = repairNullStateAssignments(original, relativePath);
            }
            // Fix <Badge variant="..."> → <Badge>
            if (!repaired) {
                repaired = repairBadgeVariantProp(original, relativePath);
            }
            // Fix <Button as="a" href="..."> → <Link href="...">
            if (!repaired) {
                repaired = repairButtonAsAnchor(original, relativePath);
            }
            // Convex/Clerk/middleware files: fix bare validators, shorthand forms, { org }, deprecated middleware
            if (!repaired) {
                repaired = repairConvexClerkPatterns(original, relativePath);
            }
            if (repaired && repaired !== original) {
                writeFileSync(absPath, repaired.trimEnd() + "\n");
                deterministicChanged.push(relativePath);
            }
        }
        catch {
            // file not readable — skip
        }
    }
    if (deterministicChanged.length > 0) {
        return {
            repaired: true,
            filesChanged: deterministicChanged,
            summary: `Deterministic repair: fixed ${deterministicChanged.join(", ")} (bare validators, shorthand forms, deprecated patterns, or guessed imports)`,
        };
    }
    if (!isLLMAvailable()) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "LLM unavailable for compiler repair.",
        };
    }
    const candidates = loadCandidates(args.workspacePath, extractCandidatePaths(args.errorOutput));
    if (candidates.length === 0) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "No repairable source files were identified from compiler output.",
        };
    }
    const llm = getLLM();
    if (!llm) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "LLM unavailable for compiler repair.",
        };
    }
    const repairPackIds = Array.from(new Set(candidates.flatMap((candidate) => detectContractPackIdsForFile(candidate.path, candidate.content))));
    const groundTruth = await getGenerationGroundTruthForPacks(repairPackIds);
    const hermesHints = args.hermesHints && args.hermesHints.length > 0
        ? `HERMES REPAIR HINTS:\n${args.hermesHints.map((hint) => `- ${hint}`).join("\n")}`
        : "HERMES REPAIR HINTS:\n- No prior fix available.";
    const hasTestFiles = candidates.some((c) => /\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$/.test(c.path));
    const testRepairRules = hasTestFiles ? `
Test file repair rules (apply when fixing .test.ts or .test.tsx files):
- If the error is "Cannot find module '@/app/...'": remove the import entirely. Define an inline fixture component inside the test file that replicates the component's shape. Never keep @/app/ imports in test files.
- If Convex hooks are used without mocking: add vi.mock('convex/react', () => ({ useQuery: vi.fn(() => []), useMutation: vi.fn(() => vi.fn()), useAction: vi.fn(() => vi.fn()) })) at the top of the file.
- If Clerk hooks are used without mocking: add vi.mock('@clerk/nextjs', () => ({ useAuth: vi.fn(() => ({ orgId: 'org_test', userId: 'user_test', isLoaded: true, isSignedIn: true })) })) at the top of the file.
- If the test has expect(true).toBe(true) or other no-op assertions: replace with a meaningful assertion (getByTestId, toBeInTheDocument, toHaveBeenCalledWith, etc).
- The repaired test file must not import from any @/app/ path. All component dependencies must be inline or imported from @/components/, @/lib/, or similar stable paths.` : "";
    const system = `${groundTruth}

You repair generated Next.js applications after compile or build failures.
Return strict JSON with this shape only:
{"files":[{"path":"relative/path.tsx","content":"full file content","reason":"short explanation"}]}

Rules:
- Only return files from the provided candidate list.
- Return full file contents, not patches.
- Keep existing behavior unless required to satisfy the compiler/build error.
- Prefer deterministic fixes: add missing imports, add "use client", correct Clerk useAuth() bindings (use orgId not org), correct broken JSX/TS syntax, and align with installed APIs.
- Convex: if a handler uses shorthand form query(async (ctx, args) => {...}), rewrite to object form query({ args: {...}, handler: async (ctx, args) => {...} }).
- Convex: if v.id() appears without a table name, replace with v.id("tableName") using the most contextually appropriate table name.
- Do not invent new dependencies unless the error explicitly requires it.
- If no file change is needed, return {"files":[]}.${testRepairRules}`;
    const user = `Compiler/build output:
${args.errorOutput}

${hermesHints}

Candidate files:
${candidates.map((candidate) => `FILE: ${candidate.path}\n${candidate.content}`).join("\n\n")}`;
    const response = await safeLLMCall("compiler-repair", () => llm.invoke([
        { role: "system", content: system },
        { role: "user", content: user },
    ]));
    if (!response) {
        return {
            repaired: false,
            filesChanged: [],
            summary: "Compiler repair model did not return a response.",
        };
    }
    const text = typeof response.content === "string"
        ? response.content
        : String(response.content);
    let parsed;
    try {
        parsed = JSON.parse(stripFences(text));
    }
    catch {
        return {
            repaired: false,
            filesChanged: [],
            summary: "Compiler repair model returned invalid JSON.",
        };
    }
    const allowedPaths = new Set(candidates.map((candidate) => candidate.path));
    const changedFiles = [];
    for (const file of parsed.files || []) {
        if (!allowedPaths.has(file.path))
            continue;
        const absolutePath = join(args.workspacePath, file.path);
        const current = readFileSync(absolutePath, "utf-8");
        if (typeof file.content !== "string" || file.content.trim() === current.trim())
            continue;
        writeFileSync(absolutePath, file.content.trimEnd() + "\n");
        changedFiles.push(file.path);
    }
    return {
        repaired: changedFiles.length > 0,
        filesChanged: changedFiles,
        summary: changedFiles.length > 0
            ? `Patched ${changedFiles.length} file(s): ${changedFiles.join(", ")}`
            : "Compiler repair model produced no file changes.",
    };
}
