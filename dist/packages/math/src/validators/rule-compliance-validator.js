export function validateRuleCompliance(input) {
    const violations = [];
    const bridge = input.bridge;
    if (!bridge) {
        violations.push({
            code: "RULE_001",
            message: "No bridge provided — cannot validate rule compliance",
            severity: "warning",
        });
        return { validator_name: "rule_compliance", passed: true, violations, score: 0.5 };
    }
    const rules = bridge.applied_rules || [];
    if (rules.length === 0) {
        violations.push({
            code: "RULE_NO_RULES",
            message: "Bridge has no applied rules — nothing to validate",
            severity: "info",
        });
        return { validator_name: "rule_compliance", passed: true, violations, score: 1 };
    }
    const artifact = input.artifact;
    let addressedRules = 0;
    for (const rule of rules) {
        let addressed = false;
        switch (rule.gate_type) {
            case "coverage":
                // Check if evidence coverage exists
                if (artifact?.evidence_coverage !== undefined && artifact.evidence_coverage > 0) {
                    addressed = true;
                }
                break;
            case "dependency":
                // Check if dependencies are declared
                if (Array.isArray(artifact?.dependencies) || Array.isArray(artifact?.features)) {
                    addressed = true;
                }
                break;
            case "flow":
                // Check if user flows are defined
                if (Array.isArray(artifact?.flows) && artifact.flows.length > 0) {
                    addressed = true;
                }
                break;
            case "buildability":
                // Check if implementation plan exists
                if (artifact?.implementation_plan || artifact?.build_plan || artifact?.status === "execution_ready") {
                    addressed = true;
                }
                break;
            case "contradiction":
                // Check if contradictions were resolved
                if (artifact?.contradictions_resolved === true ||
                    (Array.isArray(artifact?.contradictions) && artifact.contradictions.length === 0)) {
                    addressed = true;
                }
                break;
            case "confidence":
                // Check if confidence meets the threshold
                if (artifact?.confidence_score !== undefined && artifact.confidence_score >= 0.7) {
                    addressed = true;
                }
                break;
        }
        if (addressed) {
            addressedRules++;
        }
        else if (rule.required) {
            violations.push({
                code: "RULE_UNADDRESSED",
                message: `Required rule '${rule.rule_id}' (${rule.gate_type}: ${rule.description}) is not addressed`,
                severity: "error",
            });
        }
        else {
            violations.push({
                code: "RULE_OPTIONAL_UNADDRESSED",
                message: `Optional rule '${rule.rule_id}' (${rule.gate_type}: ${rule.description}) is not addressed`,
                severity: "info",
            });
        }
    }
    const complianceRatio = rules.length > 0 ? addressedRules / rules.length : 1;
    const criticalOrError = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
    const score = Math.round(complianceRatio * 1000) / 1000;
    return {
        validator_name: "rule_compliance",
        passed: criticalOrError === 0,
        violations,
        score,
    };
}
