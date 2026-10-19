import { describe, expect, it } from 'vitest'
import { createTestApp } from './test/helpers'

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const { call } = createTestApp()
    expect(await call('GET', '/health')).toEqual({ status: 200, body: { status: 'ok' } })
  })
})

describe('unknown routes', () => {
  it('return a JSON 404 in the standard error shape', async () => {
    const { call } = createTestApp()
    expect(await call('GET', '/nope')).toEqual({
      status: 404,
      body: { error: { code: 'not_found', message: 'No such route' } },
    })
  })
})

describe('invalid JSON bodies', () => {
  it('are rejected with a 400, not a 500', async () => {
    const { app } = createTestApp()
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
    const { call } = createTestApp()
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
    expect(body.types.find((t: { type: string }) => t.type === 'youtube').available).toBe(false)
  })
})
