import { describe, expect, it } from 'vitest'
import { users } from './db/schema'
import { createTestApp, errorOf } from './test/helpers'

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const { client } = await createTestApp()
    const res = await client.health.$get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('unknown routes', () => {
  it('return a JSON 404 in the standard error shape', async () => {
    const { send } = await createTestApp()
    const res = await send('GET', '/nope')
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toEqual({
      error: { code: 'not_found', message: 'No such route' },
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
    const { client } = await createTestApp()
    const res = await client['widget-types'].$get()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.types.map((t) => t.type).sort()).toEqual([
      'feed',
      'royalroad',
      'weather',
      'youtube',
    ])
    const feed = body.types.find((t) => t.type === 'feed')
    expect(feed).toMatchObject({ available: true, defaultSize: { w: 4, h: 6 } })
    expect(feed?.configSchema).toHaveProperty('properties.sources')
    const royalroad = body.types.find((t) => t.type === 'royalroad')
    expect(royalroad).toBeDefined()
    expect(royalroad?.available).toBe(false)
  })
})

describe('authentication', () => {
  const signedOut = { authenticate: async () => undefined }

  it('answers 401 in the standard error shape when nobody is signed in', async () => {
    const { client, send } = await createTestApp({}, signedOut)
    const expectUnauthorized = async (res: { status: number; json(): Promise<unknown> }) => {
      expect(res.status).toBe(401)
      expect(await errorOf(res)).toEqual({
        error: { code: 'unauthorized', message: 'Sign in to continue' },
      })
    }
    await expectUnauthorized(await client.dashboards.$get())
    await expectUnauthorized(await client.dashboards.$post({ json: { name: 'Home' } }))
    await expectUnauthorized(await client.widgets[':id'].data.$get({ param: { id: 'anything' } }))
    // Unknown paths do not reveal which routes exist.
    await expectUnauthorized(await send('GET', '/nope'))
  })

  it('keeps /health public, so a host can check that the API is up', async () => {
    const { client } = await createTestApp({}, signedOut)
    const res = await client.health.$get()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
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
    const as = (user: string) => ({ headers: { 'x-user': user } })
    const dashboard = t.client.dashboards[':id']

    const created = await t.client.dashboards.$post({ json: { name: 'Alice home' } }, as('alice'))
    const { id } = await created.json()

    const bobList = await (await t.client.dashboards.$get({}, as('bob'))).json()
    expect(bobList).toEqual({ dashboards: [] })
    expect((await dashboard.$get({ param: { id } }, as('bob'))).status).toBe(404)
    expect((await dashboard.$delete({ param: { id } }, as('bob'))).status).toBe(404)
    expect((await dashboard.$get({ param: { id } }, as('alice'))).status).toBe(200)
  })
})
