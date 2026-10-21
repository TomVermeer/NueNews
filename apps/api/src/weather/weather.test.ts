import { readFileSync } from 'node:fs'
import type { Db } from '../db/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HttpClient, HttpResponse } from '../lib/http'
import { freshDb, NOW } from '../test/helpers'
import { ProviderError } from '../providers/errors'
import { forecastUrl, geocodeUrl, parseForecast, parseGeocoding } from './openMeteo'
import { cacheKey, getWeather, searchLocations } from './service'
import { describeWeatherCode } from './wmo'

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')

function respond(body: string, status = 200, headers: Record<string, string> = {}): HttpResponse {
  const map = new Map(Object.entries(headers))
  return { status, headers: { get: (n) => map.get(n.toLowerCase()) ?? null }, url: '', body }
}

describe('describeWeatherCode', () => {
  it.each([
    [0, 'clear', 'Clear sky'],
    [2, 'partly-cloudy', 'Partly cloudy'],
    [3, 'cloudy', 'Overcast'],
    [45, 'fog', 'Fog'],
    [53, 'drizzle', 'Drizzle'],
    [63, 'rain', 'Rain'],
    [80, 'rain', 'Light showers'],
    [75, 'snow', 'Heavy snow'],
    [95, 'thunder', 'Thunderstorm'],
  ])('maps code %i to %s', (code, icon, label) => {
    expect(describeWeatherCode(code)).toEqual({ icon, label })
  })

  it('does not break on codes it does not know', () => {
    expect(describeWeatherCode(1234)).toEqual({ icon: 'cloudy', label: 'Unknown' })
  })
})

describe('Open-Meteo URLs', () => {
  it('asks for the fields we use, in the local timezone, for five days', () => {
    const url = new URL(forecastUrl(52.37, 4.9, 'metric'))
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      latitude: '52.37',
      longitude: '4.9',
      timezone: 'auto',
      forecast_days: '5',
      temperature_unit: 'celsius',
      current: 'temperature_2m,weather_code,is_day',
    })
  })

  it('switches to Fahrenheit for imperial units', () => {
    expect(new URL(forecastUrl(1, 2, 'imperial')).searchParams.get('temperature_unit')).toBe(
      'fahrenheit',
    )
  })

  it('encodes the search text', () => {
    expect(new URL(geocodeUrl('São Paulo & co')).searchParams.get('name')).toBe('São Paulo & co')
  })
})

describe('parseForecast', () => {
  const snapshot = parseForecast(JSON.parse(fixture('forecast.json')))

  it('reads the current conditions', () => {
    expect(snapshot.current).toEqual({
      temperature: 11,
      label: 'Overcast',
      icon: 'cloudy',
      isDay: false,
    })
  })

  it('reads five forecast days with rounded temperatures', () => {
    expect(snapshot.daily).toHaveLength(5)
    expect(snapshot.daily[0]).toEqual({
      date: '2026-10-19',
      min: 10,
      max: 15,
      label: 'Drizzle',
      icon: 'drizzle',
    })
    expect(snapshot.daily[4]).toMatchObject({ date: '2026-10-23', icon: 'rain' })
  })

  it('rejects answers that do not look like a forecast', () => {
    expect(() => parseForecast({ error: true })).toThrow(ProviderError)
  })
})

describe('parseGeocoding', () => {
  it('maps results to names, regions and coordinates', () => {
    const results = parseGeocoding(JSON.parse(fixture('geocoding.json')))
    expect(results[0]).toEqual({
      name: 'Amsterdam',
      region: 'North Holland',
      country: 'Netherlands',
      lat: 52.37403,
      lon: 4.88969,
    })
    expect(results[2]).toMatchObject({ name: 'Amsterdam Village', region: undefined })
  })

  it('returns an empty list when nothing matches', () => {
    expect(parseGeocoding(JSON.parse(fixture('geocoding-empty.json')))).toEqual([])
  })
})

describe('getWeather', () => {
  const place = { lat: 52.3731, lon: 4.8922 }
  let db: Db
  let get: ReturnType<typeof vi.fn<HttpClient['get']>>
  let http: HttpClient
  let clock: Date

  const deps = () => ({ db, http, now: () => clock })

  beforeEach(async () => {
    db = await freshDb()
    clock = NOW
    get = vi.fn<HttpClient['get']>(async () => respond(fixture('forecast.json')))
    http = { get }
  })

  it('fetches and caches the forecast', async () => {
    const result = await getWeather(deps(), place, 'metric')
    expect(result).toMatchObject({ stale: false, fetchedAt: NOW })
    expect(result.snapshot.current.temperature).toBe(11)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('uses rounded coordinates in the request', async () => {
    await getWeather(deps(), place, 'metric')
    const url = new URL(get.mock.calls[0]![0])
    expect(url.searchParams.get('latitude')).toBe('52.37')
    expect(url.searchParams.get('longitude')).toBe('4.89')
  })

  it('serves nearby places and repeat requests from the cache for 30 minutes', async () => {
    await getWeather(deps(), place, 'metric')
    clock = new Date(NOW.getTime() + 29 * 60_000)
    await getWeather(deps(), { lat: 52.3699, lon: 4.8949 }, 'metric') // same rounded spot
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('refreshes after the cache has expired', async () => {
    await getWeather(deps(), place, 'metric')
    clock = new Date(NOW.getTime() + 31 * 60_000)
    const result = await getWeather(deps(), place, 'metric')
    expect(get).toHaveBeenCalledTimes(2)
    expect(result.fetchedAt).toEqual(clock)
  })

  it('keeps separate entries per unit system', async () => {
    await getWeather(deps(), place, 'metric')
    await getWeather(deps(), place, 'imperial')
    expect(get).toHaveBeenCalledTimes(2)
    expect(cacheKey(52.3731, 4.8922, 'imperial')).toBe('52.37,4.89,imperial')
  })

  it('falls back to the old answer, marked stale, when the service fails', async () => {
    await getWeather(deps(), place, 'metric')
    clock = new Date(NOW.getTime() + 60 * 60_000)
    get.mockResolvedValue(respond('', 503))
    const result = await getWeather(deps(), place, 'metric')
    expect(result).toMatchObject({ stale: true, fetchedAt: NOW })
    expect(result.snapshot.current.temperature).toBe(11)
  })

  it('throws when it fails and there is nothing cached', async () => {
    get.mockResolvedValue(respond('', 503, { 'retry-after': '30' }))
    await expect(getWeather(deps(), place, 'metric')).rejects.toMatchObject({
      status: 503,
      retryAfterSeconds: 30,
    })
  })

  it('treats non-JSON answers as a failure', async () => {
    get.mockResolvedValue(respond('<html>oops</html>'))
    await expect(getWeather(deps(), place, 'metric')).rejects.toBeInstanceOf(ProviderError)
  })
})

describe('searchLocations', () => {
  it('queries the geocoding service and parses the answer', async () => {
    const get = vi.fn<HttpClient['get']>(async () => respond(fixture('geocoding.json')))
    const results = await searchLocations({ get }, 'Amsterdam')
    expect(results).toHaveLength(3)
    expect(get.mock.calls[0]![0]).toContain('geocoding-api.open-meteo.com')
  })

  it('reports service errors', async () => {
    const get = vi.fn<HttpClient['get']>(async () => respond('', 500))
    await expect(searchLocations({ get }, 'x')).rejects.toBeInstanceOf(ProviderError)
  })
})
