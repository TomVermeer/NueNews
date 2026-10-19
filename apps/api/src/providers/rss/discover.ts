const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/xml',
  'text/xml',
])

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i'))
  return match?.[1] ?? match?.[2]
}

/** Finds feed addresses advertised in an HTML page's <link rel="alternate"> tags. */
export function findFeedLinks(html: string, baseUrl: string): string[] {
  const found: string[] = []
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rel = attribute(tag, 'rel')?.toLowerCase().split(/\s+/) ?? []
    const type = attribute(tag, 'type')?.toLowerCase()
    const href = attribute(tag, 'href')
    if (!href || !rel.includes('alternate') || !type || !FEED_TYPES.has(type)) continue
    try {
      const url = new URL(href, baseUrl)
      if ((url.protocol === 'http:' || url.protocol === 'https:') && !found.includes(url.href)) {
        found.push(url.href)
      }
    } catch {
      // ignore malformed hrefs
    }
  }
  return found
}
