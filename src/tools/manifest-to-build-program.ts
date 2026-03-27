/**
 * manifest-to-build-program.ts — Bridge that converts the auto-build-runner's
 * BuildManifest into the AES builder infrastructure's BuildProgramInput, then
 * optionally executes it via the operator HTTP server.
 *
 * Usage:
 *   # Convert manifest to build program JSON (stdout)
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json
 *
 *   # Convert and execute via operator HTTP server
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --execute
 *
 *   # Convert with custom builder settings
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --timeout 300000 --stop-on-failure
 *
 *   # Execute against a custom URL
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --execute-url http://localhost:5500/api/build-programs/run
 *
 *   # From stdin
 *   cat build-manifest.json | npx tsx src/tools/manifest-to-build-program.ts --stdin --execute
 *
 *   # Output to file
 *   npx tsx src/tools/manifest-to-build-program.ts build-manifest-2026-03-26.json --output build-program.json
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { DesignConstraints } from "../types/design-evidence.js";

// ═══════════════════════════════════════════════════════════════
// TYPES — BuildManifest (from auto-build-runner)
// ═══════════════════════════════════════════════════════════════

export interface DonorMatch {
  app_name: string;
  app_class: string;
  overall_score: number;
  matched_features: string[];
  matched_models: string[];
  matched_integrations: string[];
  matched_patterns: string[];
  reuse_suggestions: string[];
}

export interface LightBridge {
  feature_name: string;
  description: string;
  scope: {
    paths_allowed: string[];
    paths_forbidden: string[];
    max_files: number;
    max_lines: number;
  };
  dependencies: string[];
  donor_reuse: { app: string; suggestions: string[] }[];
  required_models: string[];
  required_integrations: string[];
  confidence: number;
  tests: string[];
  design_constraints?: DesignConstraints;
}

export interface FeatureBuildState {
  name: string;
  status:
    | "pending"
    | "finding_donors"
    | "compiling_bridge"
    | "checking_vetoes"
    | "ready"
    | "blocked"
    | "skipped";
  donors: DonorMatch[];
  bridge: LightBridge | null;
  vetoes: string[];
  blocking_reason: string | null;
  artifact_state: string;
  started_at: string;
  completed_at: string | null;
}

export interface BuildManifest {
  intent: string;
  created_at: string;
  features: FeatureBuildState[];
  summary: { total: number; ready: number; blocked: number; skipped: number };
  build_order: string[];
  critical_path: string[];
  estimated_complexity: string;
}

// ═══════════════════════════════════════════════════════════════
// TYPES — BuildProgramInput (compatible with builder-launch.ts)
// ═══════════════════════════════════════════════════════════════

interface ScopeDefinition {
  paths: string[];
  description?: string;
}

interface AcceptanceCriterion {
  id: string;
  description: string;
  type: "functional" | "non_functional" | "boundary" | "security" | "runtime";
  mandatory: boolean;
}

interface TestCase {
  id: string;
  description: string;
  type: "unit" | "integration" | "contract" | "e2e" | "boundary";
  linked_criterion_id?: string;
  mandatory: boolean;
}

interface ConfidenceBreakdown {
  graph_coverage: number;
  pattern_strength: number;
  rule_consistency: number;
  evidence_level: number;
}

interface DbTouch {
  table: string;
  operations: Array<"READ" | "INSERT" | "UPDATE" | "DELETE">;
}

interface BuildProgramFeaturePrepare {
  scope: ScopeDefinition;
  read_scope?: ScopeDefinition;
  write_scope?: ScopeDefinition;
  out_of_scope?: string[];
  constraints?: string[];
  patterns?: string[];
  anti_patterns?: string[];
  data_model?: Record<string, unknown>;
  api_contracts?: { name: string; method: string; path: string }[];
  events?: { name: string; payload_shape?: unknown }[];
  db_touches?: DbTouch[];
  acceptance_criteria?: AcceptanceCriterion[];
  test_cases?: TestCase[];
  confidence_breakdown: ConfidenceBreakdown;
  artifact_refs?: { type: string; ref: string; label?: string }[];
}

export interface BuildProgramFeatureInput {
  feature_id: string;
  intent: string;
  risk_domain_tags?: string[];
  depends_on_feature_ids?: string[];
  prepare: BuildProgramFeaturePrepare;
  diff?: {
    changed_files?: string[];
    interface_touches?: {
      apis?: string[];
      events?: string[];
      db_tables?: string[];
    };
    diff_blob_ref?: string;
  };
  test_run?: {
    test_cases_run: number;
    passed: number;
    failed: number;
    skipped: number;
    status: string;
  };
  run_validators?: boolean;
}

export interface BuildProgramInput {
  app_id?: string;
  requested_by: string;
  builder_cwd?: string;
  builder_timeout_ms?: number;
  stop_on_failure?: boolean;
  features: BuildProgramFeatureInput[];
}

// ═══════════════════════════════════════════════════════════════
// CONVERSION OPTIONS
// ═══════════════════════════════════════════════════════════════

export interface ConvertOptions {
  app_id?: string;
  requested_by?: string;
  builder_cwd?: string;
  builder_timeout_ms?: number;
  stop_on_failure?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const RISK_KEYWORDS: Record<string, string[]> = {
  auth: [
    "auth", "login", "signup", "sign-up", "sign-in", "signin", "session",
    "password", "credential", "oauth", "sso", "mfa", "2fa", "token",
    "jwt", "rbac", "permission", "role", "access control",
  ],
  payments: [
    "payment", "billing", "invoice", "subscription", "charge", "stripe",
    "checkout", "pricing", "plan", "credit card", "refund", "revenue",
  ],
  destructive: [
    "delete", "remove", "destroy", "purge", "wipe", "drop", "truncate",
    "archive", "deactivate", "cancel",
  ],
  pii: [
    "user data", "personal", "pii", "profile", "email", "phone", "address",
    "name", "gdpr", "privacy", "sensitive",
  ],
  security: [
    "security", "encryption", "hash", "secret", "api key", "vulnerability",
    "injection", "xss", "csrf", "sanitize",
  ],
  data_migration: [
    "migration", "schema change", "data migration", "backfill", "seed",
  ],
  external_api: [
    "third-party", "external api", "webhook", "integration", "api key",
  ],
};

/**
 * Slugify a feature name into a feature_id.
 * "Authentication & Authorization" → "feat-authentication-authorization"
 */
