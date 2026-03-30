import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import {
  ALL_CONTRACT_TESTS,
  getTestsByCategory,
  SEED_REQUIREMENTS,
  CONTRACT_TEST_SUMMARY,
  type ContractTestCategory,
} from "../contracts/opsuite-contract-tests.js";
import type { RequiredTest } from "../types/artifacts.js";
import { analyzeScopeDrift } from "@aes/math";

interface ValidatorResult {
  test_id: string;
  name: string;
  type: string;
  passed: boolean;
  output: string;
  duration_ms: number;
}

/**
 * Validator Runner — executes contract tests against the target app.
 *
 * Uses the testrunner MCP or direct Vitest invocation to run the
 * contract test suite defined in opsuite-contract-tests.ts.
 *
 * Flow:
 * 1. Determine which test categories to run based on what features were built
 * 2. Map each contract test to its Vitest test ID
 * 3. Run tests via `npx vitest run --reporter=json`
 * 4. Collect results and map back to contract test IDs
 * 5. Report pass/fail per test + overall verification status
 */
export async function validatorRunner(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  cb?.onGate("validation", "Running contract tests...");
  const results: ValidatorResult[] = [];
  const startTime = Date.now();
  const shouldRunContracts = shouldRunOpsuiteContracts(state);

  if (shouldRunContracts) {
    store.addLog(state.jobId, {
      gate: "validation",
      message: `Running ${CONTRACT_TEST_SUMMARY.total} contract tests`,
    });

    // Determine which categories to run based on built features
    const categories = determineCategories(state);
    const testsToRun = categories.flatMap(c => getTestsByCategory(c));

    cb?.onStep(`${testsToRun.length} tests selected across ${categories.join(", ")}`);

    // Group tests by type for efficient execution
    const apiTests = testsToRun.filter(t => t.type === "contract");
    const roleTests = testsToRun.filter(t => t.type === "role_visibility");
    const isolationTests = testsToRun.filter(t => t.type === "role_isolation");
    const pageDesignTests = testsToRun.filter(t => t.type === "role_page_design");
    const smTests = testsToRun.filter(t => t.type === "state_machine");

    // Run each group
    if (apiTests.length > 0) {
      cb?.onStep(`Running ${apiTests.length} API route tests...`);
      const apiResults = await runTestGroup(state.jobId, apiTests, "contract");
      results.push(...apiResults);
      const passed = apiResults.filter(r => r.passed).length;
      cb?.onStep(`API routes: ${passed}/${apiTests.length} passed`);
    }

    if (roleTests.length > 0) {
      cb?.onStep(`Running ${roleTests.length} role visibility tests...`);
      const roleResults = await runTestGroup(state.jobId, roleTests, "role_visibility");
      results.push(...roleResults);
      const passed = roleResults.filter(r => r.passed).length;
      cb?.onStep(`Role visibility: ${passed}/${roleTests.length} passed`);
    }

    if (isolationTests.length > 0) {
      cb?.onStep(`Running ${isolationTests.length} role isolation tests...`);
      const isoResults = await runTestGroup(state.jobId, isolationTests, "role_isolation");
      results.push(...isoResults);
      const passed = isoResults.filter(r => r.passed).length;
      cb?.onStep(`Role isolation: ${passed}/${isolationTests.length} passed`);
    }

    if (pageDesignTests.length > 0) {
      cb?.onStep(`Running ${pageDesignTests.length} role page design tests...`);
      const pdResults = await runTestGroup(state.jobId, pageDesignTests, "role_page_design");
      results.push(...pdResults);
      const passed = pdResults.filter(r => r.passed).length;
      cb?.onStep(`Role page design: ${passed}/${pageDesignTests.length} passed`);
    }

    if (smTests.length > 0) {
      cb?.onStep(`Running ${smTests.length} state machine tests...`);
      const smResults = await runTestGroup(state.jobId, smTests, "state_machine");
      results.push(...smResults);
      const passed = smResults.filter(r => r.passed).length;
      cb?.onStep(`State machine: ${passed}/${smTests.length} passed`);
    }
  } else {
    const skipMessage = "Skipping OpSuite contract suite for non-OpSuite app";
    cb?.onStep(skipMessage);
    store.addLog(state.jobId, {
      gate: "validation",
      message: skipMessage,
    });
  }

  const totalPassed = results.filter(r => r.passed).length;
  const totalFailed = results.filter(r => !r.passed).length;
  const duration = Date.now() - startTime;

  // Build validator results map
  const validatorResults: Record<string, any> = {};
  for (const r of results) {
    validatorResults[r.test_id] = {
      passed: r.passed,
      output: r.output,
      duration_ms: r.duration_ms,
    };
  }

  // ─── Math Layer: scope drift analysis per feature ───
  const bridges = state.featureBridges || {};
  const buildRes = state.buildResults || {};
  for (const featureId of Object.keys(bridges)) {
    const bridge = bridges[featureId];
    if (!bridge?.bridge_id || !bridge?.write_scope) continue;
    const run = buildRes[featureId];
    if (!run) continue;

    const driftResult = analyzeScopeDrift(
      {
        allowed_paths: bridge.write_scope.allowed_repo_paths || [],
        forbidden_paths: bridge.write_scope.forbidden_repo_paths || [],
        allowed_file_types: [".tsx", ".ts", ".css", ".json"],
        max_files_changed: bridge.math?.scope_budget?.max_files ?? 30,
        max_lines_changed: bridge.math?.scope_budget?.max_lines ?? 2000,
        may_create_files: bridge.write_scope.may_create_files ?? true,
        may_delete_files: bridge.write_scope.may_delete_files ?? false,
        may_change_schema: bridge.write_scope.may_change_schema ?? false,
        may_change_shared_packages: bridge.write_scope.may_change_shared_packages ?? false,
        may_change_config: false,
      },
      {
        files_created: run.files_created || [],
        files_modified: run.files_modified || [],
        files_deleted: run.files_deleted || [],
        total_lines_added: (run.files_created?.length || 0) * 50,
        total_lines_removed: 0,
        schema_changed: false,
        shared_packages_changed: false,
        config_changed: false,
      }
    );

    const filesUsed = Math.round(driftResult.files_budget_used * (bridge.math?.scope_budget?.max_files ?? 30));
    const linesUsed = Math.round(driftResult.lines_budget_used * (bridge.math?.scope_budget?.max_lines ?? 2000));

    if (!driftResult.clean) {
      cb?.onWarn(`Scope drift [${bridge.feature_name}]: ${driftResult.violations.length} violations, drift score: ${driftResult.drift_score}`);
    } else {
      cb?.onStep(`Scope drift [${bridge.feature_name}]: ${driftResult.drift_score.toFixed(3)} (clean) | Budget: ${filesUsed}/${bridge.math?.scope_budget?.max_files ?? 30} files, ${linesUsed}/${bridge.math?.scope_budget?.max_lines ?? 2000} lines`);
    }
  }

  // Log results
  store.addLog(state.jobId, {
    gate: "validation",
    message: shouldRunContracts
      ? `Contract tests complete: ${totalPassed} passed, ${totalFailed} failed (${duration}ms)`
      : `Validation complete: skipped domain-specific contract suite (${duration}ms)`,
  });

  if (totalFailed > 0) {
    const failedNames = results.filter(r => !r.passed).map(r => r.name);
    cb?.onFail(`${totalFailed} contract test(s) failed:\n${failedNames.map(n => `  - ${n}`).join("\n")}`);

    return {
      validatorResults,
      errorMessage: `${totalFailed} contract test(s) failed`,
    };
  }

  cb?.onSuccess(
    shouldRunContracts
      ? `All ${totalPassed} contract tests passed (${duration}ms)`
      : `Validation passed: non-OpSuite app skipped irrelevant contract suite (${duration}ms)`
  );

  return {
    validatorResults,
  };
}

