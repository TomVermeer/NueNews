import { z } from 'zod'
import type { GeocodeResult, WeatherSnapshot } from '@nuenews/shared'
import { ProviderError } from '../providers/errors'
import { describeWeatherCode } from './wmo'

export type Units = 'metric' | 'imperial'

export function forecastUrl(lat: number, lon: number, units: Units): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '5',
    temperature_unit: units === 'imperial' ? 'fahrenheit' : 'celsius',
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({ name: query, count: '5', language: 'en', format: 'json' })
  return `https://geocoding-api.open-meteo.com/v1/search?${params}`
}

const forecastSchema = z.object({
  current: z.object({
    temperature_2m: z.number(),
    weather_code: z.number(),
    is_day: z.number(),
  }),
  daily: z.object({
    time: z.array(z.string()),
    weather_code: z.array(z.number()),
    temperature_2m_max: z.array(z.number()),
    temperature_2m_min: z.array(z.number()),
  }),
})

export function parseForecast(json: unknown): WeatherSnapshot {
  const parsed = forecastSchema.safeParse(json)
  if (!parsed.success) throw new ProviderError('The weather service returned an unexpected answer')
  const { current, daily } = parsed.data

  const now = describeWeatherCode(current.weather_code)
  return {
    current: {
      temperature: Math.round(current.temperature_2m),
      label: now.label,
      icon: now.icon,
      isDay: current.is_day === 1,
    },
    daily: daily.time.map((date, i) => {
      const code = describeWeatherCode(daily.weather_code[i] ?? -1)
      return {
        date,
        min: Math.round(daily.temperature_2m_min[i] ?? 0),
        max: Math.round(daily.temperature_2m_max[i] ?? 0),
        label: code.label,
        icon: code.icon,
      }
    }),
  }
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
