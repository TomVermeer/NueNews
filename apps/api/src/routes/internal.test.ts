import { describe, expect, it, vi } from 'vitest'
import { createTestApp } from '../test/helpers'

const SECRET = 'a-long-random-cron-secret'

async function setup(tick = vi.fn(async () => 3)) {
  const t = await createTestApp({}, { cron: { secret: SECRET, tick } })
  const post = (headers: Record<string, string> = {}) =>
    t.app.request('/internal/tick', { method: 'POST', headers })
  return { ...t, post, tick }
}

describe('POST /internal/tick', () => {
  it('refreshes due sources for a caller with the secret, and says how many', async () => {
    const { post, tick } = await setup()
    const res = await post({ authorization: `Bearer ${SECRET}` })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ refreshed: 3 })
    expect(tick).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['no header', {}],
    ['the wrong secret', { authorization: 'Bearer nope' }],
    ['a secret that only starts the same', { authorization: `Bearer ${SECRET}x` }],
    ['another scheme', { authorization: `Basic ${SECRET}` }],
    ['an empty token', { authorization: 'Bearer ' }],
  ])('refuses %s, without running anything', async (_name, headers) => {
    const { post, tick } = await setup()
    const res = await post(headers)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({
      error: { code: 'unauthorized', message: 'Missing or wrong secret' },
    })
    expect(tick).not.toHaveBeenCalled()
  })

  it('does not accept a signed-in user session in place of the secret', async () => {
    // The test app signs everyone in, which still must not open the machine endpoint.
    const { post, tick } = await setup()
    expect((await post()).status).toBe(401)
    expect(tick).not.toHaveBeenCalled()
  })

  it('does not exist unless a secret is configured', async () => {
    const { app } = await createTestApp()
    const res = await app.request('/internal/tick', {
      method: 'POST',
      headers: { authorization: `Bearer ${SECRET}` },
    })
    expect(res.status).toBe(404)
  })

  it('only answers POST', async () => {
    const { app } = await setup()
    const res = await app.request('/internal/tick', {
      headers: { authorization: `Bearer ${SECRET}` },
    })
    expect(res.status).toBe(404)
  })
})
