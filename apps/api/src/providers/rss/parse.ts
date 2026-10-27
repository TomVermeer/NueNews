import { XMLParser } from 'fast-xml-parser'
import { normalizedItemSchema, type NormalizedItem } from '@nuenews/shared'
import { errorMessage } from '../../lib/errors'
import { decodeEntities, htmlToText, makeExcerpt, truncate } from '../../lib/text'

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedParseError'
  }
}

export interface ParsedFeed {
  title?: string
  siteUrl?: string
  items: NormalizedItem[]
}

const MAX_ITEMS = 100

const ARRAY_TAGS = new Set([
  'item',
  'entry',
  'link',
  'enclosure',
  'media:thumbnail',
  'media:content',
])

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
})

// The parsed XML is untyped, so values are read through small defensive helpers.
type Node = Record<string, unknown>

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function asNode(value: unknown): Node | undefined {
  // Parsed XML only holds strings, numbers, arrays and plain objects, so any object is a Node.
  return typeof value === 'object' && value !== null ? (value as Node) : undefined
}

/** The text of a node that may be a plain string or an element with attributes. */
function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  const node = asNode(value)
  return node ? text(node['#text']) : undefined
}

function attr(node: unknown, name: string): string | undefined {
  const value = asNode(node)?.[`@_${name}`]
  return typeof value === 'string' ? value : undefined
}

function absoluteHttpUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(decodeEntities(value.trim()), base)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

/** The item's main link: an Atom alternate link, or an RSS <link> text node. */
function pickLink(links: unknown[], base: string): string | undefined {
  let fallback: string | undefined
  for (const link of links) {
    const plain = text(link)
    const href = attr(link, 'href')
    const rel = attr(link, 'rel')
    const candidate = absoluteHttpUrl(href ?? plain, base)
    if (!candidate) continue
    if (!rel || rel === 'alternate') return candidate
    fallback ??= candidate
  }
  return fallback
}

function firstImgSrc(html: string | undefined, base: string): string | undefined {
  const match = html?.match(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i)
  return absoluteHttpUrl(match?.[1], base)
}

function pickImage(item: Node, html: string | undefined, base: string): string | undefined {
  const media = [
    ...toArray(item['media:thumbnail']),
    ...toArray(asNode(item['media:group'])?.['media:thumbnail']),
  ]
  for (const thumb of media) {
    const url = absoluteHttpUrl(attr(thumb, 'url'), base)
    if (url) return url
  }

  const contents = [
    ...toArray(item['media:content']),
    ...toArray(asNode(item['media:group'])?.['media:content']),
    ...toArray(item.enclosure),
  ]
  for (const content of contents) {
    const type = attr(content, 'type') ?? ''
    const medium = attr(content, 'medium') ?? ''
    if (type.startsWith('image/') || medium === 'image') {
      const url = absoluteHttpUrl(attr(content, 'url'), base)
      if (url) return url
    }
  }
  return firstImgSrc(html, base)
}

function pickAuthor(item: Node): string | undefined {
  const dc = text(item['dc:creator'])
  if (dc) return dc
  const author = item.author
  const name = text(asNode(author)?.name) ?? text(author)
  return name ? htmlToText(name) : undefined
}

function parseDate(value: string | undefined, fallback: Date): Date {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? fallback : new Date(time)
}

function normalizeItem(raw: Node, base: string, now: Date): NormalizedItem | undefined {
  const url =
    pickLink(toArray(raw.link), base) ?? absoluteHttpUrl(text(raw.guid) ?? text(raw.id), base)
  if (!url) return undefined

  const summaryHtml = text(raw.description) ?? text(raw.summary)
  const fullHtml = text(raw['content:encoded']) ?? text(raw.content)
  const mediaDescription = text(asNode(raw['media:group'])?.['media:description'])
  const excerptSource = summaryHtml ?? fullHtml ?? mediaDescription

  const excerpt = makeExcerpt(excerptSource)
  const title = htmlToText(text(raw.title) ?? '') || truncate(excerpt ?? '', 80) || url

  const candidate = {
    externalId: text(raw.guid) ?? text(raw.id) ?? url,
    title,
    url,
    excerpt,
    imageUrl: pickImage(raw, fullHtml ?? summaryHtml, base),
    author: pickAuthor(raw),
    publishedAt: parseDate(
      text(raw.pubDate) ?? text(raw['dc:date']) ?? text(raw.published) ?? text(raw.updated),
      now,
    ),
  }

  const result = normalizedItemSchema.safeParse(candidate)
  return result.success ? result.data : undefined
}

/** Parses an RSS 2.0, RSS 1.0 (RDF) or Atom document into normalized items. */
export function parseFeed(xml: string, baseUrl: string, now: Date): ParsedFeed {
  let doc: Node
  try {
    doc = parser.parse(xml)
  } catch (error) {
    throw new FeedParseError(`Could not read the feed: ${errorMessage(error)}`)
  }

  const rss = asNode(asNode(doc.rss)?.channel)
  const atom = asNode(doc.feed)
  const rdf = asNode(doc['rdf:RDF'])

  let meta: Node | undefined
  let rawItems: unknown[]
  if (rss) {
    meta = rss
    rawItems = toArray(rss.item)
  } else if (atom) {
    meta = atom
    rawItems = toArray(atom.entry)
  } else if (rdf) {
    meta = asNode(rdf.channel)
    rawItems = toArray(rdf.item)
  } else {
    throw new FeedParseError('This address does not contain an RSS or Atom feed')
  }

  const items: NormalizedItem[] = []
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
    const node = asNode(raw)
    const item = node && normalizeItem(node, baseUrl, now)
    if (item) items.push(item)
  }

  const title = text(meta?.title)
  return {
    title: title ? htmlToText(title) : undefined,
    siteUrl: pickLink(toArray(meta?.link), baseUrl),
    items,
  }
}
