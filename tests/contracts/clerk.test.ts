/**
 * Pack-level contract tests for Clerk packs.
 *
 * These verify that the framework-contract-layer's Clerk packs contain
 * the rules that prevent stale Clerk API usage (org vs orgId, deprecated
 * authMiddleware, missing "use client").
 */

import { describe, it, expect } from "vitest";
import {
  getFrameworkContractPack,
  applyFrameworkContractGuardrails,
  detectContractPackIdsForFile,
} from "../../src/contracts/framework-contract-layer.js";

describe("clerk/client-auth pack", () => {
  const pack = getFrameworkContractPack("clerk/client-auth");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids destructuring org from useAuth()", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/org/i);
  });

  it("requires 'use client' in hardRules", () => {
    const rules = pack.hardRules.join(" ");
    expect(rules).toMatch(/use client/i);
  });

  it("has repair rule for org property error", () => {
    const rule = pack.repairRules.find((r) => r.id === "clerk-client-org");
    expect(rule).toBeDefined();
    expect(rule!.trigger.errorRegex).toContain("org");
  });

  it("template skeleton starts with 'use client'", () => {
    const skeleton = pack.templateSkeletons[0];
    expect(skeleton).toBeDefined();
    expect(skeleton.code.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("template skeleton destructures orgId, not org", () => {
    const skeleton = pack.templateSkeletons[0];
    expect(skeleton.code).toContain("orgId");
    expect(skeleton.code).not.toMatch(/\borg\b[^I]/); // org but not orgId
  });
});

describe("clerk/server-auth pack", () => {
  const pack = getFrameworkContractPack("clerk/server-auth");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids authMiddleware", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toContain("authMiddleware");
  });

  it("forbids withClerkMiddleware", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toContain("withClerkMiddleware");
  });

  it("forbids useAuth() in server files", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/useAuth/);
  });

  it("template uses await auth()", () => {
    const skeleton = pack.templateSkeletons[0];
    expect(skeleton.code).toContain("await auth()");
  });
});

describe("clerk/middleware pack", () => {
  const pack = getFrameworkContractPack("clerk/middleware");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids authMiddleware", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toContain("authMiddleware");
  });

  it("forbids withClerkMiddleware", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toContain("withClerkMiddleware");
  });

  it("requires clerkMiddleware and createRouteMatcher", () => {
    const rules = pack.hardRules.join(" ");
    expect(rules).toContain("clerkMiddleware");
    expect(rules).toContain("createRouteMatcher");
  });

  it("template uses clerkMiddleware with async handler", () => {
    const skeleton = pack.templateSkeletons[0];
    expect(skeleton.code).toContain("clerkMiddleware(async");
    expect(skeleton.code).toContain("auth.protect()");
  });

  it("template exports config with matcher", () => {
    const skeleton = pack.templateSkeletons[0];
    expect(skeleton.code).toContain("export const config");
    expect(skeleton.code).toContain("matcher");
  });

  it("has repair rule for deprecated authMiddleware", () => {
    const rule = pack.repairRules.find((r) => r.id === "clerk-middleware-deprecated-auth");
    expect(rule).toBeDefined();
  });
});

describe("test/vitest-core pack", () => {
  const pack = getFrameworkContractPack("test/vitest-core");

  it("exists and is verified", () => {
    expect(pack).toBeDefined();
    expect(pack.status).toBe("verified");
  });

  it("forbids @/app/ imports", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/@\/app\//);
  });

  it("forbids no-op assertions", () => {
    const forbidden = pack.forbiddenPatterns.join(" ");
    expect(forbidden).toMatch(/expect\(true\)\.toBe\(true\)/);
  });

  it("requires Convex and Clerk mocking in hardRules", () => {
    const rules = pack.hardRules.join(" ");
    expect(rules).toContain("vi.mock");
    expect(rules).toContain("convex/react");
    expect(rules).toContain("@clerk/nextjs");
  });

  it("has repair rule for guessed app imports", () => {
    const rule = pack.repairRules.find((r) => r.id === "test-guessed-app-import");
    expect(rule).toBeDefined();
  });
});

describe("guardrails: clerk org → orgId rewrite", () => {
  it("replaces org with orgId in useAuth destructuring", () => {
    const input = `"use client";
import { useAuth } from "@clerk/nextjs";
function Page() {
  const { org, userId } = useAuth();
  return <div>{org}</div>;
}`;
    const result = applyFrameworkContractGuardrails("app/page.tsx", input);
    expect(result.changed).toBe(true);
    expect(result.content).toContain("orgId");
    expect(result.appliedRules).toContain("clerk/client-auth:orgId-binding");
  });

  it("replaces deprecated authMiddleware with clerkMiddleware", () => {
    const input = `import { authMiddleware } from "@clerk/nextjs/server";
export default authMiddleware({});`;
    const result = applyFrameworkContractGuardrails("middleware.ts", input);
    expect(result.changed).toBe(true);
    expect(result.content).toContain("clerkMiddleware");
    expect(result.content).not.toContain("authMiddleware");
  });
});

describe("detectContractPackIdsForFile: Clerk routing", () => {
  it("detects clerk/client-auth for TSX files using useAuth", () => {
    const ids = detectContractPackIdsForFile("app/dashboard/page.tsx", 'import { useAuth } from "@clerk/nextjs"');
    expect(ids).toContain("clerk/client-auth");
  });

  it("detects clerk/server-auth for route.ts files", () => {
    const ids = detectContractPackIdsForFile("app/api/users/route.ts", "");
    expect(ids).toContain("clerk/server-auth");
  });

  it("detects clerk/middleware for middleware.ts", () => {
    const ids = detectContractPackIdsForFile("middleware.ts", "");
    expect(ids).toContain("clerk/middleware");
  });

  it("detects clerk/middleware for content with clerkMiddleware", () => {
    const ids = detectContractPackIdsForFile("src/auth.ts", "import { clerkMiddleware } from '@clerk/nextjs/server'");
    expect(ids).toContain("clerk/middleware");
  });
});
