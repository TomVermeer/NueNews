import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpClient, HttpResponse } from '../../lib/http'
import { ProviderError } from '../errors'
import type { FetchContext, SourceRef } from '../types'
import { normalizeInput, rssProvider } from './index'

const NOW = new Date('2026-02-01T00:00:00Z')

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

function response(body: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const headers = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v] as const),
  )
  return (url: string): HttpResponse => ({
    status: init.status ?? 200,
    headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
    url,
    body,
  })
}

type Routes = Record<string, ReturnType<typeof response>>

function contextFor(routes: Routes) {
  const get = vi.fn<HttpClient['get']>(async (url) => {
    const route = routes[url]
    if (!route) throw new Error(`Unexpected request: ${url}`)
    return route(url)
  })
  const ctx: FetchContext = { http: { get }, now: () => NOW }
  return { ctx, get }
}

const source = (overrides: Partial<SourceRef> = {}): SourceRef => ({
  id: 's1',
  kind: 'rss',
  key: 'https://news.example.com/feed.xml',
  etag: null,
  lastModified: null,
  ...overrides,
})

describe('normalizeInput', () => {
  it('adds https:// when the scheme is missing', () => {
    expect(normalizeInput('news.example.com/feed.xml')).toBe('https://news.example.com/feed.xml')
  })

  it('keeps full URLs and trims whitespace', () => {
    expect(normalizeInput('  http://example.com/rss  ')).toBe('http://example.com/rss')
  })

  it.each([
    ['https://www.reddit.com/r/programming', 'https://www.reddit.com/r/programming/.rss'],
    ['reddit.com/r/programming/', 'https://reddit.com/r/programming/.rss'],
    [
      'https://www.reddit.com/r/programming/top?t=day',
      'https://www.reddit.com/r/programming/top/.rss?t=day',
    ],
  ])('turns the Reddit page %s into its RSS feed', (input, expected) => {
    expect(normalizeInput(input)).toBe(expected)
  })

  it('leaves existing Reddit feed addresses alone', () => {
    expect(normalizeInput('https://www.reddit.com/r/programming.rss')).toBe(
      'https://www.reddit.com/r/programming.rss',
    )
  })

  it('rejects input that is not an address', () => {
    expect(() => normalizeInput('http://')).toThrow(ProviderError)
  })
})

describe('resolve', () => {
  it('accepts a feed address directly', async () => {
    const { ctx } = contextFor({
      'https://news.example.com/feed.xml': response(fixture('rss2.xml')),
    })
    await expect(rssProvider.resolve('news.example.com/feed.xml', ctx)).resolves.toEqual({
      kind: 'rss',
      key: 'https://news.example.com/feed.xml',
      title: 'Example Tech & Science News',
      siteUrl: 'https://news.example.com/',
    })
  })

  it('finds the feed linked from a web page', async () => {
    const { ctx } = contextFor({
      'https://blog.example.com/': response(fixture('page-with-feed-links.html')),
      'https://blog.example.com/atom.xml': response(fixture('atom.xml')),
    })
    const resolved = await rssProvider.resolve('https://blog.example.com/', ctx)
    expect(resolved).toMatchObject({
      kind: 'rss',
      key: 'https://blog.example.com/atom.xml',
      title: 'Example Channel',
    })
  })

  it('uses the final URL after redirects as the key', async () => {
    const redirected = (_url: string) =>
      response(fixture('rss2.xml'))('https://new.example.com/rss')
    const { ctx } = contextFor({ 'https://old.example.com/rss': redirected })
    const resolved = await rssProvider.resolve('https://old.example.com/rss', ctx)
    expect(resolved.key).toBe('https://new.example.com/rss')
  })

  it('says so when a page has no feed', async () => {
    const { ctx } = contextFor({
      'https://plain.example.com/': response(fixture('page-without-feed.html')),
    })
    await expect(rssProvider.resolve('https://plain.example.com/', ctx)).rejects.toThrow(
      'No RSS or Atom feed found',
    )
  })

  it('reports HTTP errors', async () => {
    const { ctx } = contextFor({ 'https://gone.example.com/feed': response('', { status: 404 }) })
    await expect(rssProvider.resolve('https://gone.example.com/feed', ctx)).rejects.toMatchObject({
      name: 'ProviderError',
      status: 404,
    })
  })

  it('turns a subreddit page into its feed', async () => {
    const { ctx, get } = contextFor({
      'https://www.reddit.com/r/programming/.rss': response(fixture('reddit.rss')),
    })
    const resolved = await rssProvider.resolve('https://www.reddit.com/r/programming', ctx)
    expect(resolved.key).toBe('https://www.reddit.com/r/programming/.rss')
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('fetch', () => {
  let ctx: FetchContext
  let get: ReturnType<typeof contextFor>['get']

  beforeEach(() => {
    ;({ ctx, get } = contextFor({
      'https://news.example.com/feed.xml': response(fixture('rss2.xml'), {
        headers: { etag: '"v2"', 'last-modified': 'Tue, 06 Jan 2026 10:00:00 GMT' },
      }),
    }))
  })

  it('returns items with the cache validators from the response', async () => {
    const result = await rssProvider.fetch(source(), ctx)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.items).toHaveLength(5)
    expect(result).toMatchObject({
      etag: '"v2"',
      lastModified: 'Tue, 06 Jan 2026 10:00:00 GMT',
      title: 'Example Tech & Science News',
    })
  })

  it('sends conditional headers when it has validators', async () => {
    await rssProvider.fetch(
      source({ etag: '"v1"', lastModified: 'Mon, 05 Jan 2026 10:00:00 GMT' }),
      ctx,
    )
    const [, options] = get.mock.calls[0]!
    expect(options?.headers).toMatchObject({
      'if-none-match': '"v1"',
      'if-modified-since': 'Mon, 05 Jan 2026 10:00:00 GMT',
    })
  })

  it('sends no conditional headers for a source that was never fetched', async () => {
    await rssProvider.fetch(source(), ctx)
    const [, options] = get.mock.calls[0]!
    expect(options?.headers).not.toHaveProperty('if-none-match')
    expect(options?.headers).not.toHaveProperty('if-modified-since')
  })

  it('reports not_modified on 304', async () => {
    const { ctx: notModifiedCtx } = contextFor({
      'https://news.example.com/feed.xml': response('', { status: 304 }),
    })
    await expect(rssProvider.fetch(source({ etag: '"v2"' }), notModifiedCtx)).resolves.toEqual({
      status: 'not_modified',
    })
  })

  it('passes Retry-After through on 429', async () => {
    const { ctx: limited } = contextFor({
      'https://news.example.com/feed.xml': response('', {
        status: 429,
        headers: { 'retry-after': '120' },
      }),
    })
    await expect(rssProvider.fetch(source(), limited)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 120,
    })
  })

  it('understands X-Ratelimit-Reset, which some sites (such as Reddit) send instead of Retry-After', async () => {
    const { ctx: limited } = contextFor({
      'https://news.example.com/feed.xml': response('', {
        status: 429,
        headers: { 'x-ratelimit-reset': '47' },
      }),
    })
    await expect(rssProvider.fetch(source(), limited)).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 47,
    })
  })

  it('wraps unreadable feeds in a ProviderError', async () => {
    const { ctx: broken } = contextFor({
      'https://news.example.com/feed.xml': response('<html>not a feed</html>'),
    })
    await expect(rssProvider.fetch(source(), broken)).rejects.toBeInstanceOf(ProviderError)
  })
})
