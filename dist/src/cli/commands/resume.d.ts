export declare function resumeCommand(jobId: string): Promise<void>;
/**
 * Determine the resume gate from a loaded job record.
 * Exported for testing and orchestration use.
 */
export declare function determineResumeGate(job: {
    intentBrief?: unknown;
    appSpec?: unknown;
    userApproved?: boolean;
    featureBridges?: Record<string, unknown>;
    vetoResults?: unknown[];
    durability?: string;
}): string | null;
