/**
 * Wait for a condition to become true, polling at intervals.
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 5000, interval = 50 } = options;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error(`waitFor timed out after ${timeout}ms`);
}

/**
 * Create a deferred promise for async test coordination.
 */
export function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Utility to assert a function throws an error matching a pattern.
 */
export async function expectThrows(
  fn: () => unknown | Promise<unknown>,
  match?: string | RegExp
): Promise<Error> {
  try {
    await fn();
    throw new Error("Expected function to throw, but it did not");
  } catch (err) {
    if (!(err instanceof Error)) throw err;
    if (err.message === "Expected function to throw, but it did not") throw err;
    if (match) {
      const pattern = typeof match === "string" ? new RegExp(match) : match;
      if (!pattern.test(err.message)) {
        throw new Error(
          `Expected error matching ${pattern}, got: "${err.message}"`
        );
      }
    }
    return err;
  }
}

/**
 * Generate a unique ID for test isolation.
 */
export function testId(prefix = "test"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
