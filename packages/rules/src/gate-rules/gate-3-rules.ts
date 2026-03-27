/**
 * Gate 3: Hard Veto Evaluation
 *
 * Evaluates a feature or spec against all registered vetoes.
 * A single critical veto blocks promotion entirely.
 */

import { z } from "zod";
import { VETO_REGISTRY, type VetoEntry } from "../policies/veto-registry.js";

export const VetoContext = z.object({
  feature_id: z.string(),
  actors: z.array(z.string()).default([]),
  permissions: z.record(z.string(), z.array(z.string())).default({}),
  data_entities: z.array(z.string()).default([]),
  data_ownership: z.record(z.string(), z.string()).default({}),
  has_destructive_actions: z.boolean().default(false),
  destructive_actions_have_safeguards: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
  conflicting_dependencies: z.array(z.string()).default([]),
  acceptance_tests: z.array(z.string()).default([]),
  is_critical_path: z.boolean().default(false),
  external_dependencies: z.array(z.string()).default([]),
  external_fallbacks_defined: z.boolean().default(false),
  pii_fields: z.array(z.string()).default([]),
  pii_handling_defined: z.boolean().default(false),
  multi_tenant: z.boolean().default(false),
  tenant_isolation_defined: z.boolean().default(false),
  financial_transactions: z.boolean().default(false),
  idempotency_defined: z.boolean().default(false),
  state_machines: z.array(
    z.object({
      name: z.string(),
      states: z.array(z.string()),
      transitions: z.array(z.object({ from: z.string(), to: z.string() })),
      terminal_states: z.array(z.string()),
      initial_state: z.string(),
    })
  ).default([]),
});
export type VetoContext = z.infer<typeof VetoContext>;

export const VetoCheckResult = z.object({
  code: z.string(),
  triggered: z.boolean(),
  severity: z.string(),
  message: z.string(),
  remediation: z.string(),
});
export type VetoCheckResult = z.infer<typeof VetoCheckResult>;

export const Gate3Result = z.object({
  pass: z.boolean(),
  vetoes_triggered: z.array(VetoCheckResult),
  vetoes_clear: z.array(z.string()),
  critical_count: z.number(),
  blocking_count: z.number(),
});
export type Gate3Result = z.infer<typeof Gate3Result>;

type VetoChecker = (ctx: VetoContext) => { triggered: boolean; message: string };

