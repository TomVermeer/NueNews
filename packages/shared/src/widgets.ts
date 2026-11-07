import { z } from 'zod'

export const feedConfigSchema = z.object({
  sources: z.array(z.object({ url: z.string().url(), label: z.string().optional() })).min(1),
  limit: z.number().int().min(1).max(50).default(5),
  excerpt: z.enum(['none', 'compact', 'expanded']).default('compact'),
  showImages: z.boolean().default(true),
  unreadDots: z.boolean().default(false),
  variant: z.enum(['cards', 'list']).default('cards'),
})

export const royalroadConfigSchema = z.object({
  mode: z.enum(['urls', 'follows']).default('urls'),
  fictions: z.array(z.object({ urlOrId: z.string().min(1) })).default([]),
  limit: z.number().int().min(1).max(50).default(5),
})

export const youtubeConfigSchema = z.object({
  channels: z.array(z.object({ input: z.string().min(1), label: z.string().optional() })).min(1),
  limit: z.number().int().min(1).max(50).default(3),
})

export const weatherConfigSchema = z.object({
  location: z.object({
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
  }),
  units: z.enum(['metric', 'imperial']).default('metric'),
})

/** The names are the ones the Google Maps Embed API uses for its `mode` parameter. */
export const routeModeSchema = z.enum(['driving', 'bicycling', 'walking', 'transit'])

const clockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM')

export const routeConfigSchema = z.object({
  // Free text: Google resolves addresses and place names, so saving never needs the network.
  origin: z.string().trim().min(1).max(200),
  destination: z.string().trim().min(1).max(200),
  mode: routeModeSchema.default('driving'),
  /** True when the route runs from the destination back to the origin. */
  reversed: z.boolean().default(false),
  /** Local time of day (HH:MM) at which the direction flips. Omitted: no automatic swap. */
  autoSwapAt: clockTimeSchema.optional(),
})

export const widgetConfigSchemas = {
  feed: feedConfigSchema,
  royalroad: royalroadConfigSchema,
  youtube: youtubeConfigSchema,
  weather: weatherConfigSchema,
  route: routeConfigSchema,
} as const

export const widgetTypeSchema = z.enum(['feed', 'royalroad', 'youtube', 'weather', 'route'])
export type WidgetType = z.infer<typeof widgetTypeSchema>

export type FeedConfig = z.infer<typeof feedConfigSchema>
export type RoyalRoadConfig = z.infer<typeof royalroadConfigSchema>
export type YouTubeConfig = z.infer<typeof youtubeConfigSchema>
export type WeatherConfig = z.infer<typeof weatherConfigSchema>
export type RouteMode = z.infer<typeof routeModeSchema>
export type RouteConfig = z.infer<typeof routeConfigSchema>
