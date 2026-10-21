import { describe, expect, it } from 'vitest'
import { users } from './db/schema'
import { createTestApp } from './test/helpers'

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const { call } = await createTestApp()
    expect(await call('GET', '/health')).toEqual({ status: 200, body: { status: 'ok' } })
  })
})

describe('unknown routes', () => {
  it('return a JSON 404 in the standard error shape', async () => {
    const { call } = await createTestApp()
    expect(await call('GET', '/nope')).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'No such route' } },
    })
  })
})

describe('invalid JSON bodies', () => {
  it('are rejected with a 400, not a 500', async () => {
    const { app } = await createTestApp()
    const res = await app.request('/api/v1/dashboards', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(res.status).toBe(400)
  })
})

describe('GET /api/v1/widget-types', () => {
  it('lists every widget type with its JSON Schema and availability', async () => {
    const { call } = await createTestApp()
    const { status, body } = await call('GET', '/widget-types')
    expect(status).toBe(200)
    expect(body.types.map((t: { type: string }) => t.type).sort()).toEqual([
      'feed',
      'royalroad',
      'weather',
      'youtube',
    ])
    const feed = body.types.find((t: { type: string }) => t.type === 'feed')
    expect(feed).toMatchObject({ available: true, defaultSize: { w: 4, h: 6 } })
    expect(feed.configSchema.properties).toHaveProperty('sources')
    expect(body.types.find((t: { type: string }) => t.type === 'royalroad').available).toBe(false)
  })
})

describe('authentication', () => {
  const signedOut = { authenticate: async () => undefined }

  it('answers 401 in the standard error shape when nobody is signed in', async () => {
    const { call } = await createTestApp({}, signedOut)
    const expected = {
      status: 401,
      body: { error: { code: 'unauthorized', message: 'Sign in to continue' } },
    }
    expect(await call('GET', '/dashboards')).toEqual(expected)
    expect(await call('POST', '/dashboards', { name: 'Home' })).toEqual(expected)
    expect(await call('GET', '/widgets/anything/data')).toEqual(expected)
    // Unknown paths do not reveal which routes exist.
    expect(await call('GET', '/nope')).toEqual(expected)
  })

  it('keeps /health public, so a host can check that the API is up', async () => {
    const { call } = await createTestApp({}, signedOut)
    expect(await call('GET', '/health')).toEqual({ status: 200, body: { status: 'ok' } })
  })

  it('serves each signed-in user only their own data', async () => {
    const t = await createTestApp(
      {},
      {
        authenticate: async (headers) =>
          headers.has('x-user') ? { id: headers.get('x-user')! } : undefined,
      },
    )
    await t.db.insert(users).values([
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ])
    const as = (user: string, method: string, path: string, body?: unknown) =>
      t.app.request(`/api/v1${path}`, {
        method,
        headers: { 'x-user': user, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })

    const created = await as('alice', 'POST', '/dashboards', { name: 'Alice home' })
    const { id } = (await created.json()) as { id: string }

    const bobList = await (await as('bob', 'GET', '/dashboards')).json()
    expect(bobList).toEqual({ dashboards: [] })
    expect((await as('bob', 'GET', `/dashboards/${id}`)).status).toBe(404)
    expect((await as('bob', 'DELETE', `/dashboards/${id}`)).status).toBe(404)
    expect((await as('alice', 'GET', `/dashboards/${id}`)).status).toBe(200)
  })
})
