const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
}

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const code =
        entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}

/** Converts HTML to plain text: no tags, decoded entities, collapsed whitespace. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi, ' ')
  // Tags are removed first and entities decoded after, so "&lt;b&gt;" stays visible text.
  const withoutTags = withoutBlocks.replace(/<[^>]*>/g, '')
  return decodeEntities(withoutTags).replace(/\s+/g, ' ').trim()
}

/** Shortens text to at most `max` characters, cutting at a word boundary where possible. */
export function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  const cut = text.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(' ')
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`
}

/** Plain-text excerpt for a feed item, or undefined if nothing readable is left. */
export function makeExcerpt(html: string | undefined, max = 200): string | undefined {
  if (!html) return undefined
  const text = htmlToText(html)
  return text ? truncate(text, max) : undefined
}
