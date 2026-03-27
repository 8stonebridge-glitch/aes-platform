/**
 * Gate 1: AppSpec Validation Rules
 *
 * These 10 rules validate a generated AppSpec for completeness, consistency,
 * and buildability before it can proceed to bridge compilation.
 */

import { z } from "zod";
import { CONFIDENCE_THRESHOLDS } from "../policies/confidence-thresholds.js";

export const FeatureSpec = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  actors: z.array(z.string()).min(1),
  dependencies: z.array(z.string()).default([]),
  acceptance_tests: z.array(z.string()).default([]),
  risk_class: z.enum(["low", "medium", "high", "regulated"]).default("medium"),
  data_entities: z.array(z.string()).default([]),
  workflows: z.array(z.string()).default([]),
  permissions: z.record(z.string(), z.array(z.string())).default({}),
});
export type FeatureSpec = z.infer<typeof FeatureSpec>;

export const AppSpec = z.object({
  app_name: z.string().min(1),
  app_class: z.string(),
  description: z.string(),
  actors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
    })
  ),
  features: z.array(FeatureSpec).min(1),
  global_constraints: z.array(z.string()).default([]),
});
export type AppSpec = z.infer<typeof AppSpec>;

export const Gate1Result = z.object({
  pass: z.boolean(),
  confidence: z.number().min(0).max(1),
  rule_results: z.array(
    z.object({
      rule_id: z.string(),
      rule_name: z.string(),
      pass: z.boolean(),
      message: z.string(),
      severity: z.enum(["error", "warning", "info"]),
    })
  ),
});
export type Gate1Result = z.infer<typeof Gate1Result>;

