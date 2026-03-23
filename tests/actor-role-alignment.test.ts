import { describe, it, expect } from "vitest";

/**
 * Regression tests for actor-role alignment.
 * Covers Gate 1 (ALL_ACTORS_RESOLVE_TO_DECLARED_ROLES) and Gate 3 (ROLE_BOUNDARY_NOT_DEFINED).
 *
 * These tests validate the rule logic directly, not through the full graph,
 * to keep them fast and isolated.
 */

// --- Extracted rule logic (mirrors spec-validator.ts rule 11) ---

const EXEMPT_ACTORS = new Set(["end_user", "system"]);

function checkActorRoleAlignment(spec: {
  roles: { role_id: string }[];
  features: { actor_ids: string[] }[];
  permissions: { role_id: string }[];
}): { passed: boolean; undeclaredActors: string[] } {
  const declaredRoleIds = new Set(spec.roles.map((r) => r.role_id));
  const allReferencedActors = new Set<string>();

  for (const f of spec.features) {
    for (const actorId of f.actor_ids || []) {
      if (!EXEMPT_ACTORS.has(actorId)) allReferencedActors.add(actorId);
    }
  }
  for (const p of spec.permissions) {
    if (!EXEMPT_ACTORS.has(p.role_id)) allReferencedActors.add(p.role_id);
  }

  const undeclaredActors = [...allReferencedActors].filter(
    (a) => !declaredRoleIds.has(a)
  );

  return { passed: undeclaredActors.length === 0, undeclaredActors };
}

// --- Extracted veto logic (mirrors veto-checker.ts ROLE_BOUNDARY_NOT_DEFINED) ---

function checkRoleBoundaryVeto(
  feature: { actor_ids: string[] },
  roles: { role_id: string }[]
): { triggered: boolean; unmappedActors: string[] } {
  const roleIds = new Set(roles.map((r) => r.role_id));
  const unmappedActors = (feature.actor_ids || []).filter(
    (a: string) => !roleIds.has(a) && a !== "end_user" && a !== "system"
  );
  return { triggered: unmappedActors.length > 0, unmappedActors };
}

// --- Tests ---

describe("Gate 1: ALL_ACTORS_RESOLVE_TO_DECLARED_ROLES", () => {
  it("fails when an actor has no declared role", () => {
    const spec = {
      roles: [
        { role_id: "viewer" },
        { role_id: "admin" },
      ],
      features: [
        { actor_ids: ["end_user", "viewer", "auditor"] }, // auditor not in roles
      ],
      permissions: [
        { role_id: "viewer" },
        { role_id: "admin" },
      ],
    };

    const result = checkActorRoleAlignment(spec);
    expect(result.passed).toBe(false);
    expect(result.undeclaredActors).toContain("auditor");
  });

  it("passes when all actors resolve to declared roles", () => {
    const spec = {
      roles: [
        { role_id: "viewer" },
        { role_id: "operator" },
        { role_id: "auditor" },
        { role_id: "admin" },
      ],
      features: [
        { actor_ids: ["end_user", "viewer", "auditor"] },
        { actor_ids: ["operator", "admin"] },
      ],
      permissions: [
        { role_id: "viewer" },
        { role_id: "auditor" },
        { role_id: "admin" },
      ],
    };

    const result = checkActorRoleAlignment(spec);
    expect(result.passed).toBe(true);
    expect(result.undeclaredActors).toHaveLength(0);
  });

  it("exempts system-level actors (end_user, system)", () => {
    const spec = {
      roles: [{ role_id: "admin" }],
      features: [
        { actor_ids: ["end_user", "system", "admin"] },
      ],
      permissions: [{ role_id: "admin" }],
    };

    const result = checkActorRoleAlignment(spec);
    expect(result.passed).toBe(true);
  });

  it("catches actors referenced only in permissions", () => {
    const spec = {
      roles: [{ role_id: "viewer" }],
      features: [{ actor_ids: ["viewer"] }],
      permissions: [
        { role_id: "viewer" },
        { role_id: "ghost_role" }, // not declared
      ],
    };

    const result = checkActorRoleAlignment(spec);
    expect(result.passed).toBe(false);
    expect(result.undeclaredActors).toContain("ghost_role");
  });

  it("catches multiple undeclared actors", () => {
    const spec = {
      roles: [{ role_id: "admin" }],
      features: [
        { actor_ids: ["auditor", "reviewer", "admin"] },
      ],
      permissions: [{ role_id: "admin" }],
    };

    const result = checkActorRoleAlignment(spec);
    expect(result.passed).toBe(false);
    expect(result.undeclaredActors).toContain("auditor");
    expect(result.undeclaredActors).toContain("reviewer");
    expect(result.undeclaredActors).toHaveLength(2);
  });
});

describe("Gate 3: ROLE_BOUNDARY_NOT_DEFINED (veto)", () => {
  it("triggers when feature actor has no matching role", () => {
    const feature = { actor_ids: ["end_user", "auditor"] };
    const roles = [{ role_id: "viewer" }, { role_id: "admin" }];

    const result = checkRoleBoundaryVeto(feature, roles);
    expect(result.triggered).toBe(true);
    expect(result.unmappedActors).toContain("auditor");
  });

  it("does not trigger when auditor role is declared", () => {
    const feature = { actor_ids: ["end_user", "auditor"] };
    const roles = [
      { role_id: "viewer" },
      { role_id: "auditor" },
      { role_id: "admin" },
    ];

    const result = checkRoleBoundaryVeto(feature, roles);
    expect(result.triggered).toBe(false);
    expect(result.unmappedActors).toHaveLength(0);
  });

  it("ignores exempt actors (end_user, system)", () => {
    const feature = { actor_ids: ["end_user", "system"] };
    const roles: { role_id: string }[] = [];

    const result = checkRoleBoundaryVeto(feature, roles);
    expect(result.triggered).toBe(false);
  });

  it("triggers for each unmapped actor independently", () => {
    const feature = { actor_ids: ["auditor", "reviewer", "admin"] };
    const roles = [{ role_id: "admin" }];

    const result = checkRoleBoundaryVeto(feature, roles);
    expect(result.triggered).toBe(true);
    expect(result.unmappedActors).toEqual(
      expect.arrayContaining(["auditor", "reviewer"])
    );
    expect(result.unmappedActors).not.toContain("admin");
  });
});

describe("Auditor role integration", () => {
  it("internal_ops_tool with auditor role passes both gates", () => {
    const spec = {
      roles: [
        { role_id: "viewer" },
        { role_id: "operator" },
        { role_id: "auditor" },
        { role_id: "admin" },
      ],
      features: [
        { actor_ids: ["end_user", "admin"] },
        { actor_ids: ["end_user", "auditor"] }, // audit log viewer
        { actor_ids: ["admin"] },
      ],
      permissions: [
        { role_id: "viewer" },
        { role_id: "operator" },
        { role_id: "auditor" },
        { role_id: "admin" },
      ],
    };

    // Gate 1 passes
    const g1 = checkActorRoleAlignment(spec);
    expect(g1.passed).toBe(true);

    // Gate 3 passes for the audit feature
    const auditFeature = spec.features[1];
    const g3 = checkRoleBoundaryVeto(auditFeature, spec.roles);
    expect(g3.triggered).toBe(false);
  });
});
