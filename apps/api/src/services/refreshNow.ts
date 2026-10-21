import { inArray } from 'drizzle-orm'
import type { AppDeps } from '../context'
import { sources } from '../db/schema'
import { refreshSource } from '../scheduler/refresh'
import { groupByHost } from '../scheduler/scheduler'

/**
 * Fetches the given sources right away (used when a widget is created or a user asks for a
 * refresh). Sources fetched very recently are skipped so a refresh button cannot hammer a site.
 * Failures are recorded on the source and never thrown.
 */
export async function refreshSourcesNow(
  deps: AppDeps,
  sourceIds: string[],
): Promise<{ refreshed: number; skipped: number }> {
  if (sourceIds.length === 0) return { refreshed: 0, skipped: 0 }

  const now = deps.now()
  const rows = await deps.db.select().from(sources).where(inArray(sources.id, sourceIds))
  const cutoff = now.getTime() - deps.minRefreshIntervalSec * 1000
  const fresh = (row: (typeof rows)[number]) =>
    row.lastFetchedAt && row.lastFetchedAt.getTime() > cutoff
  const toRefresh = rows.filter((row) => !fresh(row))

  const refreshDeps = { db: deps.db, registry: deps.registry, ctx: deps.fetchContext }
  const supported = toRefresh.filter((row) => deps.registry.kinds().includes(row.kind))
  await Promise.all(
    groupByHost(supported).map(async (group) => {
      for (const row of group) await refreshSource(refreshDeps, row, deps.now())
    }),
  )
  return { refreshed: supported.length, skipped: rows.length - supported.length }
}
