import type { AESStateType } from "./state.js";
export declare function isAutonomousBuild(state?: Pick<AESStateType, "autonomous"> | {
    autonomous?: boolean | null;
}): boolean;
export declare function shouldAutoConfirmIntent(state?: Pick<AESStateType, "autonomous"> | {
    autonomous?: boolean | null;
}): boolean;
export declare function shouldAutoApprovePlan(state?: Pick<AESStateType, "autonomous"> | {
    autonomous?: boolean | null;
}): boolean;
