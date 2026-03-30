import type { AESStateType } from "../state.js";
export declare function keywordClassifyIntent(rawRequest: string, requestId: string): any;
export declare function intentClassifier(state: AESStateType): Promise<Partial<AESStateType>>;
