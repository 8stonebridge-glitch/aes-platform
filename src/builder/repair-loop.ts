/**
 * Repair Loop — Targeted per-feature repair after gate failures.
 *
 * When a compile or build gate fails, this module:
 * 1. Maps the error to the responsible feature's patch bundle
 * 2. Queries the graph for known fix patterns
 * 3. Attempts deterministic, graph-guided, LLM, and Perplexity repairs
 * 4. Re-verifies after each attempt
 * 5. Continues until pass or bounded exhaustion
 *
 * Bounds: 3 attempts per feature, 10 total across all features.
 */

import { randomUUID } from "node:crypto";

import { CheckRunner } from "./check-runner.js";
import {
  repairFilesForCompilerErrors,
  searchPerplexityForFix,
} from "../llm/compiler-repair.js";

import type {
  FeaturePatchBundle,
  RepairCase,
  PatchAttempt,
  VerificationResult,
  VerificationCheck,
  GraphRepairMatch,
} from "../types/patch-bundle.js";

const MAX_ATTEMPTS_PER_FEATURE = 3;
const MAX_ATTEMPTS_TOTAL = 10;

// ─── Error-to-Feature Mapping ───────────────────────────

/**
 * Map a compile/build error to the feature that likely caused it.
 * Parses error file paths and matches against bundle file manifests.
 */
export function mapErrorToFeature(
  errorOutput: string,
  bundles: FeaturePatchBundle[],
): string | null {
  const errorPaths = extractErrorPaths(errorOutput);

  for (const errorPath of errorPaths) {
    for (const bundle of bundles) {
      const bundleFiles = [
        ...bundle.files_added.map(f => f.path),
        ...bundle.files_modified.map(f => f.path),
      ];
      for (const bundlePath of bundleFiles) {
        if (errorPath === bundlePath || errorPath.endsWith(bundlePath) || bundlePath.endsWith(errorPath)) {
          return bundle.feature_id;
        }
      }
    }
  }

  // Try matching by feature slug in the error path
  for (const errorPath of errorPaths) {
    for (const bundle of bundles) {
      const slug = bundle.feature_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (errorPath.includes(`/${slug}/`) || errorPath.includes(`/${slug}.`)) {
        return bundle.feature_id;
      }
    }
  }

  return null; // can't attribute — shared file or unclear
}

