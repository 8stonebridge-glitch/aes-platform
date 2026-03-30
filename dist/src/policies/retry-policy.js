export const retryPolicy = {
    specValidation: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 10000, backoffMultiplier: 2 },
    builderRun: { maxRetries: 2, baseDelayMs: 2000, maxDelayMs: 30000, backoffMultiplier: 2 },
    validatorRun: { maxRetries: 2, baseDelayMs: 1000, maxDelayMs: 15000, backoffMultiplier: 2 },
    graphWrite: { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000, backoffMultiplier: 1.5 },
    deployment: { maxRetries: 1, baseDelayMs: 5000, maxDelayMs: 5000, backoffMultiplier: 1 },
};
export function getDelay(config, attempt) {
    const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
    return Math.min(delay, config.maxDelayMs);
}
export function shouldRetry(config, attempt) {
    return attempt < config.maxRetries;
}
