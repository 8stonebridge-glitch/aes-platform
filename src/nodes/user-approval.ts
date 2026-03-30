import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";
import { shouldAutoApprovePlan } from "../autonomy.js";

/**
 * User Approval — pauses the graph for human approval of the full app plan.
 * This is the one time the user approves. Everything after is system-governed.
 */
export async function userApproval(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.appSpec) {
    cb?.onFail("No AppSpec to approve");
    return {
      currentGate: "failed" as const,
      errorMessage: "Missing AppSpec for approval",
    };
  }

  if (shouldAutoApprovePlan(state)) {
    cb?.onSuccess("Autonomous mode auto-approved app plan");
    store.addLog(state.jobId, {
      gate: "gate_1",
      message: "Autonomous mode auto-approved app plan",
    });

    return {
      userApproved: true,
      currentGate: "gate_2" as const,
    };
  }

  store.addLog(state.jobId, {
    gate: "gate_1",
    message: "Awaiting user approval of app plan",
  });

  const approved = await cb?.onNeedsApproval(
    "Review the app plan above and approve to proceed with building.",
    { appSpec: state.appSpec }
  );

  if (approved) {
    cb?.onSuccess("App plan approved — proceeding to build");
    store.addLog(state.jobId, {
      gate: "gate_1",
      message: "User approved app plan",
    });

    return {
      userApproved: true,
      currentGate: "gate_2" as const,
    };
  } else {
    cb?.onFail("App plan rejected by user");
    store.addLog(state.jobId, {
      gate: "gate_1",
      message: "User rejected app plan",
    });

    return {
      userApproved: false,
      currentGate: "failed" as const,
      errorMessage: "App plan rejected by user",
    };
  }
}
