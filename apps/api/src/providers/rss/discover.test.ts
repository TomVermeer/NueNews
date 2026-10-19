import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findFeedLinks } from './discover'

const html = readFileSync(
  new URL('./__fixtures__/page-with-feed-links.html', import.meta.url),
  'utf8',
)

describe('findFeedLinks', () => {
  it('returns advertised feeds as absolute URLs, without duplicates', () => {
    expect(findFeedLinks(html, 'https://blog.example.com/posts/')).toEqual([
      'https://blog.example.com/atom.xml',
      'https://blog.example.com/rss.xml',
    ])
  })

  it('ignores stylesheets and alternate links that are not feeds', () => {
    expect(findFeedLinks('<link rel="stylesheet" href="/a.css">', 'https://x.example/')).toEqual([])
    expect(
      findFeedLinks('<link rel="alternate" hreflang="nl" href="/nl/">', 'https://x.example/'),
    ).toEqual([])
  })

  it('ignores non-http feed links', () => {
    const tag = '<link rel="alternate" type="application/rss+xml" href="javascript:alert(1)">'
    expect(findFeedLinks(tag, 'https://x.example/')).toEqual([])
  })
})
