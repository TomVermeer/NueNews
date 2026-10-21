import type { WeatherIcon } from '@nuenews/shared'

export interface Description {
  label: string
  icon: WeatherIcon
}

const SKY: Record<string, Description> = {
  clearsky: { label: 'Clear sky', icon: 'clear' },
  fair: { label: 'Mainly clear', icon: 'clear' },
  partlycloudy: { label: 'Partly cloudy', icon: 'partly-cloudy' },
  cloudy: { label: 'Overcast', icon: 'cloudy' },
  fog: { label: 'Fog', icon: 'fog' },
}

const PRECIPITATION = /^(light|heavy)?(rain|sleet|snow)(showers)?$/

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Describes one of MET Norway's symbol codes, such as `lightrainshowers_night` or
 * `heavyrainandthunder`. The day/night suffix is ignored: the icons have no night variants.
 */
export function describeSymbol(code: string): Description {
  const base = code.replace(/_(day|night|polartwilight)$/, '')
  const sky = SKY[base]
  if (sky) return sky
  if (base.includes('thunder')) return { label: 'Thunderstorm', icon: 'thunder' }

  const match = PRECIPITATION.exec(base)
  if (!match) return { label: 'Unknown', icon: 'cloudy' }
  const [, intensity, kind, showers] = match
  const noun = kind === 'rain' && showers ? 'showers' : `${kind}${showers ? ' showers' : ''}`
  return {
    label: capitalize(intensity ? `${intensity} ${noun}` : noun),
    icon: kind === 'snow' ? 'snow' : 'rain',
  }
}
