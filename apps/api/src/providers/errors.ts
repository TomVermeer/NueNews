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

/** The parts of an HTTP answer that tell whether it succeeded and when to try again. */
interface AnswerStatus {
  readonly status: number
  readonly headers: Pick<Headers, 'get'>
}

/**
 * Throws a ProviderError for any answer outside 2xx, with its status and the wait time from the
 * first of `retryAfterHeaders` that is present.
 */
export function assertOk(
  response: AnswerStatus,
  {
    service,
    retryAfterHeaders = ['retry-after'],
  }: { service: string; retryAfterHeaders?: readonly string[] },
): void {
  if (response.status >= 200 && response.status < 300) return
  const retryAfter = retryAfterHeaders
    .map((name) => response.headers.get(name))
    .find((value) => value !== null)
  throw new ProviderError(`${service} answered with HTTP ${response.status}`, {
    status: response.status,
    retryAfterSeconds: parseRetryAfter(retryAfter ?? null),
  })
}

/** Reads a numeric Retry-After header (the HTTP-date form is ignored). */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}
