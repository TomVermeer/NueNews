import { z } from 'zod'
import {
  feedConfigSchema,
  royalroadConfigSchema,
  weatherConfigSchema,
  youtubeConfigSchema,
} from './widgets'
import { sourceKindSchema } from './items'

/** The dashboard grid has 12 columns. */
export const GRID_COLUMNS = 12

export const layoutSchema = z.object({
  x: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLUMNS - 1),
  y: z.number().int().min(0),
  w: z.number().int().min(1).max(GRID_COLUMNS),
  h: z.number().int().min(1).max(24),
})
export type Layout = z.infer<typeof layoutSchema>

export const createDashboardSchema = z.object({ name: z.string().trim().min(1).max(60) })
export const updateDashboardSchema = createDashboardSchema
export const reorderDashboardsSchema = z.object({ ids: z.array(z.string().min(1)).min(1) })

const widgetBase = {
  title: z.string().trim().min(1).max(80),
  /** Where to place the widget. Omitted: the next free spot at the bottom of the dashboard. */
  layout: layoutSchema.optional(),
}

export const createWidgetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('feed'), config: feedConfigSchema, ...widgetBase }),
  z.object({ type: z.literal('royalroad'), config: royalroadConfigSchema, ...widgetBase }),
  z.object({ type: z.literal('youtube'), config: youtubeConfigSchema, ...widgetBase }),
  z.object({ type: z.literal('weather'), config: weatherConfigSchema, ...widgetBase }),
])
export type CreateWidget = z.infer<typeof createWidgetSchema>

/** Partial update: the widget's type cannot change, so config is validated against its stored type. */
export const updateWidgetSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .refine((body) => body.title !== undefined || body.config !== undefined, {
    message: 'Provide a title or a config',
  })

/** "Save layout": new positions for widgets, plus widgets that were removed in edit mode. */
export const saveLayoutSchema = z.object({
  widgets: z.array(layoutSchema.extend({ id: z.string().min(1) })),
  removed: z.array(z.string().min(1)).default([]),
})

export const itemStateSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(['seen', 'read', 'unread']),
})

export const resolveSourceSchema = z.object({
  kind: sourceKindSchema,
  input: z.string().trim().min(1).max(2000),
})

export interface ApiErrorBody {
  error: { code: string; message: string }
}
