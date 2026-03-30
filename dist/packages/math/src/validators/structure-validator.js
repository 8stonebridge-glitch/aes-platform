const REQUIRED_ARTIFACT_FIELDS = [
    "id",
    "name",
    "type",
    "status",
    "created_at",
    "version",
];
const REQUIRED_BRIDGE_FIELDS = [
    "artifact_id",
    "bridge_type",
    "created_at",
    "confidence_score",
];
export function validateStructure(input) {
    const violations = [];
    const artifact = input.artifact;
    if (!artifact || typeof artifact !== "object") {
        violations.push({
            code: "STRUCT_001",
            message: "Artifact is null or not an object",
            severity: "critical",
        });
        return {
            validator_name: "structure",
            passed: false,
            violations,
            score: 0,
        };
    }
    // Check required artifact fields
    for (const field of REQUIRED_ARTIFACT_FIELDS) {
        if (!(field in artifact)) {
            violations.push({
                code: "STRUCT_MISSING_FIELD",
                message: `Required artifact field missing: ${field}`,
                severity: "error",
            });
        }
        else if (artifact[field] === null || artifact[field] === undefined) {
            violations.push({
                code: "STRUCT_NULL_FIELD",
                message: `Required artifact field is null: ${field}`,
                severity: "error",
            });
        }
    }
    // Check field types
    if (artifact.id !== undefined && typeof artifact.id !== "string") {
        violations.push({
            code: "STRUCT_TYPE_ERROR",
            message: `Field 'id' must be a string, got ${typeof artifact.id}`,
            severity: "error",
        });
    }
    if (artifact.name !== undefined && typeof artifact.name !== "string") {
        violations.push({
            code: "STRUCT_TYPE_ERROR",
            message: `Field 'name' must be a string, got ${typeof artifact.name}`,
            severity: "error",
        });
    }
    if (artifact.name !== undefined && typeof artifact.name === "string" && artifact.name.trim() === "") {
        violations.push({
            code: "STRUCT_EMPTY_NAME",
            message: "Artifact name is empty",
            severity: "warning",
        });
    }
    if (artifact.version !== undefined && typeof artifact.version !== "number" && typeof artifact.version !== "string") {
        violations.push({
            code: "STRUCT_TYPE_ERROR",
            message: `Field 'version' must be a number or string, got ${typeof artifact.version}`,
            severity: "error",
        });
    }
    if (artifact.created_at !== undefined) {
        const date = new Date(artifact.created_at);
        if (isNaN(date.getTime())) {
            violations.push({
                code: "STRUCT_INVALID_DATE",
                message: `Field 'created_at' is not a valid date: ${artifact.created_at}`,
                severity: "error",
            });
        }
    }
    // Validate bridge structure if present
    if (input.bridge) {
        for (const field of REQUIRED_BRIDGE_FIELDS) {
            if (!(field in input.bridge)) {
                violations.push({
                    code: "STRUCT_BRIDGE_MISSING",
                    message: `Required bridge field missing: ${field}`,
                    severity: "error",
                });
            }
        }
        if (input.bridge.artifact_id !== undefined && input.bridge.artifact_id !== artifact.id) {
            violations.push({
                code: "STRUCT_BRIDGE_MISMATCH",
                message: `Bridge artifact_id (${input.bridge.artifact_id}) does not match artifact id (${artifact.id})`,
                severity: "critical",
            });
        }
    }
    const errorCount = violations.filter(v => v.severity === "error" || v.severity === "critical").length;
    const totalChecks = REQUIRED_ARTIFACT_FIELDS.length + 3; // fields + type checks
    const score = Math.max(0, Math.round((1 - errorCount / totalChecks) * 1000) / 1000);
    return {
        validator_name: "structure",
        passed: violations.filter(v => v.severity === "error" || v.severity === "critical").length === 0,
        violations,
        score,
    };
}
