import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import type { AppDeps, Env } from './context'
import { ApiError, errorHandler, notFoundHandler } from './http'
import { dashboardRoutes } from './routes/dashboards'
import { geocodeRoutes } from './routes/geocode'
import { internalRoutes } from './routes/internal'
import { itemRoutes } from './routes/items'
import { sourceRoutes } from './routes/sources'
import { widgetRoutes } from './routes/widgets'
import { widgetTypeRoutes } from './routes/widgetTypes'
import { webRoutes } from './web'

export function createApp(deps: AppDeps) {
  const v1 = new Hono<Env>()
    .get('/health', (c) => c.json({ status: 'ok' as const }))
    .route('/dashboards', dashboardRoutes(deps))
    .route('/widgets', widgetRoutes(deps))
    .route('/geocode', geocodeRoutes(deps))
    .route('/items', itemRoutes(deps))
    .route('/sources', sourceRoutes(deps))
    .route('/widget-types', widgetTypeRoutes())

  const app = new Hono<Env>()
    .use('*', secureHeaders())
    .use('/api/v1/*', async (c, next) => {
      if (c.req.path === '/api/v1/health') return next()
      const user = await deps.authenticate(c.req.raw.headers)
      if (!user) throw new ApiError(401, 'unauthorized', 'Sign in to continue')
      c.set('userId', user.id)
      await next()
    })
    .onError(errorHandler)
    .notFound(notFoundHandler)
    .route('/api/v1', v1)

  if (deps.cron) app.route('/internal', internalRoutes(deps.cron))
  const web = deps.webRoot ? webRoutes(deps.webRoot) : undefined
  if (web) app.route('/', web)
  return app
}

export type AppType = ReturnType<typeof createApp>
