/**
 * Pack-level contract tests for Convex packs.
 *
 * These verify that the framework-contract-layer's Convex packs contain
 * the rules, skeletons, and repair patterns that prevent the most common
 * compile failures in AES-generated Convex code.
 */

import { describe, it, expect } from "vitest";
import {
  getFrameworkContractPack,
  applyFrameworkContractGuardrails,
  buildFrameworkContractContext,
  detectContractPackIdsForFile,
} from "../../src/contracts/framework-contract-layer.js";

describe("convex/query-core pack", () => {
  const pack = getFrameworkContractPack("convex/query-core");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids shorthand query form", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/shorthand/i);
    expect(forbidden).toMatch(/query\(async/);
  });

  it("forbids args: any", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/args:\s*any/i);
  });

  it("forbids bare v.id()", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/bare v\.id\(\)/i);
  });

  it("requires returns: validator in hardRules", () => {
    const rules = pack.hardRules.join(" ");
    expect(rules).toMatch(/returns:/i);
  });

  it("has at least one template skeleton with returns:", () => {
    const hasReturns = pack.templateSkeletons.some((s) => s.code.includes("returns:"));
    expect(hasReturns).toBe(true);
  });

  it("has repair rule for implicit-any q parameter", () => {
    const rule = pack.repairRules.find((r) => r.id === "convex-query-implicit-q");
    expect(rule).toBeDefined();
    expect(rule!.trigger.errorRegex).toMatch(/implicitly has an 'any' type/);
  });
});

describe("convex/mutation-core pack", () => {
  const pack = getFrameworkContractPack("convex/mutation-core");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids shorthand mutation form", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/mutation\(async/);
  });

  it("requires returns: validator in hardRules", () => {
    const rules = pack.hardRules.join(" ");
    expect(rules).toMatch(/returns:/i);
  });

  it("template skeleton includes returns:", () => {
    const hasReturns = pack.templateSkeletons.some((s) => s.code.includes("returns:"));
    expect(hasReturns).toBe(true);
  });

  it("verified pattern includes returns:", () => {
    const hasReturns = pack.verifiedPatterns.some((p) => p.code.includes("returns:"));
    expect(hasReturns).toBe(true);
  });
});

describe("convex/schema-core pack", () => {
  const pack = getFrameworkContractPack("convex/schema-core");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids defineTable() with no arguments", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/defineTable\(\)/);
  });

  it("forbids bare v.id()", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/bare v\.id\(\)/i);
  });

  it("has repair rule for Expected 1 arguments", () => {
    const rule = pack.repairRules.find((r) => r.trigger.errorRegex.includes("Expected 1 arguments"));
    expect(rule).toBeDefined();
  });
});

describe("contract guardrails", () => {
  it("rewrites shorthand query form handler annotations", () => {
    const input = `export const list = query({
  args: { orgId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.query("items").collect();
  },
});`;
    const result = applyFrameworkContractGuardrails("convex/features/queries.ts", input);
    expect(result.changed).toBe(true);
    expect(result.content).toContain("ctx: any");
    expect(result.content).toContain("args: any");
  });

  it("annotates withIndex callback q parameter", () => {
    const input = `export const list = query({
  args: { orgId: v.string() },
  handler: async (ctx: any, args: any) => {
    return await ctx.db.query("items").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect();
  },
});`;
    const result = applyFrameworkContractGuardrails("convex/features/queries.ts", input);
    expect(result.changed).toBe(true);
    expect(result.content).toContain("(q: any) =>");
  });

  it("rewrites { org } to { orgId } in useAuth()", () => {
    const input = `"use client";
import { useAuth } from "@clerk/nextjs";
export default function Page() {
  const { org, userId } = useAuth();
  return <div>{org}</div>;
}`;
    const result = applyFrameworkContractGuardrails("app/dashboard/page.tsx", input);
    expect(result.changed).toBe(true);
    expect(result.content).not.toMatch(/\borg\b/);
    expect(result.content).toContain("orgId");
  });
});

describe("detectContractPackIdsForFile", () => {
  it("detects convex/query-core for queries.ts", () => {
    const ids = detectContractPackIdsForFile("convex/features/queries.ts", "");
    expect(ids).toContain("convex/query-core");
  });

  it("detects convex/mutation-core for mutations.ts", () => {
    const ids = detectContractPackIdsForFile("convex/features/mutations.ts", "");
    expect(ids).toContain("convex/mutation-core");
  });

  it("detects convex/schema-core for schema.ts", () => {
    const ids = detectContractPackIdsForFile("convex/schema.ts", "");
    expect(ids).toContain("convex/schema-core");
  });

  it("detects test/vitest-core for test files", () => {
    const ids = detectContractPackIdsForFile("tests/feature.test.tsx", "");
    expect(ids).toContain("test/vitest-core");
  });

  it("detects clerk/middleware for middleware.ts", () => {
    const ids = detectContractPackIdsForFile("middleware.ts", "");
    expect(ids).toContain("clerk/middleware");
  });
});

describe("buildFrameworkContractContext", () => {
  it("includes returns: in convex/query-core context", () => {
    const context = buildFrameworkContractContext(["convex/query-core"]);
    expect(context).toContain("returns:");
  });

  it("includes returns: in convex/mutation-core context", () => {
    const context = buildFrameworkContractContext(["convex/mutation-core"]);
    expect(context).toContain("returns:");
  });

  it("includes clerkMiddleware in clerk/middleware context", () => {
    const context = buildFrameworkContractContext(["clerk/middleware"]);
    expect(context).toContain("clerkMiddleware");
    expect(context).toContain("createRouteMatcher");
  });
});
