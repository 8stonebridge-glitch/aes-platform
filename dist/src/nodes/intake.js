import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { recordCheckpoint } from "../checkpoints.js";
/**
 * Intake node — validates the raw request and passes to classifier.
 */
export async function intake(state) {
    const cb = getCallbacks();
    const store = getJobStore();
    cb?.onGate("gate_0", "Intent received");
    store.addLog(state.jobId, {
        gate: "gate_0",
        message: `Raw request: "${state.rawRequest}"`,
    });
    await recordCheckpoint({
        job_id: state.jobId,
        gate: "gate_0",
        status: "in_progress",
        last_successful_gate: "gate_0",
        resume_eligible: true,
        resume_reason: "intake",
    });
    if (!state.rawRequest || state.rawRequest.trim().length < 5) {
        cb?.onFail("Request too short — describe what you want to build");
        return {
            currentGate: "failed",
            errorMessage: "Request too short",
        };
    }
    cb?.onStep(`Processing: "${state.rawRequest}"`);
    store.addLog(state.jobId, {
        gate: "gate_0",
        message: "Intake validated, passing to intent classifier",
    });
    return {};
}
