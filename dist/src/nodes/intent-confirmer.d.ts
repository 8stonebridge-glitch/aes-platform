import type { AESStateType } from "../state.js";
/**
 * Intent Confirmer — asks the user to confirm or clarify the classified intent.
 * When ambiguity flags exist, sends clarifying questions to the user.
 * The user's answers are merged into the intent for re-classification.
 */
export declare function intentConfirmer(state: AESStateType): Promise<Partial<AESStateType>>;
