import type { ValidatorInput, ValidatorOutput } from "./validator-runner.js";

export function validateDependencyIntegrity(input: ValidatorInput): ValidatorOutput {
  const violations: ValidatorOutput["violations"] = [];
  const artifact = input.artifact;

  if (!artifact || typeof artifact !== "object") {
    violations.push({
      code: "DEP_001",
      message: "Artifact is null or not an object",
      severity: "critical",
    });
    return { validator_name: "dependency_integrity", passed: false, violations, score: 0 };
  }

  const dependencies: string[] = artifact.dependencies || [];
  const knownIds: Set<string> = new Set();

  // Build known ID set from artifact's feature list or sub-artifacts
  if (Array.isArray(artifact.features)) {
    for (const f of artifact.features) {
      if (f && typeof f === "object" && f.id) {
        knownIds.add(f.id);
      }
    }
  }
  if (artifact.id) knownIds.add(artifact.id);

  // Check all referenced dependency IDs exist
  for (const depId of dependencies) {
    if (!knownIds.has(depId)) {
      violations.push({
        code: "DEP_ORPHAN_REF",
        message: `Dependency reference '${depId}' does not correspond to a known artifact or feature`,
        severity: "error",
      });
    }
  }

  // Check for circular dependencies within features
  if (Array.isArray(artifact.features)) {
    const featureMap = new Map<string, string[]>();
    for (const f of artifact.features) {
      if (f && typeof f === "object" && f.id) {
        featureMap.set(f.id, Array.isArray(f.dependencies) ? f.dependencies : []);
      }
    }

    // DFS cycle detection
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function detectCycle(id: string, path: string[]): boolean {
      if (inStack.has(id)) {
        const cycleStart = path.indexOf(id);
        const cycle = path.slice(cycleStart).concat(id);
        violations.push({
          code: "DEP_CIRCULAR",
          message: `Circular dependency detected: ${cycle.join(" -> ")}`,
          severity: "critical",
        });
        return true;
      }
      if (visited.has(id)) return false;

      visited.add(id);
      inStack.add(id);
      path.push(id);

      const deps = featureMap.get(id) || [];
      for (const dep of deps) {
        if (featureMap.has(dep)) {
          detectCycle(dep, [...path]);
        }
      }

      inStack.delete(id);
      return false;
    }

    for (const fId of featureMap.keys()) {
      if (!visited.has(fId)) {
        detectCycle(fId, []);
      }
    }

    // Check for orphaned features (referenced by nothing and depend on nothing external)
    const referenced = new Set<string>();
    for (const [, deps] of featureMap) {
      for (const d of deps) referenced.add(d);
    }

    for (const [fId] of featureMap) {
      const deps = featureMap.get(fId) || [];
      if (!referenced.has(fId) && deps.length === 0 && featureMap.size > 1) {
        violations.push({
          code: "DEP_ISOLATED",
          message: `Feature '${fId}' is isolated — no inbound or outbound dependencies`,
          severity: "info",
        });
      }
    }
  }

  // Check dependency status alignment
  if (Array.isArray(artifact.features)) {
    for (const f of artifact.features) {
      if (f && f.status === "completed" && Array.isArray(f.dependencies)) {
        for (const depId of f.dependencies) {
          const dep = artifact.features.find((x: any) => x?.id === depId);
          if (dep && dep.status !== "completed") {
            violations.push({
              code: "DEP_STATUS_MISMATCH",
              message: `Feature '${f.id}' is completed but depends on '${depId}' which is '${dep.status}'`,
              severity: "error",
            });
          }
        }
      }
    }
  }

  const criticalOrError = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
  const totalChecks = Math.max(dependencies.length + (artifact.features?.length || 0), 1);
  const score = Math.max(0, Math.round((1 - criticalOrError / totalChecks) * 1000) / 1000);

  return {
    validator_name: "dependency_integrity",
    passed: criticalOrError === 0,
    violations,
    score,
  };
}
