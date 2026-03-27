import type { FailurePattern } from "../types/failure-pattern.js";
import type { FixPattern } from "../types/fix-pattern.js";
import type { PreventionRule } from "../types/prevention-rule.js";

/**
 * REAL FAILURE PATTERNS — Sourced from actual AES system history.
 * These are higher priority than generic patterns because they are
 * grounded in real incidents with real fixes that were validated.
 *
 * Source: AES research logs, OpSuite audit, D14-D19 amendments.
 */

// ─── Real Failure Patterns ────────────────────────────────────────────

export const REAL_FAILURE_PATTERNS: FailurePattern[] = [
  {
    pattern_id: "rfp-001",
    name: "Critical finding dismissed without evidence",
    description:
      "High-severity security finding (Clerk redirect loop) was dismissed during orchestration. " +
      "Claude cited a code comment as evidence instead of reading actual middleware behavior. " +
      "No deliberation was triggered, no cross-verification occurred.",
    failure_type: "permission_failure",
    root_cause_category: "validator_miss",
    affected_stages: ["validation"],
    severity_range: { min: "critical", max: "critical" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "audit",
      "finding-dismissal",
      "evidence-standard",
      "security",
      "clerk",
      "redirect-loop",
      "cross-verification",
    ],
  },
  {
    pattern_id: "rfp-002",
    name: "Dual auth provider not detected",
    description:
      "Project had two conflicting authentication systems (Clerk + another provider). " +
      "Missed independently in 3 separate audits. No detection rule existed for conflicting auth configurations.",
    failure_type: "permission_failure",
    root_cause_category: "rule_missing",
    affected_stages: ["decomposition", "validation"],
    severity_range: { min: "high", max: "critical" },
    frequency: 3,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "auth",
      "dual-provider",
      "package-json",
      "stack-detection",
      "recurring-miss",
    ],
  },
  {
    pattern_id: "rfp-003",
    name: "Multi-file flow bug missed by file-level review",
    description:
      "Clerk redirect loop was a chain across multiple files: sign-up page → env var (redirect URL = /) → " +
      "root page (redirect to /sign-in) → middleware → infinite loop. File-level review found pieces " +
      "but could not trace the chain. No cross-file flow verification existed.",
    failure_type: "workflow_gap",
    root_cause_category: "validator_miss",
    affected_stages: ["validation", "build_execution"],
    severity_range: { min: "high", max: "critical" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "flow-analysis",
      "cross-file",
      "redirect-loop",
      "auth-flow",
      "file-isolation",
    ],
  },
  {
    pattern_id: "rfp-004",
    name: "Pipeline step skipped silently",
    description:
      "Perplexity validation step was skipped during audit with no indication in the final report. " +
      "Report looked complete. User had no way to know validation was incomplete. " +
      "Tool existed as library but was not configured as MCP server.",
    failure_type: "deployment_failure",
    root_cause_category: "environment_issue",
    affected_stages: ["validation"],
    severity_range: { min: "medium", max: "high" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "silent-skip",
      "tool-availability",
      "mcp-config",
      "visibility",
      "audit-completeness",
    ],
  },
  {
    pattern_id: "rfp-005",
    name: "Graph domain nodes duplicated and inconsistent",
    description:
      "16 FeatureDomain nodes existed but 3 were duplicates. Common names (security, auth, notification) " +
      "didn't match any domain nodes. 9 required domains were entirely absent. " +
      "Domain selection was left to orchestrator intuition rather than mechanical graph queries.",
    failure_type: "missing_dependency",
    root_cause_category: "spec_gap",
    affected_stages: ["decomposition", "bridge_compile"],
    severity_range: { min: "medium", max: "high" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "graph-schema",
      "domain-normalization",
      "duplicates",
      "alias",
      "coverage-gap",
    ],
  },
  {
    pattern_id: "rfp-006",
    name: "Build proceeded without knowledge consultation proof",
    description:
      "Build pipeline could call the code agent without proof that relevant domains were consulted. " +
      "No mechanism existed to verify coverage of required knowledge before building. " +
      "Wrong FeatureSpecs could be used without detection.",
    failure_type: "workflow_gap",
    root_cause_category: "bridge_gap",
    affected_stages: ["bridge_compile", "build_execution"],
    severity_range: { min: "critical", max: "critical" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "consultation-gate",
      "knowledge-verification",
      "coverage-proof",
      "missing-gate",
    ],
  },
  {
    pattern_id: "rfp-007",
    name: "No failure memory across builds",
    description:
      "Each build started with no history of what went wrong in previous builds for the same feature type. " +
      "Same build failures repeated indefinitely. No paper trail connecting failures to causes. " +
      "Pattern detection had no failure data to consume.",
    failure_type: "workflow_gap",
    root_cause_category: "rule_missing",
    affected_stages: ["build_execution", "validation"],
    severity_range: { min: "critical", max: "critical" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "failure-memory",
      "no-history",
      "repeated-failures",
      "learning-loop",
    ],
  },
  {
    pattern_id: "rfp-008",
    name: "Protocol violations not recorded",
    description:
      "Build could proceed without consultation (violating gate). Audit could bypass per-finding " +
      "deliberation. No evidence left behind if gates were skipped. Same violations repeated undetected.",
    failure_type: "workflow_gap",
    root_cause_category: "rule_missing",
    affected_stages: ["build_execution", "validation"],
    severity_range: { min: "high", max: "critical" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "protocol-violation",
      "gate-bypass",
      "no-evidence",
      "enforcement",
      "undetected-skip",
    ],
  },
  {
    pattern_id: "rfp-009",
    name: "Tool registered as library but not callable by pipeline",
    description:
      "Perplexity existed as src/lib/perplexity.ts but pipeline invokes tools as MCP servers. " +
      "PERPLEXITY_API_KEY existed in .env.local but tool was not registered. " +
      "Result: silent step skip or blockage without clear guidance.",
    failure_type: "api_integration_failure",
    root_cause_category: "environment_issue",
    affected_stages: ["validation"],
    severity_range: { min: "medium", max: "medium" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "mcp-server",
      "tool-registration",
      "perplexity",
      "library-vs-tool",
    ],
  },
  {
    pattern_id: "rfp-010",
    name: "Missing error/empty/loading state definitions in specs",
    description:
      "Built screens missing empty/loading/error/success/partial/blocked/pending states. " +
      "User experience broken when system reached error conditions. " +
      "FeatureSpecs didn't enforce state machine definitions. Quality checks didn't verify state coverage.",
    failure_type: "ui_state_failure",
    root_cause_category: "spec_gap",
    affected_stages: ["build_execution", "validation"],
    severity_range: { min: "medium", max: "high" },
    frequency: 1,
    first_observed: "2025-01-01T00:00:00Z",
    tags: [
      "ui-states",
      "empty-state",
      "loading-state",
      "error-state",
      "spec-requirement",
    ],
  },
];

