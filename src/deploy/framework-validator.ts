import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export interface FrameworkCheckResult {
  check: string;
  passed: boolean;
  detail: string;
}

/**
 * Validates generated code against actual Next.js + Clerk + Convex constraints.
 * Runs before approval, after code generation.
 */
export class FrameworkValidator {

  validateAll(workspacePath: string): FrameworkCheckResult[] {
    const results: FrameworkCheckResult[] = [];

    results.push(this.checkNextjsStructure(workspacePath));
    results.push(this.checkConvexSchema(workspacePath));
    results.push(this.checkClerkMiddleware(workspacePath));
    results.push(this.checkConvexOrgFiltering(workspacePath));
    results.push(this.checkAuditLogging(workspacePath));
    results.push(this.checkEnvConfig(workspacePath));
    results.push(this.checkRouteProtection(workspacePath));

    return results;
  }

  private checkNextjsStructure(base: string): FrameworkCheckResult {
    const hasLayout = existsSync(join(base, "app", "layout.tsx"));
    const hasPage = existsSync(join(base, "app", "page.tsx"));
    const hasNextConfig = existsSync(join(base, "next.config.mjs")) || existsSync(join(base, "next.config.js"));

    if (hasLayout && hasPage && hasNextConfig) {
      return { check: "nextjs_structure", passed: true, detail: "App Router structure valid" };
    }

    const missing: string[] = [];
    if (!hasLayout) missing.push("app/layout.tsx");
    if (!hasPage) missing.push("app/page.tsx");
    if (!hasNextConfig) missing.push("next.config");
    return { check: "nextjs_structure", passed: false, detail: `Missing: ${missing.join(", ")}` };
  }

  private checkConvexSchema(base: string): FrameworkCheckResult {
    const schemaPath = join(base, "convex", "schema.ts");
    if (!existsSync(schemaPath)) {
      return { check: "convex_schema", passed: false, detail: "convex/schema.ts not found" };
    }

    const content = readFileSync(schemaPath, "utf-8");
    if (!content.includes("defineSchema")) {
      return { check: "convex_schema", passed: false, detail: "convex/schema.ts does not use defineSchema" };
    }

    return { check: "convex_schema", passed: true, detail: "Convex schema valid" };
  }

  private checkClerkMiddleware(base: string): FrameworkCheckResult {
    const mwPath = join(base, "middleware.ts");
    if (!existsSync(mwPath)) {
      return { check: "clerk_middleware", passed: false, detail: "middleware.ts not found — routes are unprotected" };
    }

    const content = readFileSync(mwPath, "utf-8");
    if (!content.includes("clerkMiddleware")) {
      return { check: "clerk_middleware", passed: false, detail: "middleware.ts does not use clerkMiddleware" };
    }

    return { check: "clerk_middleware", passed: true, detail: "Clerk middleware configured" };
  }

  private checkConvexOrgFiltering(base: string): FrameworkCheckResult {
    // Check that all Convex query files use orgId filtering
    const convexDir = join(base, "convex");
    if (!existsSync(convexDir)) {
      return { check: "convex_org_filter", passed: true, detail: "No Convex dir (skipped)" };
    }

    const issues: string[] = [];
    this.walkDir(convexDir, (filePath) => {
      if (!filePath.endsWith(".ts") || filePath.includes("_generated") || filePath.includes("tsconfig") || filePath.endsWith("schema.ts")) return;

      const content = readFileSync(filePath, "utf-8");
      // Check query functions for orgId
      if (content.includes("query(") && !content.includes("orgId")) {
        const relative = filePath.replace(base + "/", "");
        issues.push(relative);
      }
    });

    if (issues.length > 0) {
      return { check: "convex_org_filter", passed: false, detail: `Queries without orgId: ${issues.join(", ")}` };
    }
    return { check: "convex_org_filter", passed: true, detail: "All queries filter by orgId" };
  }

  private checkAuditLogging(base: string): FrameworkCheckResult {
    const convexDir = join(base, "convex");
    if (!existsSync(convexDir)) {
      return { check: "audit_logging", passed: true, detail: "No Convex dir (skipped)" };
    }

    const hasAuditTable = existsSync(join(convexDir, "schema.ts")) &&
      readFileSync(join(convexDir, "schema.ts"), "utf-8").includes("audit_logs");
    const hasAuditMutation = existsSync(join(convexDir, "audit.ts"));

    if (hasAuditTable && hasAuditMutation) {
      return { check: "audit_logging", passed: true, detail: "Audit log table and mutation present" };
    }

    const missing: string[] = [];
    if (!hasAuditTable) missing.push("audit_logs table in schema");
    if (!hasAuditMutation) missing.push("convex/audit.ts mutation");
    return { check: "audit_logging", passed: false, detail: `Missing: ${missing.join(", ")}` };
  }

  private checkEnvConfig(base: string): FrameworkCheckResult {
    const hasExample = existsSync(join(base, ".env.local.example"));
    if (!hasExample) {
      return { check: "env_config", passed: false, detail: ".env.local.example not found — deployment will fail" };
    }

    const content = readFileSync(join(base, ".env.local.example"), "utf-8");
    const required = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "NEXT_PUBLIC_CONVEX_URL"];
    const missing = required.filter(key => !content.includes(key));

    if (missing.length > 0) {
      return { check: "env_config", passed: false, detail: `Missing env vars in example: ${missing.join(", ")}` };
    }
    return { check: "env_config", passed: true, detail: "All required env vars documented" };
  }

  private checkRouteProtection(base: string): FrameworkCheckResult {
    const mwPath = join(base, "middleware.ts");
    if (!existsSync(mwPath)) {
      return { check: "route_protection", passed: false, detail: "No middleware — all routes unprotected" };
    }

    const content = readFileSync(mwPath, "utf-8");
    if (content.includes("isPublicRoute") && content.includes("auth.protect")) {
      return { check: "route_protection", passed: true, detail: "Public/protected route split configured" };
    }

    return { check: "route_protection", passed: false, detail: "Middleware exists but may not protect routes correctly" };
  }

  private walkDir(dir: string, callback: (path: string) => void) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "node_modules" && entry !== "_generated" && entry !== ".next") {
          this.walkDir(full, callback);
        }
      } else {
        callback(full);
      }
    }
  }
}
