import { hc } from 'hono/client'
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

interface ResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

/** Resolves with the parsed JSON body, or throws an ApiRequestError for non-2xx answers. */
export async function unwrap<T>(request: Promise<ResponseLike>): Promise<T> {
  let res: ResponseLike
  try {
    res = await request
  } catch {
    throw new ApiRequestError(0, 'network', 'Could not reach the server')
  }

  if (res.ok) {
    return (res.status === 204 ? undefined : await res.json()) as T
  }

  let code = 'error'
  let message = `The server answered with ${res.status}`
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string } }
    code = body.error?.code ?? code
    message = body.error?.message ?? message
  } catch {
    // keep the generic message
  }
  throw new ApiRequestError(res.status, code, message)
}
