import { createHash } from "node:crypto";
import type { BuilderPackage } from "../builder-artifact.js";
import type { BuilderRunRecord } from "../types/artifacts.js";
import { CURRENT_SCHEMA_VERSION } from "../types/artifacts.js";
import { randomUUID } from "node:crypto";

export function hashPackage(pkg: BuilderPackage): string {
  return createHash("sha256").update(JSON.stringify(pkg)).digest("hex").substring(0, 16);
}

/**
 * Template-based builder for the first integration phase.
 * Generates file manifests based on the BuilderPackage without calling an LLM.
 * This proves the pipeline works end-to-end before adding AI code generation.
 */
export class TemplateBuilder {

  async build(jobId: string, pkg: BuilderPackage): Promise<BuilderRunRecord> {
    const runId = `br-${randomUUID().substring(0, 8)}`;
    const startTime = Date.now();

    const run: BuilderRunRecord = {
      run_id: runId,
      job_id: jobId,
      bridge_id: pkg.bridge_id,
      feature_id: pkg.feature_id,
      feature_name: pkg.feature_name,
      status: "building",
      input_package_hash: hashPackage(pkg),
      builder_package: pkg,
      files_created: [],
      files_modified: [],
      files_deleted: [],
      test_results: [],
      acceptance_coverage: { total_required: 0, covered: 0, missing: [] },
      scope_violations: [],
      constraint_violations: [],
      verification_passed: false,
      failure_reason: null,
      builder_model: "template-v1",
      duration_ms: 0,
      schema_version: CURRENT_SCHEMA_VERSION,
      created_at: new Date().toISOString(),
      completed_at: null,
      workspace_id: null,
      branch: null,
      base_commit: null,
      final_commit: null,
      diff_summary: null,
      pr_summary: null,
    };

    try {
      // Generate file manifest based on feature capabilities
      const files = this.generateFileManifest(pkg);
      run.files_created = files.created;
      run.files_modified = files.modified;

      // Generate test stubs for required tests
      const testResults = this.runTestStubs(pkg);
      run.test_results = testResults;

      // Calculate acceptance coverage
      const requiredTests = pkg.required_tests || [];
      const coveredTests = testResults.filter(t => t.passed);
      run.acceptance_coverage = {
        total_required: requiredTests.length,
        covered: coveredTests.length,
        missing: requiredTests
          .filter(rt => !testResults.find(tr => tr.test_id === rt.test_id && tr.passed))
          .map(rt => rt.test_id),
      };

      run.status = "build_succeeded";
      run.duration_ms = Date.now() - startTime;
      run.completed_at = new Date().toISOString();

    } catch (err: any) {
      run.status = "build_failed";
      run.failure_reason = err.message || String(err);
      run.duration_ms = Date.now() - startTime;
      run.completed_at = new Date().toISOString();
    }

    return run;
  }

  private generateFileManifest(pkg: BuilderPackage): { created: string[]; modified: string[] } {
    const created: string[] = [];
    const modified: string[] = [];
    const featureSlug = pkg.feature_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    // Generate files based on capabilities
    for (const cap of pkg.included_capabilities) {
      const capSlug = cap.toLowerCase().replace(/[^a-z0-9]+/g, "-");

      // Convex server function
      created.push(`convex/${featureSlug}/${capSlug}.ts`);

      // UI page or component
      if (cap.toLowerCase().includes("form") || cap.toLowerCase().includes("submit")) {
        created.push(`app/${featureSlug}/${capSlug}/page.tsx`);
        created.push(`components/${featureSlug}/${capSlug}-form.tsx`);
      } else if (cap.toLowerCase().includes("list") || cap.toLowerCase().includes("queue") || cap.toLowerCase().includes("table")) {
        created.push(`app/${featureSlug}/${capSlug}/page.tsx`);
        created.push(`components/${featureSlug}/${capSlug}-table.tsx`);
      } else if (cap.toLowerCase().includes("detail") || cap.toLowerCase().includes("view")) {
        created.push(`app/${featureSlug}/[id]/page.tsx`);
        created.push(`components/${featureSlug}/${capSlug}-detail.tsx`);
      } else {
        created.push(`app/${featureSlug}/${capSlug}/page.tsx`);
      }
    }

    // Schema file (always created for features with capabilities)
    if (pkg.included_capabilities.length > 0) {
      created.push(`convex/${featureSlug}/schema.ts`);
    }

    // Test files for required tests
    for (const test of pkg.required_tests || []) {
      const testSlug = test.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      created.push(`tests/${featureSlug}/${testSlug}.test.ts`);
    }

    // Convex schema.ts gets modified (not created) to add new table
    modified.push("convex/schema.ts");

    // Filter to only allowed write paths
    const allFiles = [...created, ...modified];
    const allowed = pkg.allowed_write_paths || [];
    if (allowed.length > 0) {
      const filtered = allFiles.filter(f =>
        allowed.some(a => f.startsWith(a))
      );
      return {
        created: created.filter(f => filtered.includes(f)),
        modified: modified.filter(f => filtered.includes(f)),
      };
    }

    return { created, modified };
  }

  private runTestStubs(pkg: BuilderPackage): { test_id: string; passed: boolean; output?: string }[] {
    // Template builder simulates test passes for all required tests.
    // Real builder will actually run tests.
    return (pkg.required_tests || []).map(test => ({
      test_id: test.test_id,
      passed: true,
      output: `[template-v1] Stub pass for: ${test.name}`,
    }));
  }
}
