import { describe, expect, it } from 'vitest'
import { createRegistry, UnknownProviderError } from './registry'
import type { Provider } from './types'

function fakeProvider(kind: Provider['kind']): Provider {
  return {
    kind,
    resolve: async (input) => ({ kind, key: input }),
    fetch: async () => ({ status: 'not_modified' }),
  }
}

describe('createRegistry', () => {
  it('returns the provider registered for a kind', () => {
    const rss = fakeProvider('rss')
    const registry = createRegistry([rss, fakeProvider('youtube')])
    expect(registry.get('rss')).toBe(rss)
    expect(registry.kinds().sort()).toEqual(['rss', 'youtube'])
  })

  it('throws a clear error for an unregistered kind', () => {
    const registry = createRegistry([fakeProvider('rss')])
    expect(() => registry.get('royalroad')).toThrow(UnknownProviderError)
  })

  it('rejects two providers for the same kind', () => {
    expect(() => createRegistry([fakeProvider('rss'), fakeProvider('rss')])).toThrow(/Duplicate/)
  })
})
