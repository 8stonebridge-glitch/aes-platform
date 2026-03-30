import { type AESStateType } from "./state.js";
export interface GraphCallbacks {
    onGate: (gate: string, message: string) => void;
    onStep: (message: string) => void;
    onSuccess: (message: string) => void;
    onFail: (message: string) => void;
    onWarn: (message: string) => void;
    onPause: (message: string) => void;
    onFeatureStatus: (id: string, name: string, status: string) => void;
    onNeedsApproval: (prompt: string, data: any) => Promise<boolean>;
    onNeedsConfirmation: (statement: string, questions?: string[]) => Promise<boolean>;
}
export declare function getCallbacks(): GraphCallbacks | null;
export declare function getCallbacksForJob(jobId: string): GraphCallbacks | null;
export declare function setActiveJob(jobId: string): void;
export declare function buildAESGraph(): any;
export declare function runGraph(input: {
    jobId: string;
    requestId: string;
    rawRequest: string;
    currentGate: "gate_0";
    targetPath?: string | null;
    deployTarget?: "local" | "cloudflare" | "vercel";
    autonomous?: boolean;
    designMode?: "auto" | "paper";
}, callbacks: GraphCallbacks): Promise<AESStateType>;
