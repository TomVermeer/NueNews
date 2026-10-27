import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { api, ApiRequestError, unwrap } from './client'
import type { DashboardSummary } from './types'

const hoisted = vi.hoisted(() => ({
  client: null as null | { auth: { signOut: ReturnType<typeof vi.fn> } },
  token: undefined as string | undefined,
}))
vi.mock('../auth/client', () => ({
  get authClient() {
    return hoisted.client
  },
  accessToken: async () => hoisted.token,
}))

const fetchMock = vi.fn()

beforeEach(() => {
  hoisted.client = null
  hoisted.token = undefined
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => new Response('{"dashboards":[]}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

const sentHeaders = () => new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers)

describe('api client', () => {
  it('sends the session token with every request', async () => {
    hoisted.token = 'abc'
    await api.dashboards.$get()
    expect(sentHeaders().get('authorization')).toBe('Bearer abc')
  })

  it('sends no Authorization header when nobody is signed in', async () => {
    await api.dashboards.$get()
    expect(sentHeaders().has('authorization')).toBe(false)
  })

  it('signs out when the server no longer accepts the session', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    hoisted.client = { auth: { signOut } }
    fetchMock.mockImplementation(async () => new Response('{}', { status: 401 }))

    const response = await api.dashboards.$get()
    expect(response.status).toBe(401)
    expect(signOut).toHaveBeenCalledTimes(1)
  })

  it('leaves other errors alone', async () => {
    const signOut = vi.fn(async () => ({ error: null }))
    hoisted.client = { auth: { signOut } }
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }))

    await api.dashboards.$get()
    expect(signOut).not.toHaveBeenCalled()
  })
})

describe('unwrap', () => {
  const answer = (body: string | null, status: number) =>
    fetchMock.mockImplementation(async () => new Response(body, { status }))

  it('resolves with the JSON body, typed from the route', async () => {
    const result = unwrap(api.dashboards.$get())
    expectTypeOf(result).resolves.toEqualTypeOf<{ dashboards: DashboardSummary[] }>()
    expect(await result).toEqual({ dashboards: [] })
  })

  it('resolves with nothing for 204 No Content', async () => {
    answer(null, 204)
    expect(await unwrap(api.dashboards[':id'].$delete({ param: { id: 'd1' } }))).toBeUndefined()
  })

  it("throws the API's error code and message", async () => {
    answer('{"error":{"code":"not_found","message":"Dashboard not found"}}', 404)
    await expect(unwrap(api.dashboards[':id'].$get({ param: { id: 'x' } }))).rejects.toEqual(
      new ApiRequestError(404, 'not_found', 'Dashboard not found'),
    )
  })

  it('falls back to a generic error when the body is not the standard shape', async () => {
    answer('<html>Bad gateway</html>', 502)
    await expect(unwrap(api.dashboards.$get())).rejects.toMatchObject({
      status: 502,
      code: 'error',
      message: 'The server answered with 502',
    })
    answer('{"error":"oops"}', 500)
    await expect(unwrap(api.dashboards.$get())).rejects.toMatchObject({ code: 'error' })
  })

  it('reports a network failure', async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError('Failed to fetch')
    })
    await expect(unwrap(api.dashboards.$get())).rejects.toMatchObject({
      status: 0,
      code: 'network',
    })
  })
})
