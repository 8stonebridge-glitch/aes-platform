import { ChatOpenAI } from "@langchain/openai";
export declare function getLLM(): ChatOpenAI | null;
export declare function isLLMAvailable(): boolean;
/** Reset the cached model instance — used in tests */
export declare function resetLLM(): void;
export declare function acquireLLMSlot(label?: string): Promise<number>;
export declare function releaseLLMSlot(slotId?: number): void;
/** Race a promise against a timeout; resolves to null on timeout. */
export declare function withLLMTimeout<T>(promise: Promise<T>, ms?: number): Promise<T | null>;
/**
 * Safe LLM call wrapper — acquires semaphore slot, enforces timeout,
 * guarantees release in finally block. Use this for ALL pipeline LLM calls.
 */
export declare function safeLLMCall<T>(label: string, fn: () => Promise<T>, timeoutMs?: number): Promise<T | null>;
/** Observability snapshot for the LLM semaphore */
export declare function getLLMSemaphoreStats(): {
    maxSlots: number;
    activeSlots: number;
    queueLength: number;
    totalAcquired: number;
    totalReleased: number;
    totalTimedOut: number;
    slotLeakDetected: boolean;
    holders: {
        slotId: number;
        label: string;
        heldMs: number;
    }[];
    oldestHolder: {
        slotId: number;
        label: string;
        heldMs: number;
    } | null;
};
/** Force-release all slots — emergency recovery only */
export declare function resetLLMSemaphore(): void;
