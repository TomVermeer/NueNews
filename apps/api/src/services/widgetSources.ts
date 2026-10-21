import { and, eq, inArray, sql } from 'drizzle-orm'
import type { SourceKind, WidgetType } from '@nuenews/shared'
import { feedConfigSchema, youtubeConfigSchema } from '@nuenews/shared'
import type { Db } from '../db/client'
import { firstRow, onlyRow } from '../db/query'
import { dashboards, sources, widgetSources, widgets } from '../db/schema'
import { ApiError } from '../http'
import { checkUrl } from '../lib/ssrf'
import { channelIdFromInput } from '../providers/youtube'

/** Widget types that can be created today. The rest exist in the schema but have no provider yet. */
export const AVAILABLE_WIDGET_TYPES: readonly WidgetType[] = ['feed', 'youtube', 'weather']

export const DEFAULT_SIZE: Record<WidgetType, { w: number; h: number }> = {
  feed: { w: 4, h: 6 },
  royalroad: { w: 4, h: 5 },
  youtube: { w: 6, h: 5 },
  weather: { w: 4, h: 4 },
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
    return new Map(feed.sources.map((s) => [checkUrl(s.url).href, s.label]))
  }
  if (type === 'youtube') {
    const { channels } = youtubeConfigSchema.parse(config)
    return new Map(channels.map((c) => [channelIdFromInput(c.input) ?? c.input, c.label]))
  }
  return new Map()
}

/** Makes the widget's source links match `refs`, creating any sources that are new. */
export async function linkWidgetSources(
  db: Db,
  widgetId: string,
  refs: SourceRef[],
  now: Date,
): Promise<{ sourceIds: string[]; newSourceIds: string[] }> {
  const sourceIds: string[] = []
  const newSourceIds: string[] = []

  for (const ref of refs) {
    const created = firstRow(
      await db
        .insert(sources)
        .values({ kind: ref.kind, key: ref.key, nextFetchAt: now })
        .onConflictDoNothing({ target: [sources.kind, sources.key] })
        .returning({ id: sources.id }),
    )
    const id =
      created?.id ??
      onlyRow(
        await db
          .select({ id: sources.id })
          .from(sources)
          .where(and(eq(sources.kind, ref.kind), eq(sources.key, ref.key))),
      ).id
    sourceIds.push(id)
    if (created) newSourceIds.push(id)
  }

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

  return { sourceIds, newSourceIds }
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

export async function ownedDashboard(db: Db, userId: string, id: string) {
  return firstRow(
    await db
      .select()
      .from(dashboards)
      .where(and(eq(dashboards.id, id), eq(dashboards.userId, userId))),
  )
}

export async function ownedWidget(db: Db, userId: string, id: string) {
  return firstRow(
    await db
      .select({ widget: widgets })
      .from(widgets)
      .innerJoin(dashboards, eq(dashboards.id, widgets.dashboardId))
      .where(and(eq(widgets.id, id), eq(dashboards.userId, userId))),
  )?.widget
}

export function toWidgetDto(widget: typeof widgets.$inferSelect) {
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
