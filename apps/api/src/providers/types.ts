import type { NormalizedItem, SourceKind } from '@nuenews/shared'
import type { HttpClient } from '../lib/http'

/** What a provider needs to know about a stored source in order to fetch it. */
export interface SourceRef {
  readonly id: string
  readonly kind: SourceKind
  readonly key: string
  readonly etag: string | null
  readonly lastModified: string | null
}

/** Injected so providers never touch the real network (or the real clock) in tests. */
export interface FetchContext {
  readonly http: HttpClient
  readonly now: () => Date
}

/** The canonical identity of a source, produced from whatever the user typed. */
export interface ResolvedSource {
  readonly kind: SourceKind
  readonly key: string
  readonly title?: string
  readonly siteUrl?: string
  readonly faviconUrl?: string
}

export type FetchResult =
  | {
      status: 'ok'
      items: readonly NormalizedItem[]
      etag?: string
      lastModified?: string
      title?: string
      siteUrl?: string
    }
  | { status: 'not_modified' }

export interface Provider {
  readonly kind: SourceKind
  /** Validate and canonicalize user input (feed URL, channel handle, fiction URL, ...). */
  resolve(input: string, ctx: FetchContext): Promise<ResolvedSource>
  /** Fetch the source, using conditional headers from `source` where the origin supports them. */
  fetch(source: SourceRef, ctx: FetchContext): Promise<FetchResult>
  /** The source's own icon (e.g. a channel avatar), for providers whose feed does not carry one. */
  fetchIcon?(source: SourceRef, ctx: FetchContext): Promise<string | undefined>
}
