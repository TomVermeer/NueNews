import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  routeConfigSchema,
  updateWidgetSchema,
  WEATHER_ATTRIBUTION,
  weatherConfigSchema,
  widgetConfigSchemas,
} from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import type { Db } from '../db/client'
import { itemState, items, sources, widgetSources, widgets } from '../db/schema'
import { validate } from '../http'
import { refreshSourcesNow } from '../services/refreshNow'
import {
  requireWidget,
  sourceLabels,
  unavailableWidgetError,
  type WidgetRow,
} from '../services/widgetSources'
import { updateWidget } from '../services/widgets'
import { getWeather } from '../weather/service'

type SourceRow = typeof sources.$inferSelect
type Labels = ReturnType<typeof sourceLabels>

async function sourceIdsOf(db: Db, widgetId: string) {
  const rows = await db
    .select({ id: widgetSources.sourceId })
    .from(widgetSources)
    .where(eq(widgetSources.widgetId, widgetId))
  return rows.map((row) => row.id)
}

const widgetSummary = (widget: WidgetRow) => ({
  id: widget.id,
  type: widget.type,
  title: widget.title,
})

async function weatherData(deps: AppDeps, widget: WidgetRow) {
  const config = weatherConfigSchema.parse(widget.config)
  const { snapshot, fetchedAt, stale } = await getWeather(
    { db: deps.db, http: deps.fetchContext.http, now: deps.now },
    config.location,
    config.units,
  )
  return {
    widget: widgetSummary(widget),
    location: config.location,
    units: config.units,
    ...snapshot,
    fetchedAt,
    stale,
    attribution: WEATHER_ATTRIBUTION,
  }
}

/**
 * What the browser needs to show the map: Google draws the route, so nothing is fetched here.
 * The Embed API key is meant to be public; Google restricts it to the owner's web addresses.
 */
function routeData(deps: AppDeps, widget: WidgetRow) {
  const embedKey = deps.googleMapsEmbedKey
  if (!embedKey) throw unavailableWidgetError('route')

  const { origin, destination, mode, reversed, autoSwapAt } = routeConfigSchema.parse(widget.config)
  return {
    widget: widgetSummary(widget),
    origin,
    destination,
    mode,
    reversed,
    autoSwapAt,
    embedKey,
  }
}

/** The newest items of these sources, with the user's seen and read state. */
async function newestItems(db: Db, userId: string, sourceIds: string[], limit: number) {
  if (sourceIds.length === 0) return []
  return await db
    .select({
      id: items.id,
      sourceId: items.sourceId,
      title: items.title,
      url: items.url,
      excerpt: items.excerpt,
      imageUrl: items.imageUrl,
      author: items.author,
      publishedAt: items.publishedAt,
      seenAt: itemState.seenAt,
      readAt: itemState.readAt,
    })
    .from(items)
    .leftJoin(itemState, and(eq(itemState.itemId, items.id), eq(itemState.userId, userId)))
    .where(inArray(items.sourceId, sourceIds))
    .orderBy(desc(items.publishedAt))
    .limit(limit)
}

type ItemRow = Awaited<ReturnType<typeof newestItems>>[number]

function toItemDto(
  { seenAt, readAt, ...item }: ItemRow,
  source: SourceRow | undefined,
  labels: Labels,
) {
  return {
    ...item,
    sourceName: (source && labels.get(source.key)) || source?.title || null,
    sourceUrl: source?.siteUrl ?? null,
    sourceIconUrl: source?.faviconUrl ?? null,
    seen: seenAt !== null,
    read: readAt !== null,
  }
}

/** What went wrong on the last fetch, or null while the source is healthy. */
function sourceError(source: SourceRow): string | null {
  if (source.errorCount === 0) return null
  return source.lastStatus ?? 'error'
}

function toSourceDto(source: SourceRow, labels: Labels) {
  return {
    id: source.id,
    title: (labels.get(source.key) ?? source.title) || null,
    siteUrl: source.siteUrl,
    iconUrl: source.faviconUrl,
    lastFetchedAt: source.lastFetchedAt,
    error: sourceError(source),
  }
}

async function feedData(deps: AppDeps, userId: string, widget: WidgetRow) {
  if (widget.type !== 'feed' && widget.type !== 'youtube') {
    throw unavailableWidgetError(widget.type)
  }

  const { db } = deps
  const config = widgetConfigSchemas[widget.type].parse(widget.config)
  const labels = sourceLabels(widget.type, config)
  const sourceRows = await db
    .select()
    .from(sources)
    .where(inArray(sources.id, await sourceIdsOf(db, widget.id)))
  const sourceById = new Map(sourceRows.map((row) => [row.id, row]))
  const itemRows = await newestItems(db, userId, [...sourceById.keys()], config.limit)

  return {
    widget: widgetSummary(widget),
    items: itemRows.map((row) => toItemDto(row, sourceById.get(row.sourceId), labels)),
    sources: sourceRows.map((source) => toSourceDto(source, labels)),
  }
}

export function widgetRoutes(deps: AppDeps) {
  const { db } = deps

  return new Hono<Env>()
    .patch('/:id', validate('json', updateWidgetSchema), async (c) => {
      const widget = await requireWidget(db, c.get('userId'), c.req.param('id'))
      return c.json(await updateWidget(deps, widget, c.req.valid('json')))
    })

    .delete('/:id', async (c) => {
      const widget = await requireWidget(db, c.get('userId'), c.req.param('id'))
      await db.delete(widgets).where(eq(widgets.id, widget.id))
      return c.body(null, 204)
    })

    .get('/:id/data', async (c) => {
      const userId = c.get('userId')
      const widget = await requireWidget(db, userId, c.req.param('id'))
      if (widget.type === 'weather') return c.json(await weatherData(deps, widget))
      if (widget.type === 'route') return c.json(routeData(deps, widget))
      return c.json(await feedData(deps, userId, widget))
    })

    .post('/:id/refresh', async (c) => {
      const widget = await requireWidget(db, c.get('userId'), c.req.param('id'))
      return c.json(await refreshSourcesNow(deps, await sourceIdsOf(db, widget.id)))
    })
}
