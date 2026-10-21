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
import { firstRow, onlyRow } from '../db/query'
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

  const withWidgets = async (dashboard: typeof dashboards.$inferSelect) => ({
    id: dashboard.id,
    name: dashboard.name,
    position: dashboard.position,
    widgets: (
      await db
        .select()
        .from(widgets)
        .where(eq(widgets.dashboardId, dashboard.id))
        .orderBy(widgets.y, widgets.x)
    ).map(toWidgetDto),
  })

  const summary = (dashboard: typeof dashboards.$inferSelect) => ({
    id: dashboard.id,
    name: dashboard.name,
    position: dashboard.position,
  })

  const owned = async (userId: string, id: string) => {
    const dashboard = await ownedDashboard(db, userId, id)
    if (!dashboard) throw notFound('Dashboard')
    return dashboard
  }

  return new Hono<Env>()
    .get('/', async (c) => {
      const rows = await db
        .select()
        .from(dashboards)
        .where(eq(dashboards.userId, c.get('userId')))
        .orderBy(dashboards.position, dashboards.createdAt)
      return c.json({ dashboards: rows.map(summary) })
    })

    .post('/', validate('json', createDashboardSchema), async (c) => {
      const userId = c.get('userId')
      const top = firstRow(
        await db
          .select({ position: max(dashboards.position) })
          .from(dashboards)
          .where(eq(dashboards.userId, userId)),
      )
      const created = onlyRow(
        await db
          .insert(dashboards)
          .values({
            userId,
            name: c.req.valid('json').name,
            position: (top?.position ?? -1) + 1,
          })
          .returning(),
      )
      return c.json(summary(created), 201)
    })

    .put('/reorder', validate('json', reorderDashboardsSchema), async (c) => {
      const userId = c.get('userId')
      const { ids } = c.req.valid('json')
      const mine = (
        await db.select({ id: dashboards.id }).from(dashboards).where(eq(dashboards.userId, userId))
      ).map((row) => row.id)

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

      await db.transaction(async (tx) => {
        for (const [position, id] of ids.entries()) {
          await tx.update(dashboards).set({ position }).where(eq(dashboards.id, id))
        }
      })
      return c.json({ ids })
    })

    .get('/:id', async (c) =>
      c.json(await withWidgets(await owned(c.get('userId'), c.req.param('id')))),
    )

    .patch('/:id', validate('json', updateDashboardSchema), async (c) => {
      const dashboard = await owned(c.get('userId'), c.req.param('id'))
      const updated = onlyRow(
        await db
          .update(dashboards)
          .set({ name: c.req.valid('json').name })
          .where(eq(dashboards.id, dashboard.id))
          .returning(),
      )
      return c.json(summary(updated))
    })

    .delete('/:id', async (c) => {
      const dashboard = await owned(c.get('userId'), c.req.param('id'))
      await db.delete(dashboards).where(eq(dashboards.id, dashboard.id))
      return c.body(null, 204)
    })

    .put('/:id/layout', validate('json', saveLayoutSchema), async (c) => {
      const dashboard = await owned(c.get('userId'), c.req.param('id'))
      const { widgets: positions, removed } = c.req.valid('json')

      const existing = (
        await db
          .select({ id: widgets.id })
          .from(widgets)
          .where(eq(widgets.dashboardId, dashboard.id))
      ).map((row) => row.id)
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
      await db.transaction(async (tx) => {
        if (removed.length > 0) {
          await tx
            .delete(widgets)
            .where(and(eq(widgets.dashboardId, dashboard.id), inArray(widgets.id, removed)))
        }
        for (const { id, x, y, w, h } of positions.filter((p) => !removed.includes(p.id))) {
          await tx.update(widgets).set({ x, y, w, h, updatedAt: now }).where(eq(widgets.id, id))
        }
      })
      return c.json(await withWidgets(dashboard))
    })

    .post('/:id/widgets', validate('json', createWidgetSchema), async (c) => {
      const dashboard = await owned(c.get('userId'), c.req.param('id'))
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
      const layout = body.layout ?? { x: 0, y: await nextFreeY(db, dashboard.id), ...size }
      const config = widgetConfigSchemas[body.type].parse(body.config)

      const { widget, newSourceIds } = await db.transaction(async (tx) => {
        const widget = onlyRow(
          await tx
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
            .returning(),
        )
        const { newSourceIds } = await linkWidgetSources(tx, widget.id, refs, now)
        return { widget, newSourceIds }
      })

      // Fill the widget now so it is not empty on first view. Failures are stored on the source.
      await refreshSourcesNow(deps, newSourceIds)
      return c.json(toWidgetDto(widget), 201)
    })
}
