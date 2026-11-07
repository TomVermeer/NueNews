import { Hono } from 'hono'
import { z } from 'zod'
import { widgetConfigSchemas, widgetTypeSchema } from '@nuenews/shared'
import type { AppDeps, Env } from '../context'
import { availableWidgetTypes, DEFAULT_SIZE } from '../services/widgetSources'

export function widgetTypeRoutes(deps: AppDeps) {
  const available = availableWidgetTypes(deps)
  return new Hono<Env>().get('/', (c) =>
    c.json({
      types: widgetTypeSchema.options.map((type) => ({
        type,
        available: available.includes(type),
        defaultSize: DEFAULT_SIZE[type],
        configSchema: z.toJSONSchema(widgetConfigSchemas[type], { io: 'input' }),
      })),
    }),
  )
}
