import type { AESStateType } from "../state.js";
import { getCallbacks } from "../graph.js";
import { getJobStore } from "../store.js";

/**
 * Intent Confirmer — asks the user to confirm or clarify the classified intent.
 * When ambiguity flags exist, sends clarifying questions to the user.
 * The user's answers are merged into the intent for re-classification.
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
  const questions = brief.clarifying_questions ?? [];

  store.addLog(state.jobId, {
    gate: "gate_0",
    message: questions.length > 0
      ? `Asking user to clarify: ${questions.join("; ")}`
      : `Asking user to confirm: "${brief.confirmation_statement}"`,
  });

  // Ask user via callback — passes questions so the UI can show them
  const confirmed = await cb?.onNeedsConfirmation(
    brief.confirmation_statement,
    questions,
  );

  if (confirmed) {
    // Check if the user provided clarification text (stored on the job by the confirm endpoint)
    const job = store.get(state.jobId);
    const clarification = job?.clarification as string | undefined;

    if (clarification) {
      cb?.onSuccess(`Clarification received — enriching intent`);
      store.addLog(state.jobId, {
        gate: "gate_0",
        message: `User clarified: "${clarification.slice(0, 100)}"`,
      });

      // Merge clarification into the raw request for re-classification
      const enrichedRequest = `${brief.raw_request}. ${clarification}`;

      return {
        intentConfirmed: true,
        rawRequest: enrichedRequest,
        intentBrief: {
          ...brief,
          raw_request: enrichedRequest,
          user_clarification: clarification,
          confirmation_status: "confirmed_with_clarification",
          ambiguity_flags: [], // cleared — user answered
          updated_at: new Date().toISOString(),
        },
      };
    }

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
    cb?.onFail("Intent timed out waiting for confirmation");
    store.addLog(state.jobId, {
      gate: "gate_0",
      message: "Intent confirmation timed out",
    });

    return {
      intentConfirmed: false,
      currentGate: "failed" as const,
      intentBrief: {
        ...brief,
        confirmation_status: "timed_out",
        updated_at: new Date().toISOString(),
      },
      errorMessage: "Intent confirmation timed out — try again with more detail",
    };
  }
}