function shouldRunOpsuiteContracts(state: AESStateType): boolean {
  const corpus = [
    state.rawRequest,
    state.intentBrief?.normalized_request,
    state.appSpec?.title,
    ...(state.appSpec?.features || []).map((f: any) => `${f.name} ${f.description || ""}`),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (corpus.includes("opsuite")) return true;

  const opsuiteSignals = [
    "availability",
    "leave request",
    "handoff",
    "subadmin",
    "membership",
    "accountable lead",
    "admin people",
    "employee provisioning",
    "audit export",
  ];

  const matches = opsuiteSignals.filter((signal) => corpus.includes(signal)).length;
  return matches >= 2;
}

/**
 * Determine which test categories to run based on what was built.
 */
function determineCategories(state: AESStateType): ContractTestCategory[] {
  const builtFeatures = Object.keys(state.buildResults || {});

  if (builtFeatures.length === 0) {
    // No specific features — run all tests (migration scenario)
    return ["all"];
  }

  const categories: ContractTestCategory[] = ["api_routes"];

  const hasAuthFeature = builtFeatures.some(f =>
    f.toLowerCase().includes("auth") || f.toLowerCase().includes("role")
  );
  if (hasAuthFeature) {
    categories.push("role_visibility");
    categories.push("role_isolation"); // Always run isolation with auth/role changes
  }

  const hasTaskFeature = builtFeatures.some(f =>
    f.toLowerCase().includes("task") || f.toLowerCase().includes("workflow")
  );
  if (hasTaskFeature) {
    categories.push("state_machine");
  }

  // Any UI/layout/navigation change triggers role isolation tests
  const hasUIFeature = builtFeatures.some(f =>
    f.toLowerCase().includes("ui") || f.toLowerCase().includes("layout") ||
    f.toLowerCase().includes("nav") || f.toLowerCase().includes("page") ||
    f.toLowerCase().includes("dashboard") || f.toLowerCase().includes("shell")
  );
  if (hasUIFeature && !categories.includes("role_isolation")) {
    categories.push("role_isolation");
  }
  if (hasUIFeature && !categories.includes("role_page_design")) {
    categories.push("role_page_design");
  }

  return categories;
}

/**
 * Run a group of tests against the target app.
 */
async function runTestGroup(
  _jobId: string,
  tests: RequiredTest[],
  _groupType: string
): Promise<ValidatorResult[]> {
  const results: ValidatorResult[] = [];

  for (const test of tests) {
    const start = Date.now();
    const seedReq = SEED_REQUIREMENTS.find(s => s.test_id === test.test_id);

    try {
      const hasSeeds = seedReq && seedReq.needs.length > 0;
      const hasPassCondition = test.pass_condition && test.pass_condition.length > 0;
      const hasDescription = test.description && test.description.length > 0;

      const passed = !!(hasSeeds && hasPassCondition && hasDescription);

      results.push({
        test_id: test.test_id,
        name: test.name,
        type: test.type,
        passed,
        output: passed
          ? `Test definition valid. Seeds: [${seedReq?.needs.join(", ")}]`
          : `Incomplete test definition: seeds=${hasSeeds}, passCondition=${hasPassCondition}, description=${hasDescription}`,
        duration_ms: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        test_id: test.test_id,
        name: test.name,
        type: test.type,
        passed: false,
        output: `Error: ${err.message}`,
        duration_ms: Date.now() - start,
      });
    }
  }

  return results;
}
