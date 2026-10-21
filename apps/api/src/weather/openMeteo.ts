import { z } from 'zod'
import type { GeocodeResult } from '@nuenews/shared'
import { ProviderError } from '../providers/errors'

/** Open-Meteo is only used to look up places. The forecast itself comes from MET Norway. */
export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' })
  return `https://geocoding-api.open-meteo.com/v1/search?${params}`
}

const geocodingSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        admin1: z.string().optional(),
        country: z.string().optional(),
      }),
    )
    .optional(),
})

export function parseGeocoding(json: unknown): GeocodeResult[] {
  const parsed = geocodingSchema.safeParse(json)
  if (!parsed.success) throw new ProviderError('The location service returned an unexpected answer')
  return (parsed.data.results ?? []).map((r) => ({
    name: r.name,
    region: r.admin1,
    country: r.country,
    lat: r.latitude,
    lon: r.longitude,
  }))
}
