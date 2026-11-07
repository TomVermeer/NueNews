import type { RouteMode } from '@nuenews/shared'

/** How each travel mode is named in the UI. */
export const ROUTE_MODE_LABELS: Record<RouteMode, string> = {
  driving: 'Drive',
  bicycling: 'Cycle',
  walking: 'Walk',
  transit: 'Public transport',
}