// ─── Real Fix Patterns ────────────────────────────────────────────────

export const REAL_FIX_PATTERNS: FixPattern[] = [
  {
    pattern_id: "rfix-001",
    name: "Add per-finding deliberation gate",
    description:
      "Each HIGH/REJECT finding requires individual processing before report generation. " +
      "Finding dismissals must cite external evidence, prior validated deliberation, OR verified code behavior.",
    target_failure_patterns: ["rfp-001"],
    resolution_action: "add_rule",
    resolution_template:
      "Add deliberation gate: every HIGH finding must be individually processed with cited evidence before dismissal is allowed.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-002",
    name: "Add dual auth provider detection rule",
    description:
      "Check package.json for 2+ auth system dependencies. Flag as HIGH severity if found.",
    target_failure_patterns: ["rfp-002"],
    resolution_action: "add_rule",
    resolution_template:
      "Add Gate 1 rule: scan dependencies for competing auth packages (clerk + auth.js, clerk + next-auth, etc). Block if found.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-003",
    name: "Add critical flow tracing step",
    description:
      "Trace critical user flows end-to-end across files. Stack-aware default flows for auth " +
      "(sign-up, sign-in, protected routes, wrong-role access). Identify loops, dead ends.",
    target_failure_patterns: ["rfp-003"],
    resolution_action: "add_rule",
    resolution_template:
      "Add cross-file flow validation: trace auth flow sign-up → redirect → middleware → landing. Check for loops and dead ends.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-004",
    name: "Add tool pre-flight check and step execution header",
    description:
      "Pipeline halts if required tool unavailable. Every report begins with table showing step name, " +
      "status (RAN/SKIPPED/SUBSTITUTE), tool used. Score capped if any step skipped.",
    target_failure_patterns: ["rfp-004", "rfp-009"],
    resolution_action: "add_rule",
    resolution_template:
      "Add pre-flight: check all required tools/services are available before pipeline starts. Add execution header to all outputs.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-005",
    name: "Normalize graph domains with alias edges",
    description:
      "Deduplicate domain nodes via ALIAS_OF edges. Add uniqueness constraint on FeatureDomain.name. " +
      "Replace intuitive domain selection with mechanical REQUIRES_DOMAIN graph queries.",
    target_failure_patterns: ["rfp-005"],
    resolution_action: "update_spec",
    resolution_template:
      "Run alias normalization on graph nodes. Add UNIQUE constraint. Replace manual domain selection with graph-driven retrieval.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-006",
    name: "Add consultation artifact as hard gate",
    description:
      "Create FeatureConsultation artifact before code agent call. Contains domains consulted, " +
      "FeatureSpecs loaded, coverage status. Build halts with CRITICAL violation if missing.",
    target_failure_patterns: ["rfp-006"],
    resolution_action: "add_rule",
    resolution_template:
      "Add hard gate: builder dispatch requires consultation artifact proving all REQUIRES_DOMAIN edges were satisfied.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-007",
    name: "Persist failure cases to graph with queryable history",
    description:
      "Create FailureCase nodes when builds fail. Query before each build. Never delete. " +
      "Track resolution. Cross-project generalization when 2+ projects share same cause.",
    target_failure_patterns: ["rfp-007"],
    resolution_action: "add_rule",
    resolution_template:
      "Persist all failures as structured nodes. Query similar failures before each build. Use fix patterns from past successes.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-008",
    name: "Record protocol violations as graph nodes",
    description:
      "Create ProtocolViolation node when gate skipped. Severity tiers: CRITICAL halts immediately, " +
      "WARNING continues but visible, two same-type WARNINGs trigger pattern detection.",
    target_failure_patterns: ["rfp-008"],
    resolution_action: "add_rule",
    resolution_template:
      "Write ProtocolViolation to graph before halt. Include stage, reason, severity. Feed violations into improvement loop.",
    success_rate: 1.0,
    times_applied: 1,
  },
  {
    pattern_id: "rfix-009",
    name: "Enforce UI state definitions in specs",
    description:
      "Require empty, loading, error, success, blocked states in all frontend feature specs. " +
      "Reject builds missing state definitions. Add to validator rubric.",
    target_failure_patterns: ["rfp-010"],
    resolution_action: "add_rule",
    resolution_template:
      "Add Gate 1 rule: all features with frontend surfaces must define empty/loading/error/success states. Validator checks coverage.",
    success_rate: 1.0,
    times_applied: 1,
  },
];

