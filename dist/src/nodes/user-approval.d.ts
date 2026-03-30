import type { AESStateType } from "../state.js";
/**
 * User Approval — pauses the graph for human approval of the full app plan.
 * This is the one time the user approves. Everything after is system-governed.
 */
export declare function userApproval(state: AESStateType): Promise<Partial<AESStateType>>;
