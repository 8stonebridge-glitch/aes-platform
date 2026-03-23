import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

/**
 * Intent Confirmer — asks the user to confirm the classified intent.
 * Only runs when auto-confirm conditions are not met.
 */
export async function intentConfirmer(
  state: AESStateType
): Promise<Partial<AESStateType>> {
  const cb = getCallbacks();
  const store = getJobStore();

  if (!state.intentBrief) {
    cb?.onFail("No intent brief to confirm");
    return {
      currentGate: "failed" as const,
      errorMessage: "Missing intent brief",
    };
  }

  const brief = state.intentBrief;

  store.addLog(state.jobId, {
    gate: "gate_0",
    message: `Asking user to confirm: "${brief.confirmation_statement}"`,
  });

  // Ask user via CLI callback
  const confirmed = await cb?.onNeedsConfirmation(brief.confirmation_statement);

  if (confirmed) {
    cb?.onSuccess("Intent confirmed by user");
    store.addLog(state.jobId, {
      gate: "gate_0",
      message: "User confirmed intent",
    });

    return {
      intentConfirmed: true,
      intentBrief: {
        ...brief,
        confirmation_status: "confirmed",
        updated_at: new Date().toISOString(),
      },
    };
  } else {
    cb?.onFail("Intent rejected by user");
    store.addLog(state.jobId, {
      gate: "gate_0",
      message: "User rejected intent",
    });

    return {
      intentConfirmed: false,
      currentGate: "failed" as const,
      intentBrief: {
        ...brief,
        confirmation_status: "rejected",
        updated_at: new Date().toISOString(),
      },
      errorMessage: "Intent rejected by user",
    };
  }
}
