export type WeatherIcon =
  'clear' | 'partly-cloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunder'

export interface WeatherDay {
  /** Local date, YYYY-MM-DD. */
  date: string
  min: number
  max: number
  label: string
  icon: WeatherIcon
}

export interface WeatherSnapshot {
  current: {
    temperature: number
    label: string
    icon: WeatherIcon
    isDay: boolean
  }
  daily: WeatherDay[]
}

export interface GeocodeResult {
  name: string
  /** Province or state, when known. */
  region?: string
  country?: string
  lat: number
  lon: number
}

export const WEATHER_ATTRIBUTION = 'Weather data by Open-Meteo.com'
