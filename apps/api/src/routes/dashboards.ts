import { eq, max } from 'drizzle-orm'
import { Hono } from 'hono'
import {
  createDashboardSchema,
  createWidgetSchema,
  reorderDashboardsSchema,
  saveLayoutSchema,
  updateDashboardSchema,
} from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { dashboards, widgets } from '../db/schema'
import { firstRow, onlyRow } from '../db/query'
import { ApiError, validate } from '../http'
import { requireDashboard, toWidgetDto } from '../services/widgetSources'
import { createWidget, saveLayout } from '../services/widgets'

export function dashboardRoutes(deps: AppDeps) {
  const { db } = deps

  const withWidgets = async (dashboard: typeof dashboards.$inferSelect) => {
    const rows = await db
      .select()
      .from(widgets)
      .where(eq(widgets.dashboardId, dashboard.id))
      .orderBy(widgets.y, widgets.x)
    return {
      id: dashboard.id,
      name: dashboard.name,
      position: dashboard.position,
      widgets: rows.map(toWidgetDto),
    }
  }

  const summary = (dashboard: typeof dashboards.$inferSelect) => ({
    id: dashboard.id,
    name: dashboard.name,
    position: dashboard.position,
  })

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
      c.json(await withWidgets(await requireDashboard(db, c.get('userId'), c.req.param('id')))),
    )

    .patch('/:id', validate('json', updateDashboardSchema), async (c) => {
      const dashboard = await requireDashboard(db, c.get('userId'), c.req.param('id'))
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
      const dashboard = await requireDashboard(db, c.get('userId'), c.req.param('id'))
      await db.delete(dashboards).where(eq(dashboards.id, dashboard.id))
      return c.body(null, 204)
    })

    .put('/:id/layout', validate('json', saveLayoutSchema), async (c) => {
      const dashboard = await requireDashboard(db, c.get('userId'), c.req.param('id'))
      await saveLayout(deps, dashboard.id, c.req.valid('json'))
      return c.json(await withWidgets(dashboard))
    })

    .post('/:id/widgets', validate('json', createWidgetSchema), async (c) => {
      const dashboard = await requireDashboard(db, c.get('userId'), c.req.param('id'))
      return c.json(await createWidget(deps, dashboard.id, c.req.valid('json')), 201)
    })
}
