/** A failure while resolving or fetching a source, safe to show to the user. */
export class ProviderError extends Error {
  readonly status?: number
  readonly retryAfterSeconds?: number

  constructor(message: string, details: { status?: number; retryAfterSeconds?: number } = {}) {
    super(message)
    this.name = 'ProviderError'
    this.status = details.status
    this.retryAfterSeconds = details.retryAfterSeconds
  }
}

/** Reads a numeric Retry-After header (the HTTP-date form is ignored). */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}
