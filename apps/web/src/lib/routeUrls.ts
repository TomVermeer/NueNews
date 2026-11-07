import type { RouteMode } from '@nuenews/shared'

/** One trip: where it starts, where it ends and how you travel. */
export interface RouteLeg {
  readonly origin: string
  readonly destination: string
  readonly mode: RouteMode
}

/** The trip a widget shows: its route as saved, or the way back when it is reversed. */
export function routeLeg(route: RouteLeg, reversed: boolean): RouteLeg {
  const { origin, destination, mode } = route
  return reversed
    ? { origin: destination, destination: origin, mode }
    : { origin, destination, mode }
}

/** The Maps Embed API names its travel modes the same way the widget config does. */
export function embedUrl(key: string, leg: RouteLeg): string {
  const url = new URL('https://www.google.com/maps/embed/v1/directions')
  url.search = new URLSearchParams({
    key,
    origin: leg.origin,
    destination: leg.destination,
    mode: leg.mode,
  }).toString()
  return url.href
}

/** The same trip on google.com/maps, using Google's documented link format (no key needed). */
export function mapsUrl(leg: RouteLeg): string {
  const url = new URL('https://www.google.com/maps/dir/')
  url.search = new URLSearchParams({
    api: '1',
    origin: leg.origin,
    destination: leg.destination,
    travelmode: leg.mode,
  }).toString()
  return url.href
}
