import type { NormalizedItem, SourceKind } from '@nuenews/shared'
import type { HttpClient } from '../lib/http'

/** What a provider needs to know about a stored source in order to fetch it. */
export interface SourceRef {
  id: string
  kind: SourceKind
  key: string
  etag: string | null
  lastModified: string | null
}

/** Injected so providers never touch the real network (or the real clock) in tests. */
export interface FetchContext {
  http: HttpClient
  now: () => Date
}

/** The canonical identity of a source, produced from whatever the user typed. */
export interface ResolvedSource {
  kind: SourceKind
  key: string
  title?: string
  siteUrl?: string
  faviconUrl?: string
}

export type FetchResult =
  | {
      status: 'ok'
      items: NormalizedItem[]
      etag?: string
      lastModified?: string
      title?: string
      siteUrl?: string
    }
  | { status: 'not_modified' }

export interface Provider {
  kind: SourceKind
  /** Validate and canonicalize user input (feed URL, channel handle, fiction URL, ...). */
  resolve(input: string, ctx: FetchContext): Promise<ResolvedSource>
  /** Fetch the source, using conditional headers from `source` where the origin supports them. */
  fetch(source: SourceRef, ctx: FetchContext): Promise<FetchResult>
}
