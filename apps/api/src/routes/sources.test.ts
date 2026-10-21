import { describe, expect, it } from 'vitest'
import { ProviderError } from '../providers/errors'
import { createTestApp } from '../test/helpers'

describe('POST /sources/resolve', () => {
  it('returns the canonical source for what the user typed', async () => {
    const t = await createTestApp({
      resolve: async (input) => ({
        kind: 'rss',
        key: `https://${input}/feed.xml`,
        title: 'Example',
      }),
    })
    const res = await t.call('POST', '/sources/resolve', { kind: 'rss', input: 'example.com' })
    expect(res).toEqual({
      status: 200,
      body: { kind: 'rss', key: 'https://example.com/feed.xml', title: 'Example' },
    })
  })

  it('reports problems with the address as a 422 the user can act on', async () => {
    const t = await createTestApp({
      resolve: async () => {
        throw new ProviderError('No RSS or Atom feed found at this address')
      },
    })
    const res = await t.call('POST', '/sources/resolve', { kind: 'rss', input: 'example.com' })
    expect(res.status).toBe(422)
    expect(res.body.error).toEqual({
      code: 'source_error',
      message: 'No RSS or Atom feed found at this address',
    })
  })

  it('says when a kind has no provider yet', async () => {
    const t = await createTestApp()
    const res = await t.call('POST', '/sources/resolve', { kind: 'royalroad', input: '12345' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('source_kind_unavailable')
  })

  it('validates the request', async () => {
    const t = await createTestApp()
    expect((await t.call('POST', '/sources/resolve', { kind: 'rss' })).status).toBe(400)
    expect((await t.call('POST', '/sources/resolve', { kind: 'nope', input: 'x' })).status).toBe(
      400,
    )
    expect((await t.call('POST', '/sources/resolve', { kind: 'rss', input: '  ' })).status).toBe(
      400,
    )
  })
})