function extractErrorPaths(errorOutput: string): string[] {
  const paths = new Set<string>();

  // TSC format: file.tsx(12,5): error TS...
  const tscMatches = errorOutput.matchAll(
    /([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx))\(\d+,\d+\)/g,
  );
  for (const m of tscMatches) {
    paths.add(m[1].replace(/^\.\//, "").replace(/^\/vercel\/path0\//, ""));
  }

  // Next.js format: ./file.tsx
  const nextMatches = errorOutput.matchAll(
    /(?:^|\n)\.\/([^\n:]+\.(?:ts|tsx|js|jsx))/g,
  );
  for (const m of nextMatches) {
    paths.add(m[1]);
  }

  return Array.from(paths).slice(0, 10);
}

// ─── Repair Case Management ────────────────────────────

/**
 * Open a repair case from a gate failure.
 */
export function openRepairCase(
  gateResult: VerificationResult,
  bundles: FeaturePatchBundle[],
  graphContext?: any,
): RepairCase {
  const errorSignature = gateResult.error_pattern ||
    gateResult.error_message?.slice(0, 200) || "unknown_error";

  const suspectedFeatureId = gateResult.error_message
    ? mapErrorToFeature(gateResult.error_message, bundles)
    : null;

  // Query graph for matching fix patterns
  const graphMatches = queryGraphForFixes(errorSignature, graphContext);

  return {
    case_id: `rc-${randomUUID().substring(0, 8)}`,
    job_id: bundles[0]?.job_id || "",
    gate_result: gateResult,
    suspected_feature_id: suspectedFeatureId,
    error_signature: errorSignature,
    graph_matches: graphMatches,
    attempts: [],
    status: "open",
    max_attempts_per_feature: MAX_ATTEMPTS_PER_FEATURE,
    max_attempts_total: MAX_ATTEMPTS_TOTAL,
    created_at: new Date().toISOString(),
  };
}

/**
 * Query the graph context for known fix patterns matching this error.
 */
function queryGraphForFixes(
  errorSignature: string,
  graphContext?: any,
): GraphRepairMatch[] {
  if (!graphContext) return [];

  const matches: GraphRepairMatch[] = [];
  const sigLower = errorSignature.toLowerCase();

  // Check fixPatterns from graph
  for (const fix of graphContext.fixPatterns || []) {
    const errorPattern = (fix.error_pattern || fix.name || "").toLowerCase();
    if (sigLower.includes(errorPattern) || errorPattern.includes(sigLower.slice(0, 50))) {
      matches.push({
        node_type: "FixPattern",
        node_id: fix.pattern_id || fix.name || "",
        name: fix.name || "unknown",
        fix_strategy: fix.fix_strategy || fix.resolution || "",
        success_rate: fix.success_rate ?? 0.5,
      });
    }
  }

  // Check preventionRules
  for (const rule of graphContext.preventionRules || []) {
    const condition = (rule.condition || rule.description || "").toLowerCase();
    if (sigLower.includes(condition.slice(0, 40)) || condition.includes(sigLower.slice(0, 40))) {
      matches.push({
        node_type: "PreventionRule",
        node_id: rule.name || "",
        name: rule.name || "unknown",
        fix_strategy: rule.action || rule.description || "",
        success_rate: 0.7,
      });
    }
  }

  // Check failureHistory
  for (const failure of graphContext.failureHistory || []) {
    const desc = (failure.description || failure.name || "").toLowerCase();
    if (sigLower.includes(desc.slice(0, 40)) || desc.includes(sigLower.slice(0, 40))) {
      matches.push({
        node_type: "FailurePattern",
        node_id: failure.pattern_id || failure.name || "",
        name: failure.name || "unknown",
        fix_strategy: failure.resolution || failure.fix_action || "",
        success_rate: 0.5,
      });
    }
  }

  // Sort by success rate descending
  return matches.sort((a, b) => b.success_rate - a.success_rate).slice(0, 5);
}

// ─── Verification ───────────────────────────────────────

/**
 * Run verification checks on the workspace.
 * If a specific failing check is provided, run only that first (fast feedback).
 */
export async function runVerificationForPatch(
  workspacePath: string,
  failingCheckName?: string,
): Promise<VerificationResult> {
  const checker = new CheckRunner();
  const checks: VerificationCheck[] = [];
  const start = Date.now();

  // Run the specific failing check first for fast feedback
  if (failingCheckName === "convex-typecheck") {
    const result = await checker.runConvexTypecheck(workspacePath);
    checks.push({
      name: result.check,
      passed: result.passed,
      output: result.output?.slice(0, 2000),
      duration_ms: result.duration_ms || 0,
    });
    if (!result.passed) {
      return makeVerificationResult(checks, start);
    }
  }

  // Run all checks in order
  const convexCheck = failingCheckName === "convex-typecheck"
    ? checks[0] // already ran
    : await runCheck(checker, "convex-typecheck", workspacePath, checks);

  if (!convexCheck?.passed) return makeVerificationResult(checks, start);

  const typecheck = await runCheck(checker, "typecheck", workspacePath, checks);
  if (!typecheck?.passed) return makeVerificationResult(checks, start);

  await runCheck(checker, "build", workspacePath, checks);
  return makeVerificationResult(checks, start);
}

async function runCheck(
  checker: CheckRunner,
  checkName: string,
  workspacePath: string,
  checks: VerificationCheck[],
): Promise<VerificationCheck> {
  let result: any;
  switch (checkName) {
    case "convex-typecheck":
      result = await checker.runConvexTypecheck(workspacePath);
      break;
    case "typecheck":
      result = await checker.runTypecheck(workspacePath);
      break;
    case "build":
      result = await checker.runBuild(workspacePath);
      break;
    default:
      result = { check: checkName, passed: true, output: "", duration_ms: 0 };
  }

  const check: VerificationCheck = {
    name: result.check || checkName,
    passed: result.passed,
    output: result.output?.slice(0, 2000),
    duration_ms: result.duration_ms || 0,
  };
  checks.push(check);
  return check;
}

function makeVerificationResult(
  checks: VerificationCheck[],
  startTime: number,
): VerificationResult {
  const failingCheck = checks.find(c => !c.passed);
  const errorOutput = failingCheck?.output || "";

  // Extract error file path and pattern
  const errorPaths = extractErrorPaths(errorOutput);
  const errorPattern = extractErrorPattern(errorOutput);

  return {
    passed: !failingCheck,
    checks,
    error_message: failingCheck ? errorOutput : undefined,
    error_file_path: errorPaths[0],
    error_pattern: errorPattern,
    duration_ms: Date.now() - startTime,
  };
}

function extractErrorPattern(errorOutput: string): string | undefined {
  if (!errorOutput) return undefined;

  // Find the most descriptive error line
  const patterns = [
    /Type error:\s*(.+)/i,
    /error TS\d+:\s*(.+)/,
    /Module not found:\s*(.+)/i,
    /Cannot find module\s*(.+)/,
    /Property '(\w+)' does not exist/,
  ];

  for (const pattern of patterns) {
    const match = errorOutput.match(pattern);
    if (match) return match[0].slice(0, 200);
  }

  // Fallback: first non-empty line with "error"
  const lines = errorOutput.split("\n").filter(l => /error/i.test(l));
  return lines[0]?.slice(0, 200);
}

// ─── Repair Attempt ─────────────────────────────────────

/**
 * Execute one repair attempt on the workspace.
 * Tries in order: deterministic → graph-guided → LLM → Perplexity.
 */
export async function attemptRepair(
  repairCase: RepairCase,
  workspacePath: string,
  bundles: FeaturePatchBundle[],
): Promise<PatchAttempt> {
  const attemptNumber = repairCase.attempts.length + 1;
  const start = Date.now();
  const errorOutput = repairCase.gate_result.error_message || "";

  // Build hints from graph matches
  const graphHints = repairCase.graph_matches
    .filter(m => m.fix_strategy)
    .map(m => `[${m.node_type}] ${m.name}: ${m.fix_strategy}`);

  // Try deterministic + LLM repair (combined in repairFilesForCompilerErrors)
  const llmRepair = await repairFilesForCompilerErrors({
    workspacePath,
    errorOutput,
    hermesHints: graphHints,
  });

  if (llmRepair.repaired && llmRepair.filesChanged.length > 0) {
    return {
      attempt_id: `pa-${randomUUID().substring(0, 8)}`,
      attempt_number: attemptNumber,
      feature_id: repairCase.suspected_feature_id,
      repair_source: graphHints.length > 0 ? "graph" : "llm",
      files_changed: llmRepair.filesChanged,
      verification_result: null, // caller will verify
      succeeded: false, // unknown until verified
      duration_ms: Date.now() - start,
      created_at: new Date().toISOString(),
    };
  }

  // Escalate to Perplexity
  const errorPattern = repairCase.error_signature;
  const perplexityFix = await searchPerplexityForFix(errorPattern, errorOutput);

  if (perplexityFix) {
    // Retry LLM repair with Perplexity guidance
    const perplexityRepair = await repairFilesForCompilerErrors({
      workspacePath,
      errorOutput,
      hermesHints: [
        ...graphHints,
        `PERPLEXITY FIX GUIDANCE: ${perplexityFix}`,
      ],
    });

    if (perplexityRepair.repaired && perplexityRepair.filesChanged.length > 0) {
      return {
        attempt_id: `pa-${randomUUID().substring(0, 8)}`,
        attempt_number: attemptNumber,
        feature_id: repairCase.suspected_feature_id,
        repair_source: "perplexity",
        files_changed: perplexityRepair.filesChanged,
        verification_result: null,
        succeeded: false,
        duration_ms: Date.now() - start,
        created_at: new Date().toISOString(),
      };
    }
  }

  // No repair produced changes
  return {
    attempt_id: `pa-${randomUUID().substring(0, 8)}`,
    attempt_number: attemptNumber,
    feature_id: repairCase.suspected_feature_id,
    repair_source: "llm",
    files_changed: [],
    verification_result: null,
    succeeded: false,
    duration_ms: Date.now() - start,
    created_at: new Date().toISOString(),
  };
}

// ─── Full Repair Loop ───────────────────────────────────

/**
 * Run the complete repair loop: attempt repairs until pass or exhaustion.
 * Returns the final verification result.
 */
export async function runRepairLoop(
  initialGateResult: VerificationResult,
  workspacePath: string,
  bundles: FeaturePatchBundle[],
  graphContext?: any,
  onLog?: (message: string) => void,
): Promise<{
  verification: VerificationResult;
  repairCase: RepairCase;
}> {
  const repairCase = openRepairCase(initialGateResult, bundles, graphContext);

  onLog?.(`[repair-loop] Opened repair case ${repairCase.case_id}` +
    (repairCase.suspected_feature_id
      ? ` — suspected feature: ${repairCase.suspected_feature_id}`
      : " — cannot attribute to specific feature") +
    ` — ${repairCase.graph_matches.length} graph matches`);

  let currentResult = initialGateResult;
  let totalAttempts = 0;
  const featureAttemptCounts = new Map<string, number>();

  while (
    !currentResult.passed &&
    totalAttempts < MAX_ATTEMPTS_TOTAL &&
    repairCase.status === "open"
  ) {
    // Check per-feature bounds
    const targetFeature = repairCase.suspected_feature_id || "__shared__";
    const featureAttempts = featureAttemptCounts.get(targetFeature) || 0;

    if (featureAttempts >= MAX_ATTEMPTS_PER_FEATURE) {
      // Try attributing to a different feature
      const altFeature = findAlternativeFeature(
        currentResult,
        bundles,
        repairCase.suspected_feature_id,
      );
      if (altFeature) {
        repairCase.suspected_feature_id = altFeature;
        onLog?.(`[repair-loop] Pivoting to alternative feature: ${altFeature}`);
        continue;
      }
      repairCase.status = "exhausted";
      onLog?.(`[repair-loop] Feature ${targetFeature} exhausted ${MAX_ATTEMPTS_PER_FEATURE} attempts — repair exhausted`);
      break;
    }

    onLog?.(`[repair-loop] Attempt ${totalAttempts + 1}/${MAX_ATTEMPTS_TOTAL} (feature: ${targetFeature}, attempt ${featureAttempts + 1}/${MAX_ATTEMPTS_PER_FEATURE})`);

    const attempt = await attemptRepair(repairCase, workspacePath, bundles);
    totalAttempts++;
    featureAttemptCounts.set(targetFeature, featureAttempts + 1);

    if (attempt.files_changed.length > 0) {
      // Verify the repair
      const failingCheckName = currentResult.checks.find(c => !c.passed)?.name;
      const verification = await runVerificationForPatch(workspacePath, failingCheckName);
      attempt.verification_result = verification;
      attempt.succeeded = verification.passed;
      currentResult = verification;

      onLog?.(`[repair-loop] Attempt ${totalAttempts}: ${attempt.repair_source} repair changed ${attempt.files_changed.length} files → ${verification.passed ? "PASS" : "FAIL"}`);

      if (verification.passed) {
        repairCase.status = "repaired";
      } else {
        // Update suspected feature from new error
        const newSuspect = mapErrorToFeature(
          verification.error_message || "",
          bundles,
        );
        if (newSuspect && newSuspect !== repairCase.suspected_feature_id) {
          repairCase.suspected_feature_id = newSuspect;
          // Update graph matches for new error
          repairCase.graph_matches = queryGraphForFixes(
            verification.error_pattern || verification.error_message?.slice(0, 200) || "",
            graphContext,
          );
          onLog?.(`[repair-loop] Error shifted to feature: ${newSuspect}`);
        }
      }
    } else {
      onLog?.(`[repair-loop] Attempt ${totalAttempts}: no files changed — skipping verification`);
      // No progress made — increment to avoid infinite loop
    }

    repairCase.attempts.push(attempt);
  }

  if (totalAttempts >= MAX_ATTEMPTS_TOTAL && !currentResult.passed) {
    repairCase.status = "exhausted";
    onLog?.(`[repair-loop] Exhausted all ${MAX_ATTEMPTS_TOTAL} attempts`);
  }

  return { verification: currentResult, repairCase };
}

function findAlternativeFeature(
  result: VerificationResult,
  bundles: FeaturePatchBundle[],
  excludeFeatureId: string | null,
): string | null {
  if (!result.error_message) return null;
  const allErrors = result.error_message;
  const paths = extractErrorPaths(allErrors);

  for (const path of paths) {
    for (const bundle of bundles) {
      if (bundle.feature_id === excludeFeatureId) continue;
      const slug = bundle.feature_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (path.includes(`/${slug}/`) || path.includes(`/${slug}.`)) {
        return bundle.feature_id;
      }
    }
  }
  return null;
}