function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `feat-${slug}`;
}

/**
 * Derive risk domain tags from feature name and description.
 */
function deriveRiskTags(name: string, description: string): string[] {
  const combined = `${name} ${description}`.toLowerCase();
  const tags: string[] = [];

  for (const [domain, keywords] of Object.entries(RISK_KEYWORDS)) {
    if (keywords.some((kw) => combined.includes(kw))) {
      tags.push(domain);
    }
  }

  return tags;
}

/**
 * Split a single confidence score (0-1) into four AES dimensions.
 *
 * Heuristic:
 *  - graph_coverage: base confidence (donors found = evidence in graph)
 *  - pattern_strength: slightly above base if donors have reuse suggestions
 *  - rule_consistency: base confidence (no contradictions detected at this stage)
 *  - evidence_level: slightly below base (bridge is compiled, not yet executed)
 */
function splitConfidence(
  confidence: number,
  hasDonorSuggestions: boolean,
): ConfidenceBreakdown {
  const clamped = Math.max(0, Math.min(1, confidence));
  const bump = hasDonorSuggestions ? 0.05 : 0;
  return {
    graph_coverage: Math.min(1, clamped + 0.02),
    pattern_strength: Math.min(1, clamped + bump),
    rule_consistency: clamped,
    evidence_level: Math.max(0, clamped - 0.05),
  };
}

/**
 * Resolve dependency feature names to slugified feature_ids.
 * Uses the nameToId map built from all ready features.
 */
function resolveDependencyIds(
  dependencies: string[],
  nameToId: Map<string, string>,
): string[] {
  const ids: string[] = [];
  for (const dep of dependencies) {
    // Try exact match first, then slugified match
    const directId = nameToId.get(dep);
    if (directId) {
      ids.push(directId);
    } else {
      const slugId = nameToId.get(slugify(dep));
      if (slugId) {
        ids.push(slugId);
      }
      // If dependency is not in ready set, it's either blocked/skipped — omit it
    }
  }
  return ids;
}

/**
 * Build a rich intent string for the builder. This is the prompt context
 * that Claude Code will use to implement the feature.
 */
