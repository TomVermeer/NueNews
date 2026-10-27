import { Hono } from 'hono'
import { z } from 'zod'
import { widgetConfigSchemas, widgetTypeSchema } from '@nuenews/shared'
import type { Env } from '../context'
import { AVAILABLE_WIDGET_TYPES, DEFAULT_SIZE } from '../services/widgetSources'

export function widgetTypeRoutes() {
  return new Hono<Env>().get('/', (c) =>
    c.json({
      types: widgetTypeSchema.options.map((type) => ({
        type,
        available: AVAILABLE_WIDGET_TYPES.includes(type),
        defaultSize: DEFAULT_SIZE[type],
        configSchema: z.toJSONSchema(widgetConfigSchemas[type], { io: 'input' }),
      })),
    }),
  )
}
