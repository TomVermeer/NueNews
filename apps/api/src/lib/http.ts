import { Agent, fetch as undiciFetch } from 'undici'
import type { LookupFunction } from 'node:net'
import { errorMessage } from './errors'
import { BlockedUrlError, checkUrl, createGuardedLookup } from './ssrf'

export interface HttpHeaders {
  get(name: string): string | null
}

export interface HttpResponse {
  status: number
  headers: HttpHeaders
  /** The URL the body came from, after any redirects. */
  url: string
  body: string
}

export interface HttpClient {
  get(url: string, options?: { headers?: Record<string, string> }): Promise<HttpResponse>
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly code: 'timeout' | 'too_large' | 'too_many_redirects' | 'network',
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export interface RawResponse {
  status: number
  headers: HttpHeaders
  body: ReadableStream<Uint8Array> | null
}

export type FetchLike = (
  url: string,
  init: { headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal },
) => Promise<RawResponse>

export interface HttpClientOptions {
  userAgent: string
  fetchImpl: FetchLike
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
}

async function readBody(res: RawResponse, maxBytes: number, signal: AbortSignal): Promise<string> {
  const declared = Number(res.headers.get('content-length'))
  if (declared > maxBytes) {
    await res.body?.cancel()
    throw new HttpError(`Response is larger than ${maxBytes} bytes`, 'too_large')
  }
  if (!res.body) return ''

  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new HttpError(`Response is larger than ${maxBytes} bytes`, 'too_large')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (signal.aborted) throw new HttpError('Request timed out', 'timeout')
    throw new HttpError(`Network error: ${errorMessage(error)}`, 'network')
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks))
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308])

/**
 * An HTTP client for fetching URLs that users (or feeds) supplied. It follows redirects by hand so
 * every hop is checked, caps the response size and total time, and identifies itself.
 */
export function createHttpClient(options: HttpClientOptions): HttpClient {
  const { userAgent, fetchImpl, timeoutMs = 10_000, maxBytes = 2 * 1024 * 1024 } = options
  const maxRedirects = options.maxRedirects ?? 5

  return {
    async get(url, { headers = {} } = {}) {
      const signal = AbortSignal.timeout(timeoutMs)
      let current = checkUrl(url).href

      for (let hop = 0; hop <= maxRedirects; hop++) {
        let res: RawResponse
        try {
          res = await fetchImpl(current, {
            headers: { 'user-agent': userAgent, ...headers },
            redirect: 'manual',
            signal,
          })
        } catch (error) {
          if (signal.aborted) throw new HttpError('Request timed out', 'timeout')
          if (error instanceof BlockedUrlError) throw error
          // undici wraps errors from the guarded lookup in its own TypeError.
          if (error instanceof Error && error.cause instanceof BlockedUrlError) throw error.cause
          throw new HttpError(`Network error: ${errorMessage(error)}`, 'network')
        }

        const location = res.headers.get('location')
        if (REDIRECT_STATUSES.has(res.status) && location) {
          await res.body?.cancel()
          current = checkUrl(new URL(location, current).href).href
          continue
        }

        const body = res.status === 304 ? '' : await readBody(res, maxBytes, signal)
        return { status: res.status, headers: res.headers, url: current, body }
      }
      throw new HttpError(`More than ${maxRedirects} redirects`, 'too_many_redirects')
    },
  }
}

/** The client used in production: undici with a connection-time private-address guard. */
export function createDefaultHttpClient(userAgent: string): HttpClient {
  // Node's LookupFunction requires an address in every callback, but the guarded lookup calls back
  // with only an error when it blocks or fails, which is what Node does itself.
  const dispatcher = new Agent({ connect: { lookup: createGuardedLookup() as LookupFunction } })
  // undici's Response has everything RawResponse reads. The cast is for the web app's typecheck,
  // which compiles this file with the DOM lib, whose ReadableStream does not match undici's.
  const fetchImpl: FetchLike = (url, init) =>
    undiciFetch(url, { ...init, dispatcher }) as unknown as Promise<RawResponse>
  return createHttpClient({ userAgent, fetchImpl })
}
