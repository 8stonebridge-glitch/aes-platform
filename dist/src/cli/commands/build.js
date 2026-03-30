import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { logGate, logStep, logSuccess, logFail, logPause, logHeader, logKeyValue, logFeatureStatus, logDivider, logWarn, } from "../logger.js";
import { runGraph } from "../../graph.js";
export async function buildCommand(intent, options) {
    const jobId = `j-${randomUUID().slice(0, 8)}`;
    const requestId = randomUUID();
    logHeader(`AES v12 — New Build`);
    logKeyValue("Job", jobId);
    logKeyValue("Request", requestId);
    logKeyValue("Intent", intent);
    if (options.app) {
        logKeyValue("Target App", options.app);
    }
    logDivider();
    try {
        // Run the LangGraph graph with streaming callbacks
        const result = await runGraph({
            jobId,
            requestId,
            rawRequest: intent,
            currentGate: "gate_0",
        }, {
            onGate: (gate, message) => logGate(gate, message),
            onStep: (message) => logStep(message),
            onSuccess: (message) => logSuccess(message),
            onFail: (message) => logFail(message),
            onWarn: (message) => logWarn(message),
            onPause: (message) => logPause(message),
            onFeatureStatus: (id, name, status) => logFeatureStatus(id, name, status),
            onNeedsApproval: async (prompt, data) => {
                logPause("Awaiting your approval");
                console.log(prompt);
                console.log();
                // Show summary if available
                if (data?.appSpec) {
                    const spec = data.appSpec;
                    logHeader(`App Plan: ${spec.title}`);
                    logKeyValue("Class", spec.app_class);
                    logKeyValue("Risk", spec.risk_class);
                    logKeyValue("Features", `${spec.features?.length || 0}`);
                    logKeyValue("Actors", `${spec.actors?.length || 0}`);
                    logKeyValue("Entities", `${spec.domain_entities?.length || 0}`);
                    logKeyValue("Workflows", `${spec.workflows?.length || 0}`);
                    logKeyValue("Confidence", `${((spec.confidence?.overall || 0) * 100).toFixed(0)}%`);
                    if (spec.features) {
                        console.log();
                        logStep("Features:");
                        for (const f of spec.features) {
                            logFeatureStatus(f.feature_id, f.name, f.status || "proposed");
                        }
                    }
                }
                console.log();
                const approved = await askYesNo("Approve this plan? (y/n): ");
                return approved;
            },
            onNeedsConfirmation: async (confirmationStatement) => {
                logPause("Intent confirmation required");
                console.log(`  ${confirmationStatement}`);
                console.log();
                const confirmed = await askYesNo("Correct? (y/n): ");
                return confirmed;
            },
        });
        // Final output
        console.log();
        logDivider();
        if (result.currentGate === "complete") {
            logSuccess(`Build complete`);
            if (result.deploymentUrl) {
                logKeyValue("Live URL", result.deploymentUrl);
            }
        }
        else if (result.currentGate === "failed") {
            logFail(`Build failed`);
            if (result.errorMessage) {
                logKeyValue("Error", result.errorMessage);
            }
        }
        else {
            logKeyValue("Status", result.currentGate);
        }
        logKeyValue("Job", jobId);
    }
    catch (err) {
        logFail(`Fatal error: ${err.message}`);
        process.exit(1);
    }
}
function askYesNo(prompt) {
    return new Promise((resolve) => {
        const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(prompt, (answer) => {
            rl.close();
            resolve(answer.toLowerCase().startsWith("y"));
        });
    });
}
