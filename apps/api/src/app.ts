import { Hono } from 'hono'
import type { AppDeps, Env } from './context'
import { errorHandler, notFoundHandler } from './http'
import { dashboardRoutes } from './routes/dashboards'
import { geocodeRoutes } from './routes/geocode'
import { itemRoutes } from './routes/items'
import { sourceRoutes } from './routes/sources'
import { widgetRoutes } from './routes/widgets'
import { widgetTypeRoutes } from './routes/widgetTypes'

export function createApp(deps: AppDeps) {
  const v1 = new Hono<Env>()
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .route('/dashboards', dashboardRoutes(deps))
    .route('/widgets', widgetRoutes(deps))
    .route('/geocode', geocodeRoutes(deps))
    .route('/items', itemRoutes(deps))
    .route('/sources', sourceRoutes(deps))
    .route('/widget-types', widgetTypeRoutes())

  return new Hono<Env>()
    .use('*', async (c, next) => {
      c.set('userId', deps.currentUserId())
      await next()
    })
    .onError(errorHandler)
    .notFound(notFoundHandler)
    .route('/api/v1', v1)
}

export type AppType = ReturnType<typeof createApp>
