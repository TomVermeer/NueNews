import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FeedParseError, parseFeed } from './parse'

const NOW = new Date('2026-02-01T00:00:00Z')

function fixture(name: string): string {
  return readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')
}

describe('RSS 2.0', () => {
  const feed = parseFeed(fixture('rss2.xml'), 'https://news.example.com/feed.xml', NOW)

  it('reads the channel title and site URL', () => {
    expect(feed.title).toBe('Example Tech & Science News')
    expect(feed.siteUrl).toBe('https://news.example.com/')
  })

  it('drops items that have no usable link', () => {
    expect(feed.items.map((i) => i.title)).not.toContain('Item with no link and no guid')
    expect(feed.items).toHaveLength(5)
  })

  it('normalizes a complete item', () => {
    expect(feed.items[0]).toMatchObject({
      externalId: 'article-1001',
      title: 'Chip makers announce new 2nm roadmap',
      url: 'https://news.example.com/articles/2nm-roadmap',
      author: 'Jane Doe',
      imageUrl: 'https://cdn.example.com/img/2nm.jpg',
    })
    expect(feed.items[0]?.publishedAt).toEqual(new Date('2026-01-06T09:30:00Z'))
  })

  it('turns the description into a plain-text excerpt of at most 200 characters', () => {
    const excerpt = feed.items[0]?.excerpt ?? ''
    expect(excerpt.startsWith('The company said production would begin next year')).toBe(true)
    expect(excerpt.length).toBeLessThanOrEqual(200)
    expect(excerpt).not.toMatch(/[<>]/)
  })

  it('resolves relative links and images against the feed URL', () => {
    expect(feed.items[1]).toMatchObject({
      url: 'https://news.example.com/articles/fish-and-chips',
      imageUrl: 'https://news.example.com/images/chips.jpg',
      externalId: 'https://news.example.com/articles/fish-and-chips',
    })
  })

  it('decodes double-encoded entities in titles once', () => {
    expect(feed.items[1]?.title).toBe('Fish & chips: a data story')
  })

  it('uses a permalink guid as the URL when there is no link', () => {
    expect(feed.items[2]).toMatchObject({
      url: 'https://news.example.com/articles/guid-only',
      externalId: 'https://news.example.com/articles/guid-only',
    })
  })

  it('reads media:thumbnail', () => {
    expect(feed.items[3]?.imageUrl).toBe('https://cdn.example.com/img/thumb.png')
  })

  it('strips scripts and styles from excerpts, and uses the fetch time when a date is missing', () => {
    expect(feed.items[4]?.excerpt).toBe('Safe & readable text')
    expect(feed.items[4]?.publishedAt).toEqual(NOW)
  })
})

describe('Atom', () => {
  const feed = parseFeed(fixture('atom.xml'), 'https://videos.example.com/feeds/channel.xml', NOW)

  it('reads the feed title and the alternate link', () => {
    expect(feed.title).toBe('Example Channel')
    expect(feed.siteUrl).toBe('https://videos.example.com/channel/abc')
  })

  it('skips entries whose only link is not http(s)', () => {
    expect(feed.items).toHaveLength(2)
  })

  it('prefers the alternate link and reads media:group metadata', () => {
    expect(feed.items[0]).toMatchObject({
      externalId: 'video:xyz123',
      title: 'Building a dashboard in Vue',
      url: 'https://videos.example.com/watch?v=xyz123',
      author: 'Channel A',
      imageUrl: 'https://img.example.com/vi/xyz123/hqdefault.jpg',
      excerpt: 'In this video we build a dashboard with Vue 3, Tailwind and Hono.',
    })
    expect(feed.items[0]?.publishedAt).toEqual(new Date('2026-01-06T08:00:00Z'))
  })

  it('handles HTML titles and summaries', () => {
    expect(feed.items[1]).toMatchObject({
      title: 'Tailwind v4 deep dive',
      excerpt: 'A walk through the new engine.',
    })
    expect(feed.items[1]?.publishedAt).toEqual(new Date('2026-01-05T09:00:00Z'))
  })
})

describe('Reddit', () => {
  const feed = parseFeed(fixture('reddit.rss'), 'https://www.reddit.com/r/programming/.rss', NOW)

  it('reads the entries', () => {
    expect(feed.title).toBe('Programming')
    expect(feed.items.map((i) => i.title)).toEqual([
      'Why we moved off microservices',
      'SQLite is not a toy database',
    ])
  })

  it('uses the media thumbnail when present, otherwise looks for an image in the content', () => {
    expect(feed.items[0]?.imageUrl).toBe('https://b.thumbs.redditmedia.com/abc.jpg')
    expect(feed.items[1]?.imageUrl).toBeUndefined()
  })

  it('keeps only readable text in the excerpt', () => {
    expect(feed.items[1]?.excerpt).toBe('SQLite is not a toy database, here is why.')
    expect(feed.items[0]?.excerpt).not.toContain('<')
  })
})

describe('invalid input', () => {
  it('rejects an HTML page', () => {
    expect(() => parseFeed(fixture('page-without-feed.html'), 'https://x.example/', NOW)).toThrow(
      FeedParseError,
    )
  })

  it('rejects unrelated XML', () => {
    expect(() => parseFeed('<note><to>me</to></note>', 'https://x.example/', NOW)).toThrow(
      FeedParseError,
    )
  })

  it('rejects empty input', () => {
    expect(() => parseFeed('', 'https://x.example/', NOW)).toThrow(FeedParseError)
  })

  it('returns an empty list for a feed without items', () => {
    const xml = '<rss version="2.0"><channel><title>Empty</title></channel></rss>'
    expect(parseFeed(xml, 'https://x.example/', NOW)).toMatchObject({ title: 'Empty', items: [] })
  })

  it('caps the number of items', () => {
    const items = Array.from(
      { length: 150 },
      (_, i) => `<item><title>T${i}</title><link>https://x.example/${i}</link></item>`,
    ).join('')
    const xml = `<rss version="2.0"><channel><title>Big</title>${items}</channel></rss>`
    expect(parseFeed(xml, 'https://x.example/', NOW).items).toHaveLength(100)
  })
})
