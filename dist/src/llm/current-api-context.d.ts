import { type FrameworkContractPackId } from "../contracts/framework-contract-layer.js";
export declare function getGenerationGroundTruth(): Promise<string>;
export declare function getGenerationGroundTruthForPacks(contractPackIds: FrameworkContractPackId[]): Promise<string>;
