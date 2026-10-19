import { and, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { feedConfigSchema, updateWidgetSchema, widgetConfigSchemas } from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { itemState, items, sources, widgetSources, widgets } from '../db/schema'
import { ApiError, notFound, validate } from '../http'
import { refreshSourcesNow } from '../services/refreshNow'
import {
  linkWidgetSources,
  ownedWidget,
  sourceRefsFor,
  toWidgetDto,
} from '../services/widgetSources'

export function widgetRoutes(deps: AppDeps) {
  const { db } = deps

  const owned = (userId: string, id: string) => {
    const widget = ownedWidget(db, userId, id)
    if (!widget) throw notFound('Widget')
    return widget
  }

  const sourceIdsOf = (widgetId: string) =>
    db
      .select({ id: widgetSources.sourceId })
      .from(widgetSources)
      .where(eq(widgetSources.widgetId, widgetId))
      .all()
      .map((row) => row.id)

  return new Hono<Env>()
    .patch('/:id', validate('json', updateWidgetSchema), async (c) => {
      const widget = owned(c.get('userId'), c.req.param('id'))
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
      const { updated, newSourceIds } = db.transaction(() => {
        const updated = db
          .update(widgets)
          .set({ title: body.title ?? widget.title, config, updatedAt: now })
          .where(eq(widgets.id, widget.id))
          .returning()
          .get()
        const linked = refs ? linkWidgetSources(db, widget.id, refs, now) : { newSourceIds: [] }
        return { updated, newSourceIds: linked.newSourceIds }
      })

      await refreshSourcesNow(deps, newSourceIds)
      return c.json(toWidgetDto(updated))
    })

    .delete('/:id', (c) => {
      const widget = owned(c.get('userId'), c.req.param('id'))
      db.delete(widgets).where(eq(widgets.id, widget.id)).run()
      return c.body(null, 204)
    })

    .get('/:id/data', (c) => {
      const userId = c.get('userId')
      const widget = owned(userId, c.req.param('id'))

      if (widget.type === 'weather') {
        throw new ApiError(501, 'not_implemented', 'Weather data is not available yet')
      }
      if (widget.type !== 'feed') {
        throw new ApiError(
          422,
          'widget_type_unavailable',
          `The "${widget.type}" widget is not available yet`,
        )
      }

      const config = feedConfigSchema.parse(widget.config)
      const labels = new Map(config.sources.map((s) => [new URL(s.url).href, s.label]))
      const sourceRows = db
        .select()
        .from(sources)
        .where(inArray(sources.id, sourceIdsOf(widget.id)))
        .all()
      const byId = new Map(sourceRows.map((row) => [row.id, row]))

      const rows =
        sourceRows.length === 0
          ? []
          : db
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
              .all()

      return c.json({
        widget: { id: widget.id, type: widget.type, title: widget.title },
        items: rows.map(({ seenAt, readAt, ...row }) => {
          const source = byId.get(row.sourceId)
          return {
            ...row,
            sourceName: (source && labels.get(source.key)) || source?.title || null,
            sourceUrl: source?.siteUrl ?? null,
            seen: seenAt !== null,
            read: readAt !== null,
          }
        }),
        sources: sourceRows.map((source) => ({
          id: source.id,
          title: (labels.get(source.key) ?? source.title) || null,
          siteUrl: source.siteUrl,
          lastFetchedAt: source.lastFetchedAt,
          error: source.errorCount > 0 ? (source.lastStatus ?? 'error') : null,
        })),
      })
    })

    .post('/:id/refresh', async (c) => {
      const widget = owned(c.get('userId'), c.req.param('id'))
      return c.json(await refreshSourcesNow(deps, sourceIdsOf(widget.id)))
    })
}
