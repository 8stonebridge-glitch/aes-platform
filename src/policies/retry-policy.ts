/**
 * Retry Policy — limits and backoff for failed operations.
 */
export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const retryPolicy = {
  specValidation: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2 } as RetryConfig,
  builderRun: { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 30000, backoffMultiplier: 2 } as RetryConfig,
  validatorRun: { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 15000, backoffMultiplier: 2 } as RetryConfig,
  graphWrite: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 1.5 } as RetryConfig,
  deployment: { maxRetries: 1, baseDelayMs: 5000, maxDelayMs: 5000, backoffMultiplier: 1 } as RetryConfig,
};

export function getDelay(config: RetryConfig, attempt: number): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

export function shouldRetry(config: RetryConfig, attempt: number): boolean {
  return attempt < config.maxRetries;
}
