import type { HttpResponse } from '../../lib/http'
import { assertOk, ProviderError } from '../errors'
import type { FetchContext, FetchResult, Provider, ResolvedSource, SourceRef } from '../types'
import { findFeedLinks } from './discover'
import { readFeed, tryReadFeed } from './parse'

const ACCEPT =
  'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5'

/** Accepts "example.com/feed", full URLs and plain subreddit pages (which become their RSS feed). */
export function normalizeInput(input: string): string {
  const trimmed = input.trim()
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    throw new ProviderError('Enter a valid web address')
  }

  const isReddit = /(^|\.)reddit\.com$/i.test(url.hostname)
  if (isReddit && !/\.(rss|json)$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/.rss`
  }
  return url.href
}

export async function download(
  url: string,
  ctx: FetchContext,
  headers: Record<string, string> = {},
): Promise<HttpResponse> {
  const res = await ctx.http.get(url, { headers: { accept: ACCEPT, ...headers } })
  if (res.status === 304) return res
  assertOk(res, { service: 'The site', retryAfterHeaders: ['retry-after', 'x-ratelimit-reset'] })
  return res
}

/** Downloads and parses a feed, sending conditional headers when the source has validators. */
export async function fetchFeed(
  url: string,
  source: SourceRef,
  ctx: FetchContext,
): Promise<FetchResult> {
  const conditional: Record<string, string> = {}
  if (source.etag) conditional['if-none-match'] = source.etag
  if (source.lastModified) conditional['if-modified-since'] = source.lastModified

  const res = await download(url, ctx, conditional)
  if (res.status === 304) return { status: 'not_modified' }

  const feed = readFeed(res, ctx.now())

  return {
    status: 'ok',
    items: feed.items,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
    title: feed.title,
    siteUrl: feed.siteUrl,
  }
}

export const rssProvider: Provider = {
  kind: 'rss',

  async resolve(input, ctx): Promise<ResolvedSource> {
    const address = normalizeInput(input)
    const res = await download(address, ctx)

    const feed = tryReadFeed(res, ctx.now())
    if (feed) return { kind: 'rss', key: res.url, title: feed.title, siteUrl: feed.siteUrl }

    // Not a feed: maybe a web page that links to one.
    const [candidate] = findFeedLinks(res.body, res.url)
    if (!candidate) throw new ProviderError('No RSS or Atom feed found at this address')

    const feedRes = await download(candidate, ctx)
    const linked = readFeed(feedRes, ctx.now(), 'The feed linked from this page could not be read')
    return {
      kind: 'rss',
      key: feedRes.url,
      title: linked.title,
      siteUrl: linked.siteUrl ?? res.url,
    }
  },

  fetch: (source, ctx) => fetchFeed(source.key, source, ctx),
}