const GATE_1_RULES = [
  {
    id: "G1-R1",
    name: "app_name_and_class_present",
    description: "AppSpec must have a non-empty app name and a recognized app class",
    check: (spec: AppSpec) => {
      if (!spec.app_name.trim()) return { pass: false, message: "App name is empty" };
      if (!spec.app_class.trim()) return { pass: false, message: "App class is empty" };
      return { pass: true, message: "App identity is defined" };
    },
  },
  {
    id: "G1-R2",
    name: "at_least_one_actor",
    description: "AppSpec must define at least one actor with a clear role",
    check: (spec: AppSpec) => {
      if (spec.actors.length === 0) return { pass: false, message: "No actors defined" };
      const missingRoles = spec.actors.filter((a) => !a.role.trim());
      if (missingRoles.length > 0) {
        return { pass: false, message: `Actors without roles: ${missingRoles.map((a) => a.id).join(", ")}` };
      }
      return { pass: true, message: `${spec.actors.length} actor(s) with roles defined` };
    },
  },
  {
    id: "G1-R3",
    name: "features_non_empty",
    description: "AppSpec must have at least one feature",
    check: (spec: AppSpec) => {
      if (spec.features.length === 0) return { pass: false, message: "No features defined" };
      return { pass: true, message: `${spec.features.length} feature(s) defined` };
    },
  },
  {
    id: "G1-R4",
    name: "feature_actors_reference_valid",
    description: "Every actor referenced in a feature must exist in the app-level actor list",
    check: (spec: AppSpec) => {
      const actorIds = new Set(spec.actors.map((a) => a.id));
      const orphans: string[] = [];
      for (const feat of spec.features) {
        for (const actor of feat.actors) {
          if (!actorIds.has(actor)) orphans.push(`${feat.id}:${actor}`);
        }
      }
      if (orphans.length > 0) {
        return { pass: false, message: `Orphan actor references: ${orphans.join(", ")}` };
      }
      return { pass: true, message: "All feature actor references are valid" };
    },
  },
  {
    id: "G1-R5",
    name: "dependency_graph_acyclic",
    description: "Feature dependency graph must be a DAG (no circular dependencies)",
    check: (spec: AppSpec) => {
      const featureIds = new Set(spec.features.map((f) => f.id));
      const visited = new Set<string>();
      const inStack = new Set<string>();

      function hasCycle(id: string): boolean {
        if (inStack.has(id)) return true;
        if (visited.has(id)) return false;
        visited.add(id);
        inStack.add(id);
        const feat = spec.features.find((f) => f.id === id);
        if (feat) {
          for (const dep of feat.dependencies) {
            if (featureIds.has(dep) && hasCycle(dep)) return true;
          }
        }
        inStack.delete(id);
        return false;
      }

      for (const feat of spec.features) {
        if (hasCycle(feat.id)) {
          return { pass: false, message: `Circular dependency detected involving feature ${feat.id}` };
        }
      }
      return { pass: true, message: "Dependency graph is acyclic" };
    },
  },
  {
    id: "G1-R6",
    name: "dependency_references_valid",
    description: "All feature dependencies must reference features that exist in the spec",
    check: (spec: AppSpec) => {
      const featureIds = new Set(spec.features.map((f) => f.id));
      const invalid: string[] = [];
      for (const feat of spec.features) {
        for (const dep of feat.dependencies) {
          if (!featureIds.has(dep)) invalid.push(`${feat.id} -> ${dep}`);
        }
      }
      if (invalid.length > 0) {
        return { pass: false, message: `Invalid dependency references: ${invalid.join(", ")}` };
      }
      return { pass: true, message: "All dependency references are valid" };
    },
  },
  {
    id: "G1-R7",
    name: "acceptance_tests_on_critical_features",
    description: "Features with risk_class 'high' or 'regulated' must have at least one acceptance test",
    check: (spec: AppSpec) => {
      const missing: string[] = [];
      for (const feat of spec.features) {
        if ((feat.risk_class === "high" || feat.risk_class === "regulated") && feat.acceptance_tests.length === 0) {
          missing.push(feat.id);
        }
      }
      if (missing.length > 0) {
        return { pass: false, message: `High/regulated features without acceptance tests: ${missing.join(", ")}` };
      }
      return { pass: true, message: "All critical features have acceptance tests" };
    },
  },
  {
    id: "G1-R8",
    name: "permissions_reference_valid_actors",
    description: "Permission entries must reference actors defined at the app level",
    check: (spec: AppSpec) => {
      const actorIds = new Set(spec.actors.map((a) => a.id));
      const invalid: string[] = [];
      for (const feat of spec.features) {
        for (const [role] of Object.entries(feat.permissions)) {
          if (!actorIds.has(role)) invalid.push(`${feat.id}:${role}`);
        }
      }
      if (invalid.length > 0) {
        return { pass: false, message: `Permission entries reference unknown actors: ${invalid.join(", ")}` };
      }
      return { pass: true, message: "All permission entries reference valid actors" };
    },
  },
  {
    id: "G1-R9",
    name: "no_duplicate_feature_ids",
    description: "Feature IDs must be unique within the spec",
    check: (spec: AppSpec) => {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const feat of spec.features) {
        if (seen.has(feat.id)) dupes.push(feat.id);
        seen.add(feat.id);
      }
      if (dupes.length > 0) {
        return { pass: false, message: `Duplicate feature IDs: ${dupes.join(", ")}` };
      }
      return { pass: true, message: "All feature IDs are unique" };
    },
  },
  {
    id: "G1-R10",
    name: "data_entities_have_owners",
    description: "Every data entity referenced across features must appear in at least one feature with write permissions",
    check: (spec: AppSpec) => {
      const allEntities = new Set<string>();
      const ownedEntities = new Set<string>();
      for (const feat of spec.features) {
        for (const entity of feat.data_entities) {
          allEntities.add(entity);
        }
        for (const perms of Object.values(feat.permissions)) {
          for (const perm of perms) {
            if (perm.startsWith("write:") || perm.startsWith("create:") || perm.startsWith("delete:")) {
              const entity = perm.split(":")[1];
              if (entity) ownedEntities.add(entity);
            }
          }
        }
      }
      const unowned = [...allEntities].filter((e) => !ownedEntities.has(e));
      if (unowned.length > 0) {
        return { pass: false, message: `Data entities without write ownership: ${unowned.join(", ")}` };
      }
      return { pass: true, message: "All data entities have write ownership" };
    },
  },
] as const;

export function evaluateGate1(spec: AppSpec): Gate1Result {
  const parsed = AppSpec.parse(spec);
  const results: Gate1Result["rule_results"] = [];

  for (const rule of GATE_1_RULES) {
    const result = rule.check(parsed);
    results.push({
      rule_id: rule.id,
      rule_name: rule.name,
      pass: result.pass,
      message: result.message,
      severity: result.pass ? "info" : "error",
    });
  }

  const passCount = results.filter((r) => r.pass).length;
  const confidence = passCount / GATE_1_RULES.length;
  const thresholds = CONFIDENCE_THRESHOLDS.gate_1_spec_pass;

  return {
    pass: results.every((r) => r.pass) && confidence >= thresholds.min_overall,
    confidence,
    rule_results: results,
  };
}

export { GATE_1_RULES };