function buildIntentString(feature: FeatureBuildState): string {
  const bridge = feature.bridge!;
  const sections: string[] = [];

  // Header
  sections.push(`## Feature: ${feature.name}`);
  sections.push("");
  sections.push(bridge.description);
  sections.push("");

  // Donor reuse guidance (top 3)
  const topDonors = feature.donors
    .sort((a, b) => b.overall_score - a.overall_score)
    .slice(0, 3);

  if (topDonors.length > 0) {
    sections.push("### Donor Reference Implementations");
    sections.push("");
    for (const donor of topDonors) {
      sections.push(`**${donor.app_name}** (${donor.app_class}, score: ${donor.overall_score.toFixed(2)})`);
      if (donor.matched_features.length > 0) {
        sections.push(`  Matched features: ${donor.matched_features.join(", ")}`);
      }
      if (donor.reuse_suggestions.length > 0) {
        for (const suggestion of donor.reuse_suggestions) {
          sections.push(`  - ${suggestion}`);
        }
      }
      sections.push("");
    }
  }

  // Bridge-level donor reuse
  if (bridge.donor_reuse.length > 0) {
    sections.push("### Specific Reuse Guidance");
    sections.push("");
    for (const reuse of bridge.donor_reuse) {
      sections.push(`Reference **${reuse.app}**'s implementation:`);
      for (const suggestion of reuse.suggestions) {
        sections.push(`  - ${suggestion}`);
      }
    }
    sections.push("");
  }

  // Required data models
  if (bridge.required_models.length > 0) {
    sections.push("### Required Data Models");
    sections.push("");
    for (const model of bridge.required_models) {
      sections.push(`- ${model}`);
    }
    sections.push("");
  }

  // Required integrations
  if (bridge.required_integrations.length > 0) {
    sections.push("### Required Integrations");
    sections.push("");
    for (const integration of bridge.required_integrations) {
      sections.push(`- ${integration}`);
    }
    sections.push("");
  }

  // Acceptance criteria
  if (bridge.tests.length > 0) {
    sections.push("### Acceptance Criteria");
    sections.push("");
    for (let i = 0; i < bridge.tests.length; i++) {
      sections.push(`${i + 1}. ${bridge.tests[i]}`);
    }
    sections.push("");
  }

  // Scope boundaries
  sections.push("### Scope");
  sections.push("");
  if (bridge.scope.paths_allowed.length > 0) {
    sections.push(`Allowed paths: ${bridge.scope.paths_allowed.join(", ")}`);
  }
  if (bridge.scope.paths_forbidden.length > 0) {
    sections.push(`Forbidden paths: ${bridge.scope.paths_forbidden.join(", ")}`);
  }
  sections.push(`Max files: ${bridge.scope.max_files}, Max lines: ${bridge.scope.max_lines}`);

  // Design obligations
  if (bridge.design_constraints) {
    const dc = bridge.design_constraints;
    sections.push("");
    sections.push("### Design Obligations (HARD CONSTRAINTS)");
    sections.push("");
    if (dc.required_screens.length > 0) {
      sections.push(`Required screens: ${dc.required_screens.map(s => s.name).join(", ")}`);
    }
    if (dc.required_components.length > 0) {
      sections.push(`Required components: ${dc.required_components.map(c => c.name).join(", ")}`);
    }
    if (dc.required_data_views.length > 0) {
      for (const dv of dc.required_data_views) {
        sections.push(`Data view "${dv.name}" (${dv.type}): columns [${dv.columns.join(", ")}], capabilities [${dv.capabilities.join(", ")}]`);
      }
    }
    if (dc.required_forms.length > 0) {
      for (const f of dc.required_forms) {
        sections.push(`Form "${f.name}": fields [${f.fields.join(", ")}]`);
      }
    }
    if (dc.required_actions.length > 0) {
      sections.push(`Required actions: ${dc.required_actions.map(a => `${a.label}${a.is_destructive ? " (destructive)" : ""}`).join(", ")}`);
    }
    if (dc.required_states.length > 0) {
      sections.push(`Required states: ${dc.required_states.map(s => `${s.type} on ${s.screen_id}`).join(", ")}`);
    }
  }

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════
// CORE CONVERSION
// ═══════════════════════════════════════════════════════════════

/**
 * Convert a BuildManifest (from auto-build-runner) into a BuildProgramInput
 * compatible with the AES builder-launch infrastructure.
 *
 * Only features with status "ready" and a non-null bridge are included.
 * Features are ordered according to the manifest's build_order.
 */
export function manifestToBuildProgram(
  manifest: BuildManifest,
  options?: ConvertOptions,
): BuildProgramInput {
  const requestedBy = options?.requested_by ?? "aes-auto-build";
  const timeoutMs = options?.builder_timeout_ms ?? 300_000;
  const stopOnFailure = options?.stop_on_failure ?? true;

  // Index ready features by name for dependency resolution
  const readyFeatures = manifest.features.filter(
    (f) => f.status === "ready" && f.bridge !== null,
  );

  const nameToId = new Map<string, string>();
  for (const f of readyFeatures) {
    const id = slugify(f.name);
    nameToId.set(f.name, id);
    nameToId.set(id, id); // self-reference for already-slugified deps
  }

  // Determine feature ordering: respect manifest build_order, filtering to ready features
  const readyNameSet = new Set(readyFeatures.map((f) => f.name));
  const orderedNames: string[] = [];

  // First, add features in build_order that are ready
  for (const name of manifest.build_order) {
    if (readyNameSet.has(name)) {
      orderedNames.push(name);
      readyNameSet.delete(name);
    }
  }

  // Then add any remaining ready features not in build_order
  for (const name of readyNameSet) {
    orderedNames.push(name);
  }

  // Convert each ready feature
  const features: BuildProgramFeatureInput[] = orderedNames.map((name) => {
    const feature = readyFeatures.find((f) => f.name === name)!;
    const bridge = feature.bridge!;
    const featureId = nameToId.get(name)!;

    // Risk tags
    const riskTags = deriveRiskTags(name, bridge.description);

    // Dependencies
    const dependencyIds = resolveDependencyIds(bridge.dependencies, nameToId);

    // Confidence breakdown
    const hasDonorSuggestions = feature.donors.some(
      (d) => d.reuse_suggestions.length > 0,
    );
    const confidenceBreakdown = splitConfidence(
      bridge.confidence,
      hasDonorSuggestions,
    );

    // Acceptance criteria from bridge.tests
    const acceptanceCriteria: AcceptanceCriterion[] = bridge.tests.map(
      (test, i) => ({
        id: `ac-${featureId}-${i + 1}`,
        description: test,
        type: "functional" as const,
        mandatory: true,
      }),
    );

    // Test cases from bridge.tests
    const testCases: TestCase[] = bridge.tests.map((test, i) => ({
      id: `tc-${featureId}-${i + 1}`,
      description: test,
      type: "integration" as const,
      linked_criterion_id: `ac-${featureId}-${i + 1}`,
      mandatory: true,
    }));

    // DB touches from required_models
    const dbTouches: DbTouch[] = bridge.required_models.map((model) => ({
      table: model,
      operations: ["READ", "INSERT", "UPDATE"] as Array<
        "READ" | "INSERT" | "UPDATE" | "DELETE"
      >,
    }));

    // Constraints from required_integrations
    const constraints: string[] = bridge.required_integrations.map(
      (integration) => `Must integrate with ${integration}`,
    );

    // Append design constraints as constraint strings
    if (bridge.design_constraints) {
      const dc = bridge.design_constraints;
      for (const s of dc.required_screens) {
        constraints.push(`[design] Must implement screen "${s.name}": ${s.purpose}`);
      }
      for (const c of dc.required_components) {
        constraints.push(`[design] Must implement component "${c.name}" (${c.category})`);
      }
      for (const dv of dc.required_data_views) {
        constraints.push(`[design] Must implement data view "${dv.name}" (${dv.type}) with columns [${dv.columns.join(", ")}]`);
      }
      for (const f of dc.required_forms) {
        constraints.push(`[design] Must implement form "${f.name}" with fields [${f.fields.join(", ")}]`);
      }
      for (const a of dc.required_actions) {
        constraints.push(`[design] Must implement action "${a.label}"${a.is_destructive ? " (destructive — requires confirmation)" : ""}`);
      }
      for (const st of dc.required_states) {
        constraints.push(`[design] Must handle ${st.type} state on screen ${st.screen_id}`);
      }
    }

    // Patterns from top donor reuse suggestions
    const patterns: string[] = [];
    const topDonor = feature.donors
      .sort((a, b) => b.overall_score - a.overall_score)[0];
    if (topDonor) {
      for (const suggestion of topDonor.reuse_suggestions.slice(0, 5)) {
        patterns.push(suggestion);
      }
    }
    for (const reuse of bridge.donor_reuse) {
      for (const suggestion of reuse.suggestions) {
        if (!patterns.includes(suggestion)) {
          patterns.push(suggestion);
        }
      }
    }

    // Build rich intent
    const intent = buildIntentString(feature);

    // Scope — use paths_allowed as both general scope and write_scope
    const scopePaths =
      bridge.scope.paths_allowed.length > 0
        ? bridge.scope.paths_allowed
        : ["src/"];

    const prepare: BuildProgramFeaturePrepare = {
      scope: {
        paths: scopePaths,
        description: `${bridge.feature_name}: ${bridge.description}`,
      },
      write_scope: {
        paths: scopePaths,
        description: `Write scope for ${bridge.feature_name}`,
      },
      out_of_scope:
        bridge.scope.paths_forbidden.length > 0
          ? bridge.scope.paths_forbidden
          : undefined,
      constraints: constraints.length > 0 ? constraints : undefined,
      patterns: patterns.length > 0 ? patterns : undefined,
      db_touches: dbTouches.length > 0 ? dbTouches : undefined,
      acceptance_criteria:
        acceptanceCriteria.length > 0 ? acceptanceCriteria : undefined,
      test_cases: testCases.length > 0 ? testCases : undefined,
      confidence_breakdown: confidenceBreakdown,
    };

    return {
      feature_id: featureId,
      intent,
      risk_domain_tags: riskTags.length > 0 ? riskTags : undefined,
      depends_on_feature_ids:
        dependencyIds.length > 0 ? dependencyIds : undefined,
      prepare,
      run_validators: true,
    };
  });

  if (features.length === 0) {
    throw new Error(
      `No ready features found in manifest. ` +
        `Total: ${manifest.features.length}, ` +
        `Ready: ${manifest.summary.ready}, ` +
        `Blocked: ${manifest.summary.blocked}, ` +
        `Skipped: ${manifest.summary.skipped}`,
    );
  }

  return {
    app_id: options?.app_id,
    requested_by: requestedBy,
    builder_cwd: options?.builder_cwd,
    builder_timeout_ms: timeoutMs,
    stop_on_failure: stopOnFailure,
    features,
  };
}

// ═══════════════════════════════════════════════════════════════
// EXECUTION — POST to operator HTTP server
// ═══════════════════════════════════════════════════════════════

async function executeBuildProgram(
  program: BuildProgramInput,
  url: string,
): Promise<void> {
  console.error(`[manifest-to-build-program] Executing build program at ${url}`);
  console.error(
    `[manifest-to-build-program] ${program.features.length} features, ` +
      `stop_on_failure=${program.stop_on_failure}, ` +
      `timeout=${program.builder_timeout_ms}ms`,
  );

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(program),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Build program execution failed: ${response.status} ${response.statusText}\n${body}`,
    );
  }

  const result = await response.json();
  console.log(JSON.stringify(result, null, 2));
}

// ═══════════════════════════════════════════════════════════════
// CLI
// ═══════════════════════════════════════════════════════════════

interface CliArgs {
  manifestPath: string | null;
  stdin: boolean;
  execute: boolean;
  executeUrl: string;
  output: string | null;
  timeout: number;
  stopOnFailure: boolean;
  appId: string | null;
  requestedBy: string;
  builderCwd: string | null;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    manifestPath: null,
    stdin: false,
    execute: false,
    executeUrl: "http://localhost:4400/api/build-programs/run",
    output: null,
    timeout: 300_000,
    stopOnFailure: true,
    appId: null,
    requestedBy: "aes-auto-build",
    builderCwd: null,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    switch (arg) {
      case "--stdin":
        args.stdin = true;
        break;
      case "--execute":
        args.execute = true;
        break;
      case "--execute-url":
        i += 1;
        args.executeUrl = argv[i] ?? args.executeUrl;
        args.execute = true;
        break;
      case "--output":
      case "-o":
        i += 1;
        args.output = argv[i] ?? null;
        break;
      case "--timeout":
        i += 1;
        args.timeout = parseInt(argv[i] ?? "300000", 10);
        break;
      case "--stop-on-failure":
        args.stopOnFailure = true;
        break;
      case "--no-stop-on-failure":
        args.stopOnFailure = false;
        break;
      case "--app-id":
        i += 1;
        args.appId = argv[i] ?? null;
        break;
      case "--requested-by":
        i += 1;
        args.requestedBy = argv[i] ?? "aes-auto-build";
        break;
      case "--builder-cwd":
        i += 1;
        args.builderCwd = argv[i] ?? null;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith("-") && args.manifestPath === null) {
          args.manifestPath = arg;
        } else if (arg.startsWith("-")) {
          console.error(`Unknown flag: ${arg}`);
          process.exit(1);
        }
        break;
    }

    i += 1;
  }

  if (!args.stdin && !args.manifestPath) {
    console.error("Error: provide a manifest file path or --stdin");
    printUsage();
    process.exit(1);
  }

  return args;
}

function printUsage(): void {
  console.error(`
Usage:
  npx tsx src/tools/manifest-to-build-program.ts <manifest.json> [options]
  cat manifest.json | npx tsx src/tools/manifest-to-build-program.ts --stdin [options]

Options:
  --stdin                   Read manifest from stdin
  --execute                 POST the build program to the operator HTTP server
  --execute-url <url>       POST to a custom URL (implies --execute)
  --output, -o <path>       Write build program JSON to file instead of stdout
  --timeout <ms>            Builder timeout per feature (default: 300000)
  --stop-on-failure         Stop on first feature failure (default)
  --no-stop-on-failure      Continue past failures
  --app-id <id>             Set app_id in the build program
  --requested-by <name>     Set requested_by (default: aes-auto-build)
  --builder-cwd <path>      Set builder working directory
  --help, -h                Show this help
`);
}

async function readManifest(args: CliArgs): Promise<BuildManifest> {
  let raw: string;

  if (args.stdin) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer);
    }
    raw = Buffer.concat(chunks).toString("utf-8");
  } else {
    const manifestPath = path.resolve(args.manifestPath!);
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Manifest file not found: ${manifestPath}`);
    }
    raw = fs.readFileSync(manifestPath, "utf-8");
  }

  const parsed = JSON.parse(raw) as BuildManifest;

  // Basic shape validation
  if (!parsed.intent || !Array.isArray(parsed.features)) {
    throw new Error(
      "Invalid manifest: must have 'intent' (string) and 'features' (array)",
    );
  }

  return parsed;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const manifest = await readManifest(args);

  console.error(
    `[manifest-to-build-program] Loaded manifest: "${manifest.intent}"`,
  );
  console.error(
    `[manifest-to-build-program] Features: ${manifest.features.length} total, ` +
      `${manifest.summary.ready} ready, ` +
      `${manifest.summary.blocked} blocked, ` +
      `${manifest.summary.skipped} skipped`,
  );

  const program = manifestToBuildProgram(manifest, {
    app_id: args.appId ?? undefined,
    requested_by: args.requestedBy,
    builder_cwd: args.builderCwd ?? undefined,
    builder_timeout_ms: args.timeout,
    stop_on_failure: args.stopOnFailure,
  });

  console.error(
    `[manifest-to-build-program] Converted ${program.features.length} features to build program`,
  );
  for (const f of program.features) {
    const depStr =
      f.depends_on_feature_ids && f.depends_on_feature_ids.length > 0
        ? ` (depends: ${f.depends_on_feature_ids.join(", ")})`
        : "";
    const riskStr =
      f.risk_domain_tags && f.risk_domain_tags.length > 0
        ? ` [${f.risk_domain_tags.join(", ")}]`
        : "";
    console.error(
      `  - ${f.feature_id}${riskStr}${depStr}`,
    );
  }

  if (args.execute) {
    await executeBuildProgram(program, args.executeUrl);
  } else if (args.output) {
    const outputPath = path.resolve(args.output);
    fs.writeFileSync(outputPath, JSON.stringify(program, null, 2), "utf-8");
    console.error(`[manifest-to-build-program] Written to ${outputPath}`);
  } else {
    console.log(JSON.stringify(program, null, 2));
  }
}

// Run if invoked directly
const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("manifest-to-build-program.ts") ||
    process.argv[1].endsWith("manifest-to-build-program.js"));

if (isDirectRun) {
  main().catch((err) => {
    console.error(`[manifest-to-build-program] Fatal: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
