import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient, HttpResponse } from '../../lib/http'
import { ProviderError } from '../errors'
import type { FetchContext } from '../types'
import {
  channelIdFromInput,
  channelIdFromPage,
  feedUrlFor,
  pageUrlFromInput,
  youtubeProvider,
} from './index'

const ID = 'UCsBjURrPoezykLs9EqgamOA'
const NOW = new Date('2026-11-01T00:00:00Z')

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')

type Route = { body: string; status?: number; finalUrl?: string; headers?: Record<string, string> }

function contextFor(routes: Record<string, Route>) {
  const get = vi.fn<HttpClient['get']>(async (url): Promise<HttpResponse> => {
    const route = routes[url]
    if (!route) throw new Error(`Unexpected request: ${url}`)
    const headers = new Map(Object.entries(route.headers ?? {}))
    return {
      status: route.status ?? 200,
      headers: { get: (name) => headers.get(name.toLowerCase()) ?? null },
      url: route.finalUrl ?? url,
      body: route.body,
    }
  })
  const ctx: FetchContext = { http: { get }, now: () => NOW }
  return { ctx, get }
}

describe('channelIdFromInput', () => {
  it.each([
    [ID, ID],
    [`  ${ID}  `, ID],
    [`https://www.youtube.com/channel/${ID}`, ID],
    [`youtube.com/channel/${ID}/videos`, ID],
    [`https://m.youtube.com/channel/${ID}?si=abc`, ID],
  ])('finds the id in %s', (input, expected) => {
    expect(channelIdFromInput(input)).toBe(expected)
  })

  it.each([
    '@somechannel',
    'https://www.youtube.com/@somechannel',
    'https://example.com/channel/' + ID,
    'UC-too-short',
    '',
  ])('finds nothing in %s', (input) => {
    expect(channelIdFromInput(input)).toBeUndefined()
  })
})

describe('pageUrlFromInput', () => {
  it.each([
    ['@Fireship', 'https://www.youtube.com/@Fireship'],
    ['https://www.youtube.com/@Fireship/videos', 'https://www.youtube.com/@Fireship'],
    ['youtube.com/@some.channel-1', 'https://www.youtube.com/@some.channel-1'],
    ['https://www.youtube.com/c/SomeName', 'https://www.youtube.com/c/SomeName'],
    ['https://www.youtube.com/user/oldname/featured', 'https://www.youtube.com/user/oldname'],
  ])('maps %s to its channel page', (input, expected) => {
    expect(pageUrlFromInput(input)).toBe(expected)
  })

  it.each([
    'https://evil.example/@Fireship',
    'https://www.youtube.com/watch?v=abc',
    'just some words',
    '@',
    '@bad handle',
  ])('does not accept %s', (input) => {
    expect(pageUrlFromInput(input)).toBeUndefined()
  })
})

describe('channelIdFromPage', () => {
  it("uses the page's own canonical link, not the related channels mentioned in it", () => {
    expect(channelIdFromPage(fixture('handle-page.html'))).toBe(ID)
  })

  it('falls back to the identifier meta tag', () => {
    const html = `<meta itemprop="identifier" content="${ID}">`
    expect(channelIdFromPage(html)).toBe(ID)
  })

  it('finds nothing in a page without channel markers', () => {
    expect(channelIdFromPage(fixture('page-without-channel.html'))).toBeUndefined()
  })
})

describe('resolve', () => {
  it('accepts a channel id and reads the channel name from its feed', async () => {
    const { ctx, get } = contextFor({ [feedUrlFor(ID)]: { body: fixture('channel-feed.xml') } })
    await expect(youtubeProvider.resolve(ID, ctx)).resolves.toEqual({
      kind: 'youtube',
      key: ID,
      title: 'Example Dev Channel',
      siteUrl: `https://www.youtube.com/channel/${ID}`,
    })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('looks up the channel id of an @handle', async () => {
    const { ctx, get } = contextFor({
      'https://www.youtube.com/@Example': { body: fixture('handle-page.html') },
      [feedUrlFor(ID)]: { body: fixture('channel-feed.xml') },
    })
    const resolved = await youtubeProvider.resolve('@Example', ctx)
    expect(resolved.key).toBe(ID)
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('explains the cookie consent wall instead of failing mysteriously', async () => {
    const { ctx } = contextFor({
      'https://www.youtube.com/@Example': {
        body: '<html>consent</html>',
        finalUrl: 'https://consent.youtube.com/m?continue=...',
      },
    })
    await expect(youtubeProvider.resolve('@Example', ctx)).rejects.toThrow(/cookie consent/)
  })

  it('reports a handle that has no channel', async () => {
    const { ctx } = contextFor({
      'https://www.youtube.com/@Nobody': { body: fixture('page-without-channel.html') },
    })
    await expect(youtubeProvider.resolve('@Nobody', ctx)).rejects.toThrow(
      'No YouTube channel found',
    )
  })

  it('rejects input that is not a channel reference', async () => {
    const { ctx, get } = contextFor({})
    await expect(youtubeProvider.resolve('https://example.com/video', ctx)).rejects.toBeInstanceOf(
      ProviderError,
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('says so when YouTube has no feed for the id', async () => {
    const { ctx } = contextFor({ [feedUrlFor(ID)]: { body: '<html>nope</html>' } })
    await expect(youtubeProvider.resolve(ID, ctx)).rejects.toThrow('did not return a feed')
  })

  it('passes HTTP errors on', async () => {
    const { ctx } = contextFor({ [feedUrlFor(ID)]: { body: '', status: 404 } })
    await expect(youtubeProvider.resolve(ID, ctx)).rejects.toMatchObject({ status: 404 })
  })
})

describe('fetch', () => {
  const source = (overrides = {}) => ({
    id: 's1',
    kind: 'youtube' as const,
    key: ID,
    etag: null,
    lastModified: null,
    ...overrides,
  })

  it('turns the channel feed into video items', async () => {
    const { ctx } = contextFor({
      [feedUrlFor(ID)]: { body: fixture('channel-feed.xml'), headers: { etag: '"yt1"' } },
    })
    const result = await youtubeProvider.fetch(source(), ctx)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    expect(result.etag).toBe('"yt1"')
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      externalId: 'yt:video:abc123DEF45',
      title: 'The runtime wars are over',
      url: 'https://www.youtube.com/watch?v=abc123DEF45',
      author: 'Example Dev Channel',
      imageUrl: 'https://i1.ytimg.com/vi/abc123DEF45/hqdefault.jpg',
      excerpt: 'Every JavaScript runtime compared. Second line of the description.',
    })
    expect(result.items[0]?.publishedAt).toEqual(new Date('2026-10-15T17:35:15Z'))
  })

  it('handles videos without a description', async () => {
    const { ctx } = contextFor({ [feedUrlFor(ID)]: { body: fixture('channel-feed.xml') } })
    const result = await youtubeProvider.fetch(source(), ctx)
    if (result.status !== 'ok') throw new Error('expected items')
    expect(result.items[1]?.excerpt).toBeUndefined()
  })

  it('sends conditional headers and understands 304', async () => {
    const { ctx, get } = contextFor({ [feedUrlFor(ID)]: { body: '', status: 304 } })
    const result = await youtubeProvider.fetch(source({ etag: '"yt0"' }), ctx)
    expect(result).toEqual({ status: 'not_modified' })
    expect(get.mock.calls[0]![1]?.headers).toMatchObject({ 'if-none-match': '"yt0"' })
  })
})
