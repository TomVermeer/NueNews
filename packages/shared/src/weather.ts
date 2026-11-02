export type WeatherIcon =
  'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

export interface WeatherDay {
  /** Local date, YYYY-MM-DD. */
  readonly date: string
  readonly min: number
  readonly max: number
  readonly label: string
  readonly icon: WeatherIcon
}

export interface WeatherSnapshot {
  readonly current: {
    readonly temperature: number
    readonly label: string
    readonly icon: WeatherIcon
    readonly isDay: boolean
  }
  readonly daily: readonly WeatherDay[]
}

export interface GeocodeResult {
  readonly name: string
  /** Province or state, when known. */
  readonly region?: string
  readonly country?: string
  readonly lat: number
  readonly lon: number
}

export const WEATHER_ATTRIBUTION = 'Data from MET Norway'
