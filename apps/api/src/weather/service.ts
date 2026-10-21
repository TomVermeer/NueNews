import { eq } from 'drizzle-orm'
import type { GeocodeResult, WeatherSnapshot } from '@nuenews/shared'
import type { Db } from '../db/client'
import { firstRow } from '../db/query'
import { weatherCache } from '../db/schema'
import type { HttpClient } from '../lib/http'
import { parseRetryAfter, ProviderError } from '../providers/errors'
import { forecastUrl, geocodeUrl, parseForecast, parseGeocoding, type Units } from './openMeteo'

export interface WeatherDeps {
  db: Db
  http: HttpClient
  now: () => Date
}

export interface WeatherResult {
  snapshot: WeatherSnapshot
  fetchedAt: Date
  /** True when the weather service failed and an older answer is being shown. */
  stale: boolean
}

const CACHE_TTL_MS = 30 * 60_000

async function getJson(http: HttpClient, url: string): Promise<unknown> {
  const res = await http.get(url, { headers: { accept: 'application/json' } })
  if (res.status < 200 || res.status >= 300) {
    throw new ProviderError(`The weather service answered with HTTP ${res.status}`, {
      status: res.status,
      retryAfterSeconds: parseRetryAfter(res.headers.get('retry-after')),
    })
  }
  try {
    return JSON.parse(res.body)
  } catch {
    throw new ProviderError('The weather service returned an unexpected answer')
  }
}

/** Nearby places share a cache entry: coordinates are rounded to about a kilometre. */
export function cacheKey(lat: number, lon: number, units: Units): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)},${units}`
}

/** Current weather and a five day forecast, cached for 30 minutes per rounded location. */
export async function getWeather(
  { db, http, now }: WeatherDeps,
  location: { lat: number; lon: number },
  units: Units,
): Promise<WeatherResult> {
  const key = cacheKey(location.lat, location.lon, units)
  const cached = firstRow(await db.select().from(weatherCache).where(eq(weatherCache.key, key)))
  const asResult = (stale: boolean): WeatherResult => ({
    snapshot: cached!.payload as unknown as WeatherSnapshot,
    fetchedAt: cached!.fetchedAt,
    stale,
  })

  if (cached && now().getTime() - cached.fetchedAt.getTime() < CACHE_TTL_MS) return asResult(false)

  try {
    const snapshot = parseForecast(
      await getJson(
        http,
        forecastUrl(Number(location.lat.toFixed(2)), Number(location.lon.toFixed(2)), units),
      ),
    )
    const fetchedAt = now()
    await db
      .insert(weatherCache)
      .values({ key, payload: snapshot as unknown as Record<string, unknown>, fetchedAt })
      .onConflictDoUpdate({
        target: weatherCache.key,
        set: { payload: snapshot as unknown as Record<string, unknown>, fetchedAt },
      })
    return { snapshot, fetchedAt, stale: false }
  } catch (error) {
    if (cached) return asResult(true)
    throw error
  }
}

export async function searchLocations(http: HttpClient, query: string): Promise<GeocodeResult[]> {
  return parseGeocoding(await getJson(http, geocodeUrl(query)))
}
