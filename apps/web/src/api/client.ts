import { type ClientResponse, hc } from 'hono/client'
import type { SuccessStatusCode } from 'hono/utils/http-status'
import type { AppType } from '@nuenews/api'
import { accessToken, authClient } from '../auth/client'

// Every request carries the session token. A 401 means the session is gone (expired or revoked),
// so sign out, which sends the user to the login page.
export const api = hc<AppType>('/', {
  headers: async (): Promise<Record<string, string>> => {
    const token = await accessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  },
  fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await globalThis.fetch(input, init)
    if (response.status === 401 && authClient) void authClient.auth.signOut()
    return response
  },
}).api.v1

/** An error answer from the API, in the API's standard `{ error: { code, message } }` shape. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ApiRequestError'
  }
}

/** The body type of the 2xx answers a typed client call can give. */
type SuccessBody<R> =
  R extends ClientResponse<infer Body, infer Status>
    ? Status extends SuccessStatusCode
      ? Body
      : never
    : never

/** The `code` and `message` of a body in the API's error shape, if it has that shape. */
function errorFields(body: unknown): { code?: string; message?: string } {
  if (typeof body !== 'object' || body === null || !('error' in body)) return {}
  const { error } = body
  if (typeof error !== 'object' || error === null) return {}
  return {
    code: 'code' in error && typeof error.code === 'string' ? error.code : undefined,
    message: 'message' in error && typeof error.message === 'string' ? error.message : undefined,
  }
}

/** Resolves with the parsed JSON body, or throws an ApiRequestError for non-2xx answers. */
export async function unwrap<R extends ClientResponse<unknown>>(
  request: Promise<R>,
): Promise<SuccessBody<R>> {
  let response: R
  try {
    response = await request
  } catch {
    throw new ApiRequestError(0, 'network', 'Could not reach the server')
  }

  if (response.ok) {
    // `ok` means a 2xx status, but TypeScript cannot narrow the response union on it.
    return (response.status === 204 ? undefined : await response.json()) as SuccessBody<R>
  }

  let fields: { code?: string; message?: string } = {}
  try {
    fields = errorFields(await response.json())
  } catch {
    // Not JSON: keep the generic message.
  }
  throw new ApiRequestError(
    response.status,
    fields.code ?? 'error',
    fields.message ?? `The server answered with ${response.status}`,
  )
}
