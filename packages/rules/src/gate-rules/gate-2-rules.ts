/**
 * Gate 2: Bridge Compile Checks
 *
 * These 10 rules validate that a bridge compilation (from AppSpec to executable
 * build plan) is complete, consistent, and ready for execution.
 */

import { z } from "zod";
import { CONFIDENCE_THRESHOLDS } from "../policies/confidence-thresholds.js";

export const BridgeAsset = z.object({
  id: z.string(),
  type: z.enum(["template", "component", "schema", "migration", "test", "config", "route", "middleware"]),
  source: z.enum(["reuse", "generate", "donor", "manual"]),
  status: z.enum(["resolved", "pending", "incompatible", "missing"]),
  target_feature: z.string(),
});
export type BridgeAsset = z.infer<typeof BridgeAsset>;

export const BridgeRule = z.object({
  id: z.string(),
  type: z.string(),
  attached_to: z.string(),
  status: z.enum(["attached", "pending", "missing"]),
});
export type BridgeRule = z.infer<typeof BridgeRule>;

export const BridgeCompilation = z.object({
  spec_id: z.string(),
  features: z.array(z.string()),
  assets: z.array(BridgeAsset),
  rules: z.array(BridgeRule),
  dependency_order: z.array(z.string()),
  unresolved_dependencies: z.array(z.string()).default([]),
  test_plan: z.record(z.string(), z.array(z.string())).default({}),
});
export type BridgeCompilation = z.infer<typeof BridgeCompilation>;

export const Gate2Result = z.object({
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
export type Gate2Result = z.infer<typeof Gate2Result>;

const GATE_2_RULES = [
  {
    id: "G2-R1",
    name: "all_features_have_assets",
    description: "Every feature in the spec must have at least one bridge asset assigned",
    check: (bridge: BridgeCompilation) => {
      const coveredFeatures = new Set(bridge.assets.map((a) => a.target_feature));
      const uncovered = bridge.features.filter((f) => !coveredFeatures.has(f));
      if (uncovered.length > 0) {
        return { pass: false, message: `Features without assets: ${uncovered.join(", ")}` };
      }
      return { pass: true, message: "All features have bridge assets" };
    },
  },
  {
    id: "G2-R2",
    name: "no_incompatible_assets",
    description: "No bridge asset may be in 'incompatible' status",
    check: (bridge: BridgeCompilation) => {
      const incompatible = bridge.assets.filter((a) => a.status === "incompatible");
      if (incompatible.length > 0) {
        return { pass: false, message: `Incompatible assets: ${incompatible.map((a) => a.id).join(", ")}` };
      }
      return { pass: true, message: "No incompatible assets" };
    },
  },
  {
    id: "G2-R3",
    name: "no_missing_assets",
    description: "No bridge asset may be in 'missing' status",
    check: (bridge: BridgeCompilation) => {
      const missing = bridge.assets.filter((a) => a.status === "missing");
      if (missing.length > 0) {
        return { pass: false, message: `Missing assets: ${missing.map((a) => a.id).join(", ")}` };
      }
      return { pass: true, message: "No missing assets" };
    },
  },
  {
    id: "G2-R4",
    name: "dependency_order_complete",
    description: "Dependency order must include all features and respect the dependency graph",
    check: (bridge: BridgeCompilation) => {
      const ordered = new Set(bridge.dependency_order);
      const allFeatures = new Set(bridge.features);
      const missing = [...allFeatures].filter((f) => !ordered.has(f));
      if (missing.length > 0) {
        return { pass: false, message: `Features missing from dependency order: ${missing.join(", ")}` };
      }
      return { pass: true, message: "Dependency order is complete" };
    },
  },
  {
    id: "G2-R5",
    name: "no_unresolved_dependencies",
    description: "All dependencies must be resolved before bridge compilation passes",
    check: (bridge: BridgeCompilation) => {
      if (bridge.unresolved_dependencies.length > 0) {
        return { pass: false, message: `Unresolved dependencies: ${bridge.unresolved_dependencies.join(", ")}` };
      }
      return { pass: true, message: "All dependencies resolved" };
    },
  },
  {
    id: "G2-R6",
    name: "rules_attached_to_features",
    description: "Every feature must have at least one validation rule attached",
    check: (bridge: BridgeCompilation) => {
      const ruledFeatures = new Set(bridge.rules.filter((r) => r.status === "attached").map((r) => r.attached_to));
      const unruled = bridge.features.filter((f) => !ruledFeatures.has(f));
      if (unruled.length > 0) {
        return { pass: false, message: `Features without attached rules: ${unruled.join(", ")}` };
      }
      return { pass: true, message: "All features have attached rules" };
    },
  },
  {
    id: "G2-R7",
    name: "no_missing_rules",
    description: "No rule may be in 'missing' status",
    check: (bridge: BridgeCompilation) => {
      const missingRules = bridge.rules.filter((r) => r.status === "missing");
      if (missingRules.length > 0) {
        return { pass: false, message: `Missing rules: ${missingRules.map((r) => r.id).join(", ")}` };
      }
      return { pass: true, message: "No missing rules" };
    },
  },
  {
    id: "G2-R8",
    name: "test_plan_covers_features",
    description: "Every feature must have at least one test in the test plan",
    check: (bridge: BridgeCompilation) => {
      const testedFeatures = new Set(Object.keys(bridge.test_plan));
      const untested = bridge.features.filter((f) => !testedFeatures.has(f) || bridge.test_plan[f]?.length === 0);
      if (untested.length > 0) {
        return { pass: false, message: `Features without test plan entries: ${untested.join(", ")}` };
      }
      return { pass: true, message: "Test plan covers all features" };
    },
  },
  {
    id: "G2-R9",
    name: "reuse_assets_resolved",
    description: "Assets sourced from 'reuse' or 'donor' must be in 'resolved' status",
    check: (bridge: BridgeCompilation) => {
      const unresolvedReuse = bridge.assets.filter(
        (a) => (a.source === "reuse" || a.source === "donor") && a.status !== "resolved"
      );
      if (unresolvedReuse.length > 0) {
        return { pass: false, message: `Unresolved reuse/donor assets: ${unresolvedReuse.map((a) => a.id).join(", ")}` };
      }
      return { pass: true, message: "All reuse/donor assets are resolved" };
    },
  },
  {
    id: "G2-R10",
    name: "spec_id_present",
    description: "Bridge must reference the source spec ID for traceability",
    check: (bridge: BridgeCompilation) => {
      if (!bridge.spec_id.trim()) {
        return { pass: false, message: "Bridge compilation has no spec_id reference" };
      }
      return { pass: true, message: "Spec reference is present" };
    },
  },
] as const;

export function evaluateGate2(bridge: BridgeCompilation): Gate2Result {
  const parsed = BridgeCompilation.parse(bridge);
  const results: Gate2Result["rule_results"] = [];

  for (const rule of GATE_2_RULES) {
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
  const confidence = passCount / GATE_2_RULES.length;
  const thresholds = CONFIDENCE_THRESHOLDS.gate_2_bridge_pass;

  return {
    pass: results.every((r) => r.pass) && confidence >= thresholds.min_overall,
    confidence,
    rule_results: results,
  };
}

export { GATE_2_RULES };
