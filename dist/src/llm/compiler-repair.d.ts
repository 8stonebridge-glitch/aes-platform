export interface CompilerRepairResult {
    repaired: boolean;
    filesChanged: string[];
    summary: string;
}
export declare function repairFilesForCompilerErrors(args: {
    workspacePath: string;
    errorOutput: string;
    hermesHints?: string[];
}): Promise<CompilerRepairResult>;
