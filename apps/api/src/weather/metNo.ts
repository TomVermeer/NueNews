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

function symbolOf(entry: Entry): string | undefined {
  const { next_1_hours, next_6_hours, next_12_hours } = entry.data
  return (next_1_hours ?? next_6_hours ?? next_12_hours)?.summary.symbol_code
}

/** The longest forecast window that starts at this entry, which describes the stretch best. */
function daySymbolOf(entry: Entry): string | undefined {
  const { next_6_hours, next_12_hours, next_1_hours } = entry.data
  return (next_6_hours ?? next_12_hours ?? next_1_hours)?.summary.symbol_code
}

function toUnits(celsius: number, units: Units): number {
  return Math.round(units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius)
}

export function parseForecast(json: unknown, lon: number, units: Units): WeatherSnapshot {
  const parsed = forecastSchema.safeParse(json)
  if (!parsed.success) throw new ProviderError('The weather service returned an unexpected answer')
  const series = parsed.data.properties.timeseries
  // The schema requires at least one entry.
  const first = series[0]!

  const symbol = symbolOf(first)
  const now = describeSymbol(symbol ?? '')
  const hour = solarTime(first, lon).getUTCHours()
  const isDay = symbol?.endsWith('_night')
    ? false
    : symbol?.endsWith('_day')
      ? true
      : hour >= 7 && hour < 19

  const byDate = new Map<string, { entry: Entry; hour: number }[]>()
  for (const entry of series) {
    const local = solarTime(entry, lon)
    const date = local.toISOString().slice(0, 10)
    const list = byDate.get(date) ?? []
    list.push({ entry, hour: local.getUTCHours() })
    byDate.set(date, list)
  }

  const daily: WeatherDay[] = [...byDate].slice(0, DAYS).map(([date, list]) => {
    const temperatures = list.map(({ entry }) => entry.data.instant.details.air_temperature)
    // Describe the day by the entry closest to midday that has a longer outlook.
    const midday = list
      .filter(({ entry }) => daySymbolOf(entry))
      .sort((a, b) => Math.abs(a.hour - 12) - Math.abs(b.hour - 12))[0]
    const described = describeSymbol((midday && daySymbolOf(midday.entry)) ?? '')
    return {
      date,
      min: toUnits(Math.min(...temperatures), units),
      max: toUnits(Math.max(...temperatures), units),
      label: described.label,
      icon: described.icon,
    }
  })

  return {
    current: {
      temperature: toUnits(first.data.instant.details.air_temperature, units),
      label: now.label,
      icon: now.icon,
      isDay,
    },
    daily,
  }
}