const VETO_CHECKERS: Record<string, VetoChecker> = {
  AUTH_NOT_DEFINED: (ctx) => {
    if (ctx.actors.length > 0 && Object.keys(ctx.permissions).length === 0) {
      return { triggered: true, message: `Feature ${ctx.feature_id} has actors but no permissions defined` };
    }
    const actorsWithPerms = new Set(Object.keys(ctx.permissions));
    const unmatched = ctx.actors.filter((a) => !actorsWithPerms.has(a));
    if (unmatched.length > 0) {
      return { triggered: true, message: `Actors without permissions: ${unmatched.join(", ")}` };
    }
    return { triggered: false, message: "Auth model is defined" };
  },

  ROLE_BOUNDARY_NOT_DEFINED: (ctx) => {
    const roles = Object.keys(ctx.permissions);
    if (roles.length < 2) return { triggered: false, message: "Single role or no roles, no overlap possible" };
    const permSets = Object.values(ctx.permissions);
    for (let i = 0; i < permSets.length; i++) {
      for (let j = i + 1; j < permSets.length; j++) {
        const overlap = permSets[i].filter((p) => permSets[j].includes(p));
        if (overlap.length > 0) {
          return { triggered: true, message: `Overlapping permissions without precedence: ${overlap.join(", ")}` };
        }
      }
    }
    return { triggered: false, message: "Role boundaries are clear" };
  },

  DATA_OWNERSHIP_MISSING: (ctx) => {
    const unowned = ctx.data_entities.filter((e) => !ctx.data_ownership[e]);
    if (unowned.length > 0) {
      return { triggered: true, message: `Data entities without ownership: ${unowned.join(", ")}` };
    }
    return { triggered: false, message: "All data entities have ownership" };
  },

  DESTRUCTIVE_ACTION_UNDEFINED: (ctx) => {
    if (ctx.has_destructive_actions && !ctx.destructive_actions_have_safeguards) {
      return { triggered: true, message: "Destructive actions present without safeguards" };
    }
    return { triggered: false, message: "Destructive actions are safeguarded or absent" };
  },

  DEPENDENCY_CONFLICT_UNRESOLVED: (ctx) => {
    if (ctx.conflicting_dependencies.length > 0) {
      return { triggered: true, message: `Conflicting dependencies: ${ctx.conflicting_dependencies.join(", ")}` };
    }
    return { triggered: false, message: "No dependency conflicts" };
  },

  ACCEPTANCE_TESTS_MISSING_CRITICAL: (ctx) => {
    if (ctx.is_critical_path && ctx.acceptance_tests.length === 0) {
      return { triggered: true, message: "Critical-path feature has no acceptance tests" };
    }
    return { triggered: false, message: "Acceptance tests present or feature is not critical-path" };
  },

  EXTERNAL_DEPENDENCY_NO_FALLBACK: (ctx) => {
    if (ctx.external_dependencies.length > 0 && !ctx.external_fallbacks_defined) {
      return { triggered: true, message: `External dependencies without fallback: ${ctx.external_dependencies.join(", ")}` };
    }
    return { triggered: false, message: "External dependencies have fallbacks or none present" };
  },

  PII_HANDLING_UNDEFINED: (ctx) => {
    if (ctx.pii_fields.length > 0 && !ctx.pii_handling_defined) {
      return { triggered: true, message: `PII fields without handling policy: ${ctx.pii_fields.join(", ")}` };
    }
    return { triggered: false, message: "PII handling defined or no PII present" };
  },

  MULTI_TENANT_ISOLATION_MISSING: (ctx) => {
    if (ctx.multi_tenant && !ctx.tenant_isolation_defined) {
      return { triggered: true, message: "Multi-tenant feature without tenant isolation" };
    }
    return { triggered: false, message: "Tenant isolation defined or not multi-tenant" };
  },

  FINANCIAL_TX_NO_IDEMPOTENCY: (ctx) => {
    if (ctx.financial_transactions && !ctx.idempotency_defined) {
      return { triggered: true, message: "Financial transactions without idempotency protection" };
    }
    return { triggered: false, message: "Idempotency defined or no financial transactions" };
  },

  STATE_MACHINE_INCOMPLETE: (ctx) => {
    for (const sm of ctx.state_machines) {
      const stateSet = new Set(sm.states);
      // Check all terminal states are in the state set
      for (const ts of sm.terminal_states) {
        if (!stateSet.has(ts)) {
          return { triggered: true, message: `State machine ${sm.name}: terminal state ${ts} not in state set` };
        }
      }
      // Check reachability from initial state
      const reachable = new Set<string>();
      const queue = [sm.initial_state];
      while (queue.length > 0) {
        const current = queue.pop()!;
        if (reachable.has(current)) continue;
        reachable.add(current);
        for (const t of sm.transitions) {
          if (t.from === current && !reachable.has(t.to)) queue.push(t.to);
        }
      }
      const unreachable = sm.states.filter((s) => !reachable.has(s));
      if (unreachable.length > 0) {
        return { triggered: true, message: `State machine ${sm.name}: unreachable states: ${unreachable.join(", ")}` };
      }
      // Check that at least one terminal state is reachable
      const reachableTerminals = sm.terminal_states.filter((ts) => reachable.has(ts));
      if (reachableTerminals.length === 0) {
        return { triggered: true, message: `State machine ${sm.name}: no terminal state is reachable` };
      }
      // Check non-terminal states have outgoing transitions
      const terminalSet = new Set(sm.terminal_states);
      const nonTerminal = sm.states.filter((s) => !terminalSet.has(s));
      for (const s of nonTerminal) {
        const hasOut = sm.transitions.some((t) => t.from === s);
        if (!hasOut) {
          return { triggered: true, message: `State machine ${sm.name}: dead-end non-terminal state: ${s}` };
        }
      }
    }
    return { triggered: false, message: "All state machines are complete" };
  },
};

export function evaluateGate3(ctx: VetoContext): Gate3Result {
  const parsed = VetoContext.parse(ctx);
  const triggered: VetoCheckResult[] = [];
  const clear: string[] = [];

  for (const veto of VETO_REGISTRY) {
    const checker = VETO_CHECKERS[veto.code];
    if (!checker) {
      clear.push(veto.code);
      continue;
    }
    const result = checker(parsed);
    if (result.triggered) {
      triggered.push({
        code: veto.code,
        triggered: true,
        severity: veto.severity,
        message: result.message,
        remediation: veto.remediation,
      });
    } else {
      clear.push(veto.code);
    }
  }

  const criticalCount = triggered.filter((v) => v.severity === "critical").length;
  const blockingCount = triggered.filter((v) => v.severity === "blocking").length;

  return {
    pass: criticalCount === 0 && blockingCount === 0,
    vetoes_triggered: triggered,
    vetoes_clear: clear,
    critical_count: criticalCount,
    blocking_count: blockingCount,
  };
}
