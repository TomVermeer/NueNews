import { parseRetryAfter, ProviderError } from '../errors'
import type { FetchContext, FetchResult, Provider, ResolvedSource, SourceRef } from '../types'
import { findFeedLinks } from './discover'
import { FeedParseError, parseFeed } from './parse'

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
) {
  const res = await ctx.http.get(url, { headers: { accept: ACCEPT, ...headers } })
  if (res.status === 304) return res
  if (res.status < 200 || res.status >= 300) {
    throw new ProviderError(`The site answered with HTTP ${res.status}`, {
      status: res.status,
      retryAfterSeconds: parseRetryAfter(
        res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset'),
      ),
    })
  }
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

  let feed
  try {
    feed = parseFeed(res.body, res.url, ctx.now())
  } catch (error) {
    if (error instanceof FeedParseError) throw new ProviderError(error.message)
    throw error
  }

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

    try {
      const feed = parseFeed(res.body, res.url, ctx.now())
      return { kind: 'rss', key: res.url, title: feed.title, siteUrl: feed.siteUrl }
    } catch (error) {
      if (!(error instanceof FeedParseError)) throw error
    }

    // Not a feed: maybe a web page that links to one.
    const [candidate] = findFeedLinks(res.body, res.url)
    if (!candidate) throw new ProviderError('No RSS or Atom feed found at this address')

    const feedRes = await download(candidate, ctx)
    try {
      const feed = parseFeed(feedRes.body, feedRes.url, ctx.now())
      return { kind: 'rss', key: feedRes.url, title: feed.title, siteUrl: feed.siteUrl ?? res.url }
    } catch (error) {
      if (error instanceof FeedParseError) {
        throw new ProviderError('The feed linked from this page could not be read')
      }
      throw error
    }
  },

  fetch: (source, ctx) => fetchFeed(source.key, source, ctx),
}
