import { ProviderError } from '../errors'
import { download, fetchFeed } from '../rss'
import { FeedParseError, parseFeed } from '../rss/parse'
import type { FetchContext, Provider, ResolvedSource } from '../types'

const CHANNEL_ID = /^UC[\w-]{22}$/
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const HANDLE = /^[\w.-]{1,100}$/

export const feedUrlFor = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`

export const channelUrlFor = (channelId: string) => `https://www.youtube.com/channel/${channelId}`

function parseUrl(input: string): URL | undefined {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `https://${input}`)
  } catch {
    return undefined
  }
}

/**
 * The channel id, when the input contains it directly: a bare id or a /channel/UC... address.
 * No network needed, so this is also how stored widget configs are turned into sources.
 */
export function channelIdFromInput(input: string): string | undefined {
  const text = input.trim()
  if (CHANNEL_ID.test(text)) return text

  const url = parseUrl(text)
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return undefined
  const match = url.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/|$)/)
  return match?.[1]
}

/** The page to look at to find the channel id of an @handle, /c/ or /user/ address. */
export function pageUrlFromInput(input: string): string | undefined {
  const text = input.trim()
  if (text.startsWith('@') && HANDLE.test(text.slice(1))) {
    return `https://www.youtube.com/${text}`
  }

  const url = parseUrl(text)
  if (!url || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return undefined
  const match = url.pathname.match(/^\/(@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+)\/?(?:$|\/)/)
  return match ? `https://www.youtube.com/${match[1]}` : undefined
}

/**
 * Reads the channel id from a channel page. The canonical link and the identifier meta tag
 * describe this channel; other "channelId" values in the page belong to related channels.
 */
export function channelIdFromPage(html: string): string | undefined {
  const canonical = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']https?:\/\/(?:www\.)?youtube\.com\/channel\/(UC[\w-]{22})["']/i,
  )
  if (canonical?.[1]) return canonical[1]

  const meta = html.match(
    /<meta[^>]*itemprop=["']identifier["'][^>]*content=["'](UC[\w-]{22})["']/i,
  )
  return meta?.[1]
}

/** The channel avatar the page advertises for sharing (og:image); only https URLs are kept. */
export function iconFromPage(html: string): string | undefined {
  const tags = html.match(/<meta[^>]*>/gi) ?? []
  const tag = tags.find((candidate) => /property=["']og:image["']/i.test(candidate))
  const content = tag?.match(/content=["']([^"']+)["']/i)?.[1]
  if (!content) return undefined
  try {
    const url = new URL(content)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export const youtubeProvider: Provider = {
  kind: 'youtube',

  async resolve(input: string, ctx: FetchContext): Promise<ResolvedSource> {
    let channelId = channelIdFromInput(input)

    if (!channelId) {
      const pageUrl = pageUrlFromInput(input)
      if (!pageUrl) {
        throw new ProviderError('Enter a YouTube channel address, an @handle or a channel ID')
      }

      const page = await download(pageUrl, ctx)
      if (new URL(page.url).hostname.startsWith('consent.')) {
        throw new ProviderError(
          'YouTube asked for cookie consent, so that handle could not be looked up. Paste the channel address that contains /channel/UC… instead.',
        )
      }
      channelId = channelIdFromPage(page.body)
      if (!channelId) throw new ProviderError('No YouTube channel found at this address')
    }

    const res = await download(feedUrlFor(channelId), ctx)
    try {
      const feed = parseFeed(res.body, res.url, ctx.now())
      return {
        kind: 'youtube',
        key: channelId,
        title: feed.title,
        siteUrl: channelUrlFor(channelId),
      }
    } catch (error) {
      if (error instanceof FeedParseError) {
        throw new ProviderError('YouTube did not return a feed for this channel')
      }
      throw error
    }
  },

  fetch: (source, ctx) => fetchFeed(feedUrlFor(source.key), source, ctx),

  async fetchIcon(source, ctx) {
    const page = await download(channelUrlFor(source.key), ctx)
    if (new URL(page.url).hostname.startsWith('consent.')) return undefined
    return iconFromPage(page.body)
  },
}
