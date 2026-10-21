import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  updateWidgetSchema,
  WEATHER_ATTRIBUTION,
  weatherConfigSchema,
  widgetConfigSchemas,
} from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { itemState, items, sources, widgetSources, widgets } from '../db/schema'
import { onlyRow } from '../db/query'
import { ApiError, notFound, validate } from '../http'
import { refreshSourcesNow } from '../services/refreshNow'
import { getWeather } from '../weather/service'
import {
  linkWidgetSources,
  ownedWidget,
  sourceLabels,
  sourceRefsFor,
  toWidgetDto,
} from '../services/widgetSources'

export function widgetRoutes(deps: AppDeps) {
  const { db } = deps

  const owned = async (userId: string, id: string) => {
    const widget = await ownedWidget(db, userId, id)
    if (!widget) throw notFound('Widget')
    return widget
  }

  const sourceIdsOf = async (widgetId: string) =>
    (
      await db
        .select({ id: widgetSources.sourceId })
        .from(widgetSources)
        .where(eq(widgetSources.widgetId, widgetId))
    ).map((row) => row.id)

  return new Hono<Env>()
    .patch('/:id', validate('json', updateWidgetSchema), async (c) => {
      const widget = await owned(c.get('userId'), c.req.param('id'))
      const body = c.req.valid('json')

      let config = widget.config
      if (body.config !== undefined) {
        const parsed = widgetConfigSchemas[widget.type].safeParse(body.config)
        if (!parsed.success) {
          const message = parsed.error.issues
            .map((issue) => `config.${issue.path.join('.')}: ${issue.message}`)
            .join('; ')
          throw new ApiError(400, 'invalid_config', message)
        }
        config = parsed.data
      }

      const refs = body.config !== undefined ? sourceRefsFor(widget.type, config) : undefined
      const now = deps.now()
      const { updated, newSourceIds } = await db.transaction(async (tx) => {
        const updated = onlyRow(
          await tx
            .update(widgets)
            .set({
              title: body.title ?? widget.title,
              color: body.color === undefined ? widget.color : body.color,
              config,
              updatedAt: now,
            })
            .where(eq(widgets.id, widget.id))
            .returning(),
        )
        const linked = refs
          ? await linkWidgetSources(tx, widget.id, refs, now)
          : { newSourceIds: [] }
        return { updated, newSourceIds: linked.newSourceIds }
      })

      await refreshSourcesNow(deps, newSourceIds)
      return c.json(toWidgetDto(updated))
    })

    .delete('/:id', async (c) => {
      const widget = await owned(c.get('userId'), c.req.param('id'))
      await db.delete(widgets).where(eq(widgets.id, widget.id))
      return c.body(null, 204)
    })

    .get('/:id/data', async (c) => {
      const userId = c.get('userId')
      const widget = await owned(userId, c.req.param('id'))

      if (widget.type === 'weather') {
        const config = weatherConfigSchema.parse(widget.config)
        const { snapshot, fetchedAt, stale } = await getWeather(
          { db, http: deps.fetchContext.http, now: deps.now },
          config.location,
          config.units,
        )
        return c.json({
          widget: { id: widget.id, type: widget.type, title: widget.title },
          location: config.location,
          units: config.units,
          ...snapshot,
          fetchedAt,
          stale,
          attribution: WEATHER_ATTRIBUTION,
        })
      }

      if (widget.type !== 'feed' && widget.type !== 'youtube') {
        throw new ApiError(
          422,
          'widget_type_unavailable',
          `The "${widget.type}" widget is not available yet`,
        )
      }

      const config = widgetConfigSchemas[widget.type].parse(widget.config)
      const labels = sourceLabels(widget.type, config)
      const sourceRows = await db
        .select()
        .from(sources)
        .where(inArray(sources.id, await sourceIdsOf(widget.id)))
      const byId = new Map(sourceRows.map((row) => [row.id, row]))

      const rows =
        sourceRows.length === 0
          ? []
          : await db
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
              .leftJoin(
                itemState,
                and(eq(itemState.itemId, items.id), eq(itemState.userId, userId)),
              )
              .where(inArray(items.sourceId, [...byId.keys()]))
              .orderBy(desc(items.publishedAt))
              .limit(config.limit)

      return c.json({
        widget: { id: widget.id, type: widget.type, title: widget.title },
        items: rows.map(({ seenAt, readAt, ...row }) => {
          const source = byId.get(row.sourceId)
          return {
            ...row,
            sourceName: (source && labels.get(source.key)) || source?.title || null,
            sourceUrl: source?.siteUrl ?? null,
            sourceIconUrl: source?.faviconUrl ?? null,
            seen: seenAt !== null,
            read: readAt !== null,
          }
        }),
        sources: sourceRows.map((source) => ({
          id: source.id,
          title: (labels.get(source.key) ?? source.title) || null,
          siteUrl: source.siteUrl,
          iconUrl: source.faviconUrl,
          lastFetchedAt: source.lastFetchedAt,
          error: source.errorCount > 0 ? (source.lastStatus ?? 'error') : null,
        })),
      })
    })

    .post('/:id/refresh', async (c) => {
      const widget = await owned(c.get('userId'), c.req.param('id'))
      return c.json(await refreshSourcesNow(deps, await sourceIdsOf(widget.id)))
    })
}
