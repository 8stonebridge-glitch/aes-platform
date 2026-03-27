import { z } from "zod";

export const VetoSeverity = z.enum(["critical", "blocking", "high"]);
export type VetoSeverity = z.infer<typeof VetoSeverity>;

export const VetoEntry = z.object({
  code: z.string(),
  description: z.string(),
  trigger: z.string(),
  severity: VetoSeverity,
  gate: z.string(),
  remediation: z.string(),
});
export type VetoEntry = z.infer<typeof VetoEntry>;

export const VETO_REGISTRY = [
  {
    code: "AUTH_NOT_DEFINED",
    description: "Auth model not defined for a feature that requires access control",
    trigger: "Feature has actor_ids but no matching permissions or role assignments",
    severity: "critical",
    gate: "gate_3",
    remediation: "Define an auth model with explicit role-to-permission mappings for every actor referenced in the feature",
  },
  {
    code: "ROLE_BOUNDARY_NOT_DEFINED",
    description: "Roles exist but capabilities are unclear or overlapping",
    trigger: "Permissions reference roles that have no defined scope or overlap without precedence",
    severity: "critical",
    gate: "gate_3",
    remediation: "Define explicit capability boundaries per role with a precedence order for overlapping scopes",
  },
  {
    code: "DATA_OWNERSHIP_MISSING",
    description: "No clear owner for a data entity that is created, mutated, or deleted",
    trigger: "A data entity appears in write operations but has no ownership declaration or access policy",
    severity: "critical",
    gate: "gate_3",
    remediation: "Declare an ownership model for the entity specifying who can create, read, update, and delete",
  },
  {
    code: "DESTRUCTIVE_ACTION_UNDEFINED",
    description: "A destructive action (delete, revoke, archive) has no confirmation or undo model",
    trigger: "Feature includes delete, revoke, or archive operations with no safeguard, confirmation step, or recovery path defined",
    severity: "critical",
    gate: "gate_3",
    remediation: "Add a confirmation gate and define whether the action is soft-delete with recovery or hard-delete with audit trail",
  },
  {
    code: "DEPENDENCY_CONFLICT_UNRESOLVED",
    description: "Two features declare conflicting requirements on a shared resource",
    trigger: "Two or more features depend on the same resource with incompatible constraints (e.g., exclusive lock vs shared read)",
    severity: "critical",
    gate: "gate_3",
    remediation: "Resolve the conflict by defining precedence, introducing a coordination mechanism, or splitting the resource",
  },
  {
    code: "ACCEPTANCE_TESTS_MISSING_CRITICAL",
    description: "A critical-path feature has no acceptance tests defined",
    trigger: "Feature is marked as critical-path or is a hard dependency for other features, but has zero acceptance test definitions",
    severity: "critical",
    gate: "gate_3",
    remediation: "Define at least one acceptance test per critical user journey in the feature",
  },
  {
    code: "EXTERNAL_DEPENDENCY_NO_FALLBACK",
    description: "Feature depends on an external service with no fallback or degradation strategy",
    trigger: "Feature references an external API or service and has no timeout, retry, circuit-breaker, or graceful degradation defined",
    severity: "blocking",
    gate: "gate_3",
    remediation: "Define a fallback strategy: timeout with user feedback, retry with backoff, circuit-breaker, or offline-capable degradation",
  },
  {
    code: "PII_HANDLING_UNDEFINED",
    description: "Feature processes personally identifiable information without a handling policy",
    trigger: "Data model includes fields classified as PII (email, phone, address, SSN, etc.) with no encryption, masking, or retention policy",
    severity: "critical",
    gate: "gate_3",
    remediation: "Define PII handling: encryption at rest, masking in logs, retention period, and deletion policy",
  },
  {
    code: "MULTI_TENANT_ISOLATION_MISSING",
    description: "Multi-tenant feature has no tenant isolation boundary defined",
    trigger: "Feature operates in a multi-tenant context but queries, mutations, or storage have no tenant scoping or isolation enforcement",
    severity: "critical",
    gate: "gate_3",
    remediation: "Add tenant isolation at the query layer, enforce tenant-scoped access in all read/write paths, and add cross-tenant access tests",
  },
  {
    code: "FINANCIAL_TX_NO_IDEMPOTENCY",
    description: "Financial transaction has no idempotency or double-spend protection",
    trigger: "Feature involves money movement, balance changes, or payment processing without idempotency keys or duplicate detection",
    severity: "critical",
    gate: "gate_3",
    remediation: "Implement idempotency keys on all financial mutation endpoints and add double-spend detection at the persistence layer",
  },
  {
    code: "STATE_MACHINE_INCOMPLETE",
    description: "Workflow or lifecycle state machine has unreachable or missing terminal states",
    trigger: "A state machine definition has states with no outgoing transitions (dead ends) or terminal states that are never reachable from the initial state",
    severity: "blocking",
    gate: "gate_3",
    remediation: "Complete the state machine: ensure all states are reachable, all non-terminal states have outgoing transitions, and at least one terminal state is reachable from every state",
  },
] as const satisfies readonly VetoEntry[];

export type VetoCode = (typeof VETO_REGISTRY)[number]["code"];

export function findVeto(code: string): VetoEntry | undefined {
  return VETO_REGISTRY.find((v) => v.code === code);
}

export function vetosForGate(gate: string): readonly VetoEntry[] {
  return VETO_REGISTRY.filter((v) => v.gate === gate);
}

export function criticalVetos(): readonly VetoEntry[] {
  return VETO_REGISTRY.filter((v) => v.severity === "critical");
}
