/**
 * Retry Policy — limits and backoff for failed operations.
 */
export interface RetryConfig {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
}
export declare const retryPolicy: {
    specValidation: RetryConfig;
    builderRun: RetryConfig;
    validatorRun: RetryConfig;
    graphWrite: RetryConfig;
    deployment: RetryConfig;
};
export declare function getDelay(config: RetryConfig, attempt: number): number;
export declare function shouldRetry(config: RetryConfig, attempt: number): boolean;
