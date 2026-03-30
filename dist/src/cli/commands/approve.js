import { logSuccess, logFail } from "../logger.js";
import { getJobStore } from "../../store.js";
export async function approveCommand(jobId) {
    const store = getJobStore();
    const job = store.get(jobId);
    if (!job) {
        logFail(`Job ${jobId} not found`);
        return;
    }
    if (job.currentGate !== "awaiting_user_approval") {
        logFail(`Job ${jobId} is not awaiting approval (current state: ${job.currentGate})`);
        return;
    }
    store.update(jobId, {
        userApproved: true,
        currentGate: "approved_for_build",
    });
    logSuccess(`Job ${jobId} approved. Build will continue.`);
}
