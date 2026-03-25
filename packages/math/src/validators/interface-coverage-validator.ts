import type { ValidatorInput, ValidatorOutput } from "./validator-runner.js";

export function validateInterfaceCoverage(input: ValidatorInput): ValidatorOutput {
  const violations: ValidatorOutput["violations"] = [];
  const files = input.files || [];

  if (files.length === 0) {
    violations.push({
      code: "IFACE_001",
      message: "No files provided for interface coverage analysis",
      severity: "warning",
    });
    return { validator_name: "interface_coverage", passed: true, violations, score: 0.5 };
  }

  let totalExports = 0;
  let typedExports = 0;
  let anyTypeCount = 0;
  let undocumentedExports = 0;

  for (const file of files) {
    if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) continue;

    const content = file.content;
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect exported functions
      if (line.match(/^\s*export\s+(async\s+)?function\s+/)) {
        totalExports++;
        // Check for return type annotation
        if (line.includes("): ") || line.match(/\):\s*\w/)) {
          typedExports++;
        } else {
          violations.push({
            code: "IFACE_MISSING_RETURN_TYPE",
            message: `Exported function without return type at ${file.path}:${i + 1}`,
            severity: "error",
          });
        }
        // Check for JSDoc
        if (i === 0 || !lines[i - 1].trim().endsWith("*/")) {
          // Rough check: look back up to 5 lines for a JSDoc comment end
          let hasDoc = false;
          for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            if (lines[j].trim().endsWith("*/")) { hasDoc = true; break; }
            if (lines[j].trim() !== "" && !lines[j].trim().startsWith("*") && !lines[j].trim().startsWith("//")) break;
          }
          if (!hasDoc) {
            undocumentedExports++;
            violations.push({
              code: "IFACE_UNDOCUMENTED_EXPORT",
              message: `Exported function without documentation at ${file.path}:${i + 1}`,
              severity: "warning",
            });
          }
        }
      }

      // Detect exported interfaces/types
      if (line.match(/^\s*export\s+(interface|type)\s+/)) {
        totalExports++;
        typedExports++; // interfaces/types are inherently typed
      }

      // Detect exported constants
      if (line.match(/^\s*export\s+(const|let|var)\s+/)) {
        totalExports++;
        if (line.includes(": ") || line.match(/:\s*\w/)) {
          typedExports++;
        }
      }

      // Detect `any` in public API
      if (line.match(/^\s*export\s+/) && line.includes(": any")) {
        anyTypeCount++;
        violations.push({
          code: "IFACE_ANY_IN_PUBLIC",
          message: `'any' type in public API at ${file.path}:${i + 1}`,
          severity: "error",
        });
      }

      // Also check for `any` in exported function parameters
      if (line.match(/^\s*export\s+(async\s+)?function\s+/) && line.includes("any")) {
        if (!violations.some(v => v.message.includes(`${file.path}:${i + 1}`) && v.code === "IFACE_ANY_IN_PUBLIC")) {
          anyTypeCount++;
          violations.push({
            code: "IFACE_ANY_IN_PUBLIC",
            message: `'any' type in exported function at ${file.path}:${i + 1}`,
            severity: "error",
          });
        }
      }
    }
  }

  // Compute coverage
  const typeCoverage = totalExports > 0 ? typedExports / totalExports : 1;

  if (typeCoverage < 0.8) {
    violations.push({
      code: "IFACE_LOW_TYPE_COVERAGE",
      message: `Type coverage is ${Math.round(typeCoverage * 100)}% (minimum 80%)`,
      severity: "error",
    });
  }

  const criticalOrError = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
  const score = Math.round(typeCoverage * 1000) / 1000;

  return {
    validator_name: "interface_coverage",
    passed: criticalOrError === 0,
    violations,
    score,
  };
}
