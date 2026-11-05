import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Layout, SourceKind, WidgetType } from '@nuenews/shared'
import { feedConfigSchema, youtubeConfigSchema } from '@nuenews/shared'
import type { AppDeps } from '../context'
import type { Db } from '../db/client'
import { firstRow, onlyRow } from '../db/query'
import { dashboards, sources, widgetSources, widgets } from '../db/schema'
import { ApiError, notFound } from '../http'
import { checkUrl } from '../lib/ssrf'
import { channelIdFromInput } from '../providers/youtube'

/**
 * Widget types that can be created today. RoyalRoad exists in the schema but has no provider yet,
 * and the route widget needs the server's Google Maps key.
 */
export function availableWidgetTypes(deps: Pick<AppDeps, 'googleMapsEmbedKey'>): WidgetType[] {
  const types: WidgetType[] = ['feed', 'youtube', 'weather']
  return deps.googleMapsEmbedKey ? [...types, 'route'] : types
}

export function unavailableWidgetError(type: WidgetType): ApiError {
  const reason =
    type === 'route'
      ? 'needs a Google Maps key, which this server does not have'
      : 'is not available yet'
  return new ApiError(422, 'widget_type_unavailable', `The "${type}" widget ${reason}`)
}

export const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  feed: { w: 4, h: 6 },
  royalroad: { w: 4, h: 5 },
  youtube: { w: 6, h: 5 },
  weather: { w: 4, h: 4 },
  route: { w: 6, h: 5 },
}

export interface SourceRef {
  kind: SourceKind
  key: string
}

/** The sources a widget needs, derived from its (already validated) config. */
export function sourceRefsFor(type: WidgetType, config: unknown): SourceRef[] {
  if (type === 'feed') {
    const feed = feedConfigSchema.parse(config)
    const keys = new Set(feed.sources.map((source) => checkUrl(source.url).href))
    return [...keys].map((key) => ({ kind: 'rss' as const, key }))
  }

  if (type === 'youtube') {
    const { channels } = youtubeConfigSchema.parse(config)
    const keys = new Set(
      channels.map((channel) => {
        const id = channelIdFromInput(channel.input)
        if (!id) {
          throw new ApiError(
            400,
            'invalid_config',
            `config.channels: "${channel.input}" is not a channel ID or /channel/UC… address. Look it up with /sources/resolve first.`,
          )
        }
        return id
      }),
    )
    return [...keys].map((key) => ({ kind: 'youtube' as const, key }))
  }

  return []
}

/** The names the user gave to a widget's sources, by source key. */
export function sourceLabels(type: WidgetType, config: unknown): Map<string, string | undefined> {
  if (type === 'feed') {
    const feed = feedConfigSchema.parse(config)
    return new Map(feed.sources.map((source) => [checkUrl(source.url).href, source.label]))
  }
  if (type === 'youtube') {
    const { channels } = youtubeConfigSchema.parse(config)
    return new Map(
      channels.map((channel) => [
        channelIdFromInput(channel.input) ?? channel.input,
        channel.label,
      ]),
    )
  }
  return new Map()
}

/** The id of the source for `ref`, creating it (due right away) when it does not exist yet. */
async function ensureSource(
  db: Db,
  ref: SourceRef,
  now: Date,
): Promise<{ id: string; created: boolean }> {
  const created = firstRow(
    await db
      .insert(sources)
      .values({ kind: ref.kind, key: ref.key, nextFetchAt: now })
      .onConflictDoNothing({ target: [sources.kind, sources.key] })
      .returning({ id: sources.id }),
  )
  if (created) return { id: created.id, created: true }

  const existing = onlyRow(
    await db
      .select({ id: sources.id })
      .from(sources)
      .where(and(eq(sources.kind, ref.kind), eq(sources.key, ref.key))),
  )
  return { id: existing.id, created: false }
}

/** Links the widget to exactly these sources: stale links are removed and missing ones added. */
async function setWidgetLinks(db: Db, widgetId: string, sourceIds: string[]): Promise<void> {
  const current = (
    await db
      .select({ sourceId: widgetSources.sourceId })
      .from(widgetSources)
      .where(eq(widgetSources.widgetId, widgetId))
  ).map((row) => row.sourceId)

  const stale = current.filter((id) => !sourceIds.includes(id))
  if (stale.length > 0) {
    await db
      .delete(widgetSources)
      .where(and(eq(widgetSources.widgetId, widgetId), inArray(widgetSources.sourceId, stale)))
  }
  for (const sourceId of sourceIds.filter((id) => !current.includes(id))) {
    await db.insert(widgetSources).values({ widgetId, sourceId })
  }
}

/** Makes the widget's source links match `refs`, creating any sources that are new. */
export async function linkWidgetSources(
  db: Db,
  widgetId: string,
  refs: SourceRef[],
  now: Date,
): Promise<{ sourceIds: string[]; newSourceIds: string[] }> {
  const ensured: { id: string; created: boolean }[] = []
  // One at a time: the inserts share a transaction.
  for (const ref of refs) ensured.push(await ensureSource(db, ref, now))

  const sourceIds = ensured.map((source) => source.id)
  await setWidgetLinks(db, widgetId, sourceIds)
  return {
    sourceIds,
    newSourceIds: ensured.filter((source) => source.created).map((source) => source.id),
  }
}

/** The next free spot: left edge, below everything already on the dashboard. */
export async function nextFreeY(db: Db, dashboardId: string): Promise<number> {
  const row = firstRow(
    await db
      .select({ bottom: sql<number>`coalesce(max(${widgets.y} + ${widgets.h}), 0)::int` })
      .from(widgets)
      .where(eq(widgets.dashboardId, dashboardId)),
  )
  return row?.bottom ?? 0
}

export async function ownedDashboard(
  db: Db,
  userId: string,
  id: string,
): Promise<typeof dashboards.$inferSelect | undefined> {
  return firstRow(
    await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId))),
  )
}

export async function ownedWidget(
  db: Db,
  userId: string,
  id: string,
): Promise<WidgetRow | undefined> {
  return firstRow(
    await db
      .select({ widget: widgets })
      .from(widgets)
      .innerJoin(dashboards, eq(dashboards.id, widgets.dashboardId))
      .where(and(eq(widgets.id, id), eq(dashboards.userId, userId))),
  )?.widget
}

/** The user's dashboard with this id, or a 404. */
export async function requireDashboard(
  db: Db,
  userId: string,
  id: string,
): Promise<typeof dashboards.$inferSelect> {
  const dashboard = await ownedDashboard(db, userId, id)
  if (!dashboard) throw notFound('Dashboard')
  return dashboard
}

/** The user's widget with this id, or a 404. */
export async function requireWidget(db: Db, userId: string, id: string): Promise<WidgetRow> {
  const widget = await ownedWidget(db, userId, id)
  if (!widget) throw notFound('Widget')
  return widget
}

export type WidgetRow = typeof widgets.$inferSelect

/** A widget as the API returns it: the grid position grouped under `layout`. */
export type WidgetDto = Omit<WidgetRow, 'x' | 'y' | 'w' | 'h'> & { layout: Layout }

export function toWidgetDto(widget: WidgetRow): WidgetDto {
  return {
    id: widget.id,
    dashboardId: widget.dashboardId,
    type: widget.type,
    title: widget.title,
    color: widget.color,
    config: widget.config,
    layout: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
    createdAt: widget.createdAt,
    updatedAt: widget.updatedAt,
  }
}
