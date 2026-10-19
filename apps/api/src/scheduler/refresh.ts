import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { upsertItems, pruneItems } from '../db/items'
import type { Db } from '../db/client'
import { sources } from '../db/schema'
import { BlockedUrlError } from '../lib/ssrf'
import { HttpError } from '../lib/http'
import { ProviderError } from '../providers/errors'
import type { ProviderRegistry } from '../providers/registry'
import type { FetchContext } from '../providers/types'
import { nextFetchAfterError, nextFetchAfterSuccess } from './backoff'

export type SourceRow = typeof sources.$inferSelect

export interface RefreshDeps {
  db: Db
  registry: ProviderRegistry
  ctx: FetchContext
  /** How many of a source's newest items to keep. */
  keepItems?: number
}

export type RefreshOutcome = 'ok' | 'not_modified' | 'error'

const DEFAULT_KEEP_ITEMS = 100

/** Errors with a message that is safe to store and show; anything else is logged and hidden. */
function describeError(error: unknown): { message: string; retryAfterSeconds?: number } {
  if (error instanceof ProviderError) {
    return { message: error.message, retryAfterSeconds: error.retryAfterSeconds }
  }
  if (error instanceof BlockedUrlError || error instanceof HttpError) {
    return { message: error.message }
  }
  console.error('Unexpected error while refreshing a source', error)
  return { message: 'Unexpected error' }
}

/** Fetches one source and records the result: items, cache validators, status and next fetch time. */
export async function refreshSource(
  deps: RefreshDeps,
  source: SourceRow,
  now: Date,
): Promise<RefreshOutcome> {
  const { db, registry, ctx } = deps

  try {
    const result = await registry.get(source.kind).fetch(
      {
        id: source.id,
        kind: source.kind,
        key: source.key,
        etag: source.etag,
        lastModified: source.lastModified,
      },
      ctx,
    )

    if (result.status === 'ok') {
      db.transaction(() => {
        upsertItems(db, source.id, result.items, now)
        pruneItems(db, source.id, deps.keepItems ?? DEFAULT_KEEP_ITEMS)
        db.update(sources)
          .set({
            etag: result.etag ?? null,
            lastModified: result.lastModified ?? null,
            title: source.title ?? result.title ?? null,
            siteUrl: source.siteUrl ?? result.siteUrl ?? null,
            lastFetchedAt: now,
            nextFetchAt: nextFetchAfterSuccess(now, source.intervalMin),
            lastStatus: 'ok',
            errorCount: 0,
          })
          .where(eq(sources.id, source.id))
          .run()
      })
      return 'ok'
    }

    db.update(sources)
      .set({
        lastFetchedAt: now,
        nextFetchAt: nextFetchAfterSuccess(now, source.intervalMin),
        lastStatus: 'not_modified',
        errorCount: 0,
      })
      .where(eq(sources.id, source.id))
      .run()
    return 'not_modified'
  } catch (error) {
    const { message, retryAfterSeconds } = describeError(error)
    const errorCount = source.errorCount + 1
    db.update(sources)
      .set({
        lastFetchedAt: now,
        nextFetchAt: nextFetchAfterError(now, source.intervalMin, errorCount, retryAfterSeconds),
        lastStatus: `error: ${message}`.slice(0, 200),
        errorCount,
      })
      .where(eq(sources.id, source.id))
      .run()
    return 'error'
  }
}

/** Sources that are due and that some widget actually uses (nobody polls orphaned sources). */
export function selectDueSources(db: Db, registry: ProviderRegistry, now: Date, limit: number) {
  const kinds = registry.kinds()
  if (kinds.length === 0) return []
  return db
    .select()
    .from(sources)
    .where(
      and(
        lte(sources.nextFetchAt, now),
        inArray(sources.kind, kinds),
        sql`exists (select 1 from widget_sources ws where ws.source_id = ${sources.id})`,
      ),
    )
    .orderBy(sources.nextFetchAt)
    .limit(limit)
    .all()
}
