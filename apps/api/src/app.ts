import { Hono } from 'hono'
import { widgetConfigSchemas } from '@nuenews/shared'

const v1 = new Hono()
  .get('/health', (c) => c.json({ status: 'ok' as const }))
  .get('/widget-types', (c) => c.json({ types: Object.keys(widgetConfigSchemas) }))

export const app = new Hono().route('/api/v1', v1)

export type AppType = typeof app
