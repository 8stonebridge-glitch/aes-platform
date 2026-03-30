import type { AESStateType } from "../state.js";
/**
 * Intake node — validates the raw request and passes to classifier.
 */
export declare function intake(state: AESStateType): Promise<Partial<AESStateType>>;
