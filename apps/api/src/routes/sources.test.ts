import { describe, expect, it } from 'vitest'
import { ProviderError } from '../providers/errors'
import { createTestApp, errorOf, type TestApp } from '../test/helpers'

const resolve = (t: TestApp, kind: 'rss' | 'youtube' | 'royalroad', input: string) =>
  t.client.sources.resolve.$post({ json: { kind, input } })

describe('POST /sources/resolve', () => {
  it('returns the canonical source for what the user typed', async () => {
    const t = await createTestApp({
      resolve: async (input) => ({
        kind: 'rss',
        key: `https://${input}/feed.xml`,
        title: 'Example',
      }),
    })
    const res = await resolve(t, 'rss', 'example.com')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      kind: 'rss',
      key: 'https://example.com/feed.xml',
      title: 'Example',
    })
  })

  it('reports problems with the address as a 422 the user can act on', async () => {
    const t = await createTestApp({
      resolve: async () => {
        throw new ProviderError('No RSS or Atom feed found at this address')
      },
    })
    const res = await resolve(t, 'rss', 'example.com')
    expect(res.status).toBe(422)
    expect((await errorOf(res)).error).toEqual({
      code: 'source_error',
      message: 'No RSS or Atom feed found at this address',
    })
  })

  it('says when a kind has no provider yet', async () => {
    const t = await createTestApp()
    const res = await resolve(t, 'royalroad', '12345')
    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('source_kind_unavailable')
  })

  it('validates the request', async () => {
    const t = await createTestApp()
    expect((await t.send('POST', '/sources/resolve', { kind: 'rss' })).status).toBe(400)
    expect((await t.send('POST', '/sources/resolve', { kind: 'nope', input: 'x' })).status).toBe(
      400,
    )
    expect((await resolve(t, 'rss', '  ')).status).toBe(400)
  })
})
