import type { AESStateType } from "../state.js";
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
export declare function validatorRunner(state: AESStateType): Promise<Partial<AESStateType>>;
