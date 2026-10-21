import { and, eq, inArray, max } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  createDashboardSchema,
  createWidgetSchema,
  reorderDashboardsSchema,
  saveLayoutSchema,
  updateDashboardSchema,
  widgetConfigSchemas,
} from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { dashboards, widgets } from '../db/schema'
import { ApiError, notFound, validate } from '../http'
import { refreshSourcesNow } from '../services/refreshNow'
import {
  AVAILABLE_WIDGET_TYPES,
  DEFAULT_SIZE,
  linkWidgetSources,
  nextFreeY,
  ownedDashboard,
  sourceRefsFor,
  toWidgetDto,
} from '../services/widgetSources'

export function dashboardRoutes(deps: AppDeps) {
  const { db } = deps

  const withWidgets = (dashboard: typeof dashboards.$inferSelect) => ({
    id: dashboard.id,
    name: dashboard.name,
    position: dashboard.position,
    widgets: db
      .select()
      .from(widgets)
      .where(eq(widgets.dashboardId, dashboard.id))
      .orderBy(widgets.y, widgets.x)
      .all()
      .map(toWidgetDto),
  })

  const summary = (dashboard: typeof dashboards.$inferSelect) => ({
    id: dashboard.id,
    name: dashboard.name,
    position: dashboard.position,
  })

  const owned = (userId: string, id: string) => {
    const dashboard = ownedDashboard(db, userId, id)
    if (!dashboard) throw notFound('Dashboard')
    return dashboard
  }

  return new Hono<Env>()
    .get('/', (c) => {
      const rows = db
        .select()
        .from(dashboards)
        .where(eq(dashboards.userId, c.get('userId')))
        .orderBy(dashboards.position, dashboards.createdAt)
        .all()
      return c.json({ dashboards: rows.map(summary) })
    })

    .post('/', validate('json', createDashboardSchema), (c) => {
      const userId = c.get('userId')
      const top = db
        .select({ position: max(dashboards.position) })
        .from(dashboards)
        .where(eq(dashboards.userId, userId))
        .get()
      const created = db
        .insert(dashboards)
        .values({
          userId,
          name: c.req.valid('json').name,
          position: (top?.position ?? -1) + 1,
        })
        .returning()
        .get()
      return c.json(summary(created), 201)
    })

    .put('/reorder', validate('json', reorderDashboardsSchema), (c) => {
      const userId = c.get('userId')
      const { ids } = c.req.valid('json')
      const mine = db
        .select({ id: dashboards.id })
        .from(dashboards)
        .where(eq(dashboards.userId, userId))
        .all()
        .map((row) => row.id)

      const sameSet =
        ids.length === mine.length &&
        new Set(ids).size === ids.length &&
        ids.every((id) => mine.includes(id))
      if (!sameSet) {
        throw new ApiError(
          400,
          'invalid_order',
          'The list must contain each of your dashboards exactly once',
        )
      }

      db.transaction(() => {
        ids.forEach((id, position) => {
          db.update(dashboards).set({ position }).where(eq(dashboards.id, id)).run()
        })
      })
      return c.json({ ids })
    })

    .get('/:id', (c) => c.json(withWidgets(owned(c.get('userId'), c.req.param('id')))))

    .patch('/:id', validate('json', updateDashboardSchema), (c) => {
      const dashboard = owned(c.get('userId'), c.req.param('id'))
      const updated = db
        .update(dashboards)
        .set({ name: c.req.valid('json').name })
        .where(eq(dashboards.id, dashboard.id))
        .returning()
        .get()
      return c.json(summary(updated))
    })

    .delete('/:id', (c) => {
      const dashboard = owned(c.get('userId'), c.req.param('id'))
      db.delete(dashboards).where(eq(dashboards.id, dashboard.id)).run()
      return c.body(null, 204)
    })

    .put('/:id/layout', validate('json', saveLayoutSchema), (c) => {
      const dashboard = owned(c.get('userId'), c.req.param('id'))
      const { widgets: positions, removed } = c.req.valid('json')

      const existing = db
        .select({ id: widgets.id })
        .from(widgets)
        .where(eq(widgets.dashboardId, dashboard.id))
        .all()
        .map((row) => row.id)
      const unknown = [...positions.map((p) => p.id), ...removed].filter(
        (id) => !existing.includes(id),
      )
      if (unknown.length > 0) {
        throw new ApiError(
          400,
          'unknown_widget',
          `Not widgets of this dashboard: ${unknown.join(', ')}`,
        )
      }

      const now = deps.now()
      db.transaction(() => {
        if (removed.length > 0) {
          db.delete(widgets)
            .where(and(eq(widgets.dashboardId, dashboard.id), inArray(widgets.id, removed)))
            .run()
        }
        for (const { id, x, y, w, h } of positions.filter((p) => !removed.includes(p.id))) {
          db.update(widgets).set({ x, y, w, h, updatedAt: now }).where(eq(widgets.id, id)).run()
        }
      })
      return c.json(withWidgets(dashboard))
    })

    .post('/:id/widgets', validate('json', createWidgetSchema), async (c) => {
      const dashboard = owned(c.get('userId'), c.req.param('id'))
      const body = c.req.valid('json')

      if (!AVAILABLE_WIDGET_TYPES.includes(body.type)) {
        throw new ApiError(
          422,
          'widget_type_unavailable',
          `The "${body.type}" widget is not available yet`,
        )
      }

      const refs = sourceRefsFor(body.type, body.config)
      const now = deps.now()
      const size = DEFAULT_SIZE[body.type]
      const layout = body.layout ?? { x: 0, y: nextFreeY(db, dashboard.id), ...size }
      const config = widgetConfigSchemas[body.type].parse(body.config)

      const { widget, newSourceIds } = db.transaction(() => {
        const widget = db
          .insert(widgets)
          .values({
            dashboardId: dashboard.id,
            type: body.type,
            title: body.title,
            color: body.color ?? null,
            config,
            ...layout,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
          .get()
        const { newSourceIds } = linkWidgetSources(db, widget.id, refs, now)
        return { widget, newSourceIds }
      })

      // Fill the widget now so it is not empty on first view. Failures are stored on the source.
      await refreshSourcesNow(deps, newSourceIds)
      return c.json(toWidgetDto(widget), 201)
    })
}
