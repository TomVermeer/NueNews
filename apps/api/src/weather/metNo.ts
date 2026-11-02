import { z } from 'zod'
import type { WeatherDay, WeatherSnapshot } from '@nuenews/shared'
import { ProviderError } from '../providers/errors'
import { describeSymbol } from './symbols'

export type Units = 'metric' | 'imperial'

const DAYS = 5
const MS_PER_HOUR = 3_600_000

/** MET Norway accepts at most four decimals; the service rounds to two before it gets here. */
export function forecastUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4) })
  return `https://api.met.no/weatherapi/locationforecast/2.0/compact?${params}`
}

const summarySchema = z.object({ summary: z.object({ symbol_code: z.string() }) })

const forecastSchema = z.object({
  properties: z.object({
    timeseries: z
      .array(
        z.object({
          time: z.string(),
          data: z.object({
            instant: z.object({ details: z.object({ air_temperature: z.number() }) }),
            next_1_hours: summarySchema.optional(),
            next_6_hours: summarySchema.optional(),
            next_12_hours: summarySchema.optional(),
          }),
        }),
      )
      .min(1),
  }),
})

type Entry = z.infer<typeof forecastSchema>['properties']['timeseries'][number]

/** The answer carries no timezone, so days follow local solar time (UTC plus longitude / 15). */
function solarTime(entry: Entry, lon: number): Date {
  return new Date(Date.parse(entry.time) + (lon / 15) * MS_PER_HOUR)
}

type Window = 'next_1_hours' | 'next_6_hours' | 'next_12_hours'

/** The current weather is best told by the shortest forecast window. */
const NOW_WINDOWS: readonly Window[] = ['next_1_hours', 'next_6_hours', 'next_12_hours']
/** A day is best told by the longest window that starts at an entry. */
const DAY_WINDOWS: readonly Window[] = ['next_6_hours', 'next_12_hours', 'next_1_hours']

/** The symbol of the first of `windows` this entry has. */
function symbolOf(entry: Entry, windows: readonly Window[]): string | undefined {
  for (const window of windows) {
    const summary = entry.data[window]
    if (summary) return summary.summary.symbol_code
  }
  return undefined
}

function toUnits(celsius: number, units: Units): number {
  return Math.round(units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius)
}

/** Day or night: the symbol says so when it can, otherwise 07:00 to 19:00 local time is day. */
function isDaytime(symbol: string | undefined, localHour: number): boolean {
  if (symbol?.endsWith('_night')) return false
  if (symbol?.endsWith('_day')) return true
  return localHour >= 7 && localHour < 19
}

function currentWeather(first: Entry, lon: number, units: Units): WeatherSnapshot['current'] {
  const symbol = symbolOf(first, NOW_WINDOWS)
  const { label, icon } = describeSymbol(symbol ?? '')
  return {
    temperature: toUnits(first.data.instant.details.air_temperature, units),
    label,
    icon,
    isDay: isDaytime(symbol, solarTime(first, lon).getUTCHours()),
  }
}

interface TimedEntry {
  readonly entry: Entry
  /** The local hour of the entry. */
  readonly hour: number
}

/** The entries per local date, in the order they come. */
function groupByDate(series: readonly Entry[], lon: number): Map<string, TimedEntry[]> {
  const byDate = new Map<string, TimedEntry[]>()
  for (const entry of series) {
    const local = solarTime(entry, lon)
    const date = local.toISOString().slice(0, 10)
    byDate.set(date, [...(byDate.get(date) ?? []), { entry, hour: local.getUTCHours() }])
  }
  return byDate
}

/** Describes the day by the entry closest to midday that has a symbol. */
function middaySymbol(entries: readonly TimedEntry[]): string | undefined {
  const midday = entries
    .filter(({ entry }) => symbolOf(entry, DAY_WINDOWS))
    .sort((a, b) => Math.abs(a.hour - 12) - Math.abs(b.hour - 12))[0]
  return midday && symbolOf(midday.entry, DAY_WINDOWS)
}

function dayForecast(date: string, entries: readonly TimedEntry[], units: Units): WeatherDay {
  const temperatures = entries.map(({ entry }) => entry.data.instant.details.air_temperature)
  const { label, icon } = describeSymbol(middaySymbol(entries) ?? '')
  return {
    date,
    min: toUnits(Math.min(...temperatures), units),
    max: toUnits(Math.max(...temperatures), units),
    label,
    icon,
  }
}

export function parseForecast(json: unknown, lon: number, units: Units): WeatherSnapshot {
  const parsed = forecastSchema.safeParse(json)
  if (!parsed.success) throw new ProviderError('The weather service returned an unexpected answer')
  const series = parsed.data.properties.timeseries
  // The schema requires at least one entry.
  const first = series[0]!

  const days = [...groupByDate(series, lon)].slice(0, DAYS)
  return {
    current: currentWeather(first, lon, units),
    daily: days.map(([date, entries]) => dayForecast(date, entries, units)),
  }
}
