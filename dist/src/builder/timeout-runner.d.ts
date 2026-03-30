/**
 * P4 — Feature-Class Timeouts.
 * Wraps any async operation with a class-appropriate timeout.
 * Prevents a single slow feature from blocking the entire pipeline.
 */
export interface TimeoutResult<T> {
    success: boolean;
    result?: T;
    timed_out: boolean;
    duration_ms: number;
    error?: string;
}
/**
 * Run an async function with a timeout. Returns a TimeoutResult.
 */
export declare function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label?: string): Promise<TimeoutResult<T>>;
/**
 * Run with timeout and retry on failure (not on timeout).
 */
export declare function withTimeoutRetry<T>(fn: () => Promise<T>, timeoutMs: number, maxRetries: number, label?: string): Promise<TimeoutResult<T> & {
    attempts: number;
}>;
