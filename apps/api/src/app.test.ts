import { describe, expect, it } from 'vitest'
import { app } from './app'

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const res = await app.request('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

describe('GET /api/v1/widget-types', () => {
  it('lists the registered widget types', async () => {
    const res = await app.request('/api/v1/widget-types')
    const body = (await res.json()) as { types: string[] }
    expect(body.types.sort()).toEqual(['feed', 'royalroad', 'weather', 'youtube'])
  })
})

describe('unknown routes', () => {
  it('returns 404', async () => {
    const res = await app.request('/api/v1/nope')
    expect(res.status).toBe(404)
  })
})