// ─── Real Prevention Rules ────────────────────────────────────────────

export const REAL_PREVENTION_RULES: PreventionRule[] = [
  {
    rule_id: "rprev-001",
    name: "Per-finding deliberation required for HIGH findings",
    description:
      "Any HIGH/REJECT finding must be individually deliberated with cited evidence before dismissal.",
    target_failure_patterns: ["rfp-001"],
    gate: "gate_5",
    check_logic:
      "If validator produces HIGH finding, verify deliberation artifact exists with cited evidence before allowing dismissal.",
    added_after_incident: "rfp-001",
  },
  {
    rule_id: "rprev-002",
    name: "Detect competing auth dependencies",
    description:
      "Scan project dependencies for 2+ authentication packages. Block build if found.",
    target_failure_patterns: ["rfp-002"],
    gate: "gate_1",
    check_logic:
      "Parse AppSpec integrations for multiple identity-type providers. If count > 1 and not explicitly justified, trigger veto.",
    added_after_incident: "rfp-002",
  },
  {
    rule_id: "rprev-003",
    name: "Cross-file flow verification for auth chains",
    description:
      "Trace sign-up → redirect → middleware → landing flow across files. Check for loops and dead ends.",
    target_failure_patterns: ["rfp-003"],
    gate: "gate_2",
    check_logic:
      "Bridge compile must include auth flow trace requirement if feature touches auth routes.",
    added_after_incident: "rfp-003",
  },
  {
    rule_id: "rprev-004",
    name: "Tool availability pre-flight check",
    description:
      "All required tools must be verified available before pipeline starts. Missing tool = halt, not skip.",
    target_failure_patterns: ["rfp-004", "rfp-009"],
    gate: "gate_0",
    check_logic:
      "Before Gate 0 proceeds, verify all configured MCP tools respond. If any required tool is down, halt with clear error.",
    added_after_incident: "rfp-004",
  },
  {
    rule_id: "rprev-005",
    name: "Consultation proof required before builder dispatch",
    description:
      "Builder cannot be dispatched without a consultation artifact proving domain coverage.",
    target_failure_patterns: ["rfp-006"],
    gate: "gate_2",
    check_logic:
      "Bridge must include consultation_artifact_id. If null, block dispatch.",
    added_after_incident: "rfp-006",
  },
  {
    rule_id: "rprev-006",
    name: "Query failure history before each build",
    description:
      "Before dispatching builder, query FixTrail for similar failures on same feature type.",
    target_failure_patterns: ["rfp-007"],
    gate: "gate_2",
    check_logic:
      "Bridge compiler must query similar_past_failures. If matches found, attach fix patterns to bridge.",
    added_after_incident: "rfp-007",
  },
  {
    rule_id: "rprev-007",
    name: "Frontend features must define UI states",
    description:
      "All features with frontend surfaces must define empty, loading, error, success, and blocked states.",
    target_failure_patterns: ["rfp-010"],
    gate: "gate_1",
    check_logic:
      "AppSpec validation: if feature has actor_ids and is not backend-only, verify state definitions exist.",
    added_after_incident: "rfp-010",
  },
];
