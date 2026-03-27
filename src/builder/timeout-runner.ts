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
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  label = "operation"
): Promise<TimeoutResult<T>> {
  const start = Date.now();

  return new Promise<TimeoutResult<T>>((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({
          success: false,
          timed_out: true,
          duration_ms: Date.now() - start,
          error: `${label} timed out after ${timeoutMs}ms`,
        });
      }
    }, timeoutMs);

    fn()
      .then((result) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            success: true,
            result,
            timed_out: false,
            duration_ms: Date.now() - start,
          });
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({
            success: false,
            timed_out: false,
            duration_ms: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      });
  });
}

/**
 * Run with timeout and retry on failure (not on timeout).
 */
export async function withTimeoutRetry<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  maxRetries: number,
  label = "operation"
): Promise<TimeoutResult<T> & { attempts: number }> {
  let lastResult: TimeoutResult<T> | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const result = await withTimeout(fn, timeoutMs, `${label} (attempt ${attempt})`);

    if (result.success) {
      return { ...result, attempts: attempt };
    }

    lastResult = result;

    // Don't retry on timeout — it would just timeout again
    if (result.timed_out) {
      return { ...result, attempts: attempt };
    }
  }

  return { ...lastResult!, attempts: maxRetries + 1 };
}
