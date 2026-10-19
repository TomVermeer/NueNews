const MINUTE = 60_000
const MAX_BACKOFF_MS = 6 * 60 * MINUTE
const MAX_RETRY_AFTER_MS = 24 * 60 * MINUTE

/** When a source that was fetched successfully should be fetched again. */
export function nextFetchAfterSuccess(now: Date, intervalMin: number): Date {
  return new Date(now.getTime() + intervalMin * MINUTE)
}

/**
 * When to retry a failing source. The delay doubles with each consecutive error (so a feed on a
 * 30 minute interval is retried after 1 h, 2 h, 4 h, then every 6 h) and never undercuts a
 * Retry-After hint from the site.
 */
export function nextFetchAfterError(
  now: Date,
  intervalMin: number,
  errorCount: number,
  retryAfterSeconds?: number,
): Date {
  const backoff = Math.min(intervalMin * MINUTE * 2 ** Math.max(errorCount, 1), MAX_BACKOFF_MS)
  const hint = Math.min((retryAfterSeconds ?? 0) * 1000, MAX_RETRY_AFTER_MS)
  return new Date(now.getTime() + Math.max(backoff, hint))
}
