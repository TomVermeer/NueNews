import { XMLParser } from 'fast-xml-parser'
import { normalizedItemSchema, type NormalizedItem } from '@nuenews/shared'
import { errorMessage } from '../../lib/errors'
import { decodeEntities, htmlToText, makeExcerpt, truncate } from '../../lib/text'
import { ProviderError } from '../errors'

export class FeedParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedParseError'
  }
}

export interface ParsedFeed {
  readonly title?: string
  readonly siteUrl?: string
  readonly items: readonly NormalizedItem[]
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
function textOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined
  if (typeof value === 'number') return String(value)
  const node = asNode(value)
  return node ? textOf(node['#text']) : undefined
}

function attribute(node: unknown, name: string): string | undefined {
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
    const plain = textOf(link)
    const href = attribute(link, 'href')
    const rel = attribute(link, 'rel')
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
    const url = absoluteHttpUrl(attribute(thumb, 'url'), base)
    if (url) return url
  }

  const contents = [
    ...toArray(item['media:content']),
    ...toArray(asNode(item['media:group'])?.['media:content']),
    ...toArray(item.enclosure),
  ]
  for (const content of contents) {
    const type = attribute(content, 'type') ?? ''
    const medium = attribute(content, 'medium') ?? ''
    if (type.startsWith('image/') || medium === 'image') {
      const url = absoluteHttpUrl(attribute(content, 'url'), base)
      if (url) return url
    }
  }
  return firstImgSrc(html, base)
}

function pickAuthor(item: Node): string | undefined {
  const creator = textOf(item['dc:creator'])
  if (creator) return creator
  const author = item.author
  const name = textOf(asNode(author)?.name) ?? textOf(author)
  return name ? htmlToText(name) : undefined
}

function parseDate(value: string | undefined, fallback: Date): Date {
  const time = value ? Date.parse(value) : NaN
  return Number.isNaN(time) ? fallback : new Date(time)
}

function normalizeItem(raw: Node, base: string, now: Date): NormalizedItem | undefined {
  const url =
    pickLink(toArray(raw.link), base) ?? absoluteHttpUrl(textOf(raw.guid) ?? textOf(raw.id), base)
  if (!url) return undefined

  const summaryHtml = textOf(raw.description) ?? textOf(raw.summary)
  const fullHtml = textOf(raw['content:encoded']) ?? textOf(raw.content)
  const mediaDescription = textOf(asNode(raw['media:group'])?.['media:description'])
  const excerptSource = summaryHtml ?? fullHtml ?? mediaDescription

  const excerpt = makeExcerpt(excerptSource)
  const title = htmlToText(textOf(raw.title) ?? '') || truncate(excerpt ?? '', 80) || url

  const candidate = {
    externalId: textOf(raw.guid) ?? textOf(raw.id) ?? url,
    title,
    url,
    excerpt,
    imageUrl: pickImage(raw, fullHtml ?? summaryHtml, base),
    author: pickAuthor(raw),
    publishedAt: parseDate(
      textOf(raw.pubDate) ?? textOf(raw['dc:date']) ?? textOf(raw.published) ?? textOf(raw.updated),
      now,
    ),
  }

  const result = normalizedItemSchema.safeParse(candidate)
  return result.success ? result.data : undefined
}

/** A downloaded document: its body and the address it finally came from. */
interface Downloaded {
  readonly body: string
  readonly url: string
}

/**
 * Parses a downloaded feed. A body that is not a feed becomes a ProviderError the user can see,
 * with `message` or else the parser's own explanation.
 */
export function readFeed(response: Downloaded, now: Date, message?: string): ParsedFeed {
  try {
    return parseFeed(response.body, response.url, now)
  } catch (error) {
    if (error instanceof FeedParseError) throw new ProviderError(message ?? error.message)
    throw error
  }
}

/** Parses a downloaded feed, or returns undefined when the body is not a feed. */
export function tryReadFeed(response: Downloaded, now: Date): ParsedFeed | undefined {
  try {
    return parseFeed(response.body, response.url, now)
  } catch (error) {
    if (error instanceof FeedParseError) return undefined
    throw error
  }
}

function parseXml(xml: string): Node {
  try {
    return parser.parse(xml)
  } catch (error) {
    throw new FeedParseError(`Could not read the feed: ${errorMessage(error)}`)
  }
}

/** The feed's own details (title, link) and its raw entries, whichever of the three formats it is. */
interface FeedParts {
  readonly meta: Node | undefined
  readonly entries: unknown[]
}

function feedParts(doc: Node): FeedParts {
  const rss = asNode(asNode(doc.rss)?.channel)
  if (rss) return { meta: rss, entries: toArray(rss.item) }

  const atom = asNode(doc.feed)
  if (atom) return { meta: atom, entries: toArray(atom.entry) }

  const rdf = asNode(doc['rdf:RDF'])
  if (rdf) return { meta: asNode(rdf.channel), entries: toArray(rdf.item) }

  throw new FeedParseError('This address does not contain an RSS or Atom feed')
}

/** Normalizes up to MAX_ITEMS entries, dropping the ones that are unusable (no link, say). */
function normalizeItems(entries: unknown[], baseUrl: string, now: Date): NormalizedItem[] {
  const items: NormalizedItem[] = []
  for (const entry of entries.slice(0, MAX_ITEMS)) {
    const node = asNode(entry)
    const item = node && normalizeItem(node, baseUrl, now)
    if (item) items.push(item)
  }
  return items
}

/** Parses an RSS 2.0, RSS 1.0 (RDF) or Atom document into normalized items. */
export function parseFeed(xml: string, baseUrl: string, now: Date): ParsedFeed {
  const { meta, entries } = feedParts(parseXml(xml))
  const title = textOf(meta?.title)
  return {
    title: title ? htmlToText(title) : undefined,
    siteUrl: pickLink(toArray(meta?.link), baseUrl),
    items: normalizeItems(entries, baseUrl, now),
  }
}
