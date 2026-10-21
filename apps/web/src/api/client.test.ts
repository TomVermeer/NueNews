import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './client'

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
