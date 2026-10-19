import type { InferResponseType } from 'hono/client'
import type { api } from './client'

/** Response types come from the API's own route definitions, so they cannot drift. */
export type DashboardSummary = InferResponseType<
  typeof api.dashboards.$get,
  200
>['dashboards'][number]
export type DashboardDetail = InferResponseType<(typeof api.dashboards)[':id']['$get'], 200>
export type WidgetDto = DashboardDetail['widgets'][number]
export type WidgetData = InferResponseType<(typeof api.widgets)[':id']['data']['$get'], 200>

type Has<T, K extends string> = T extends Record<K, unknown> ? T : never
export type FeedData = Has<WidgetData, 'items'>
export type WeatherData = Has<WidgetData, 'daily'>
export type FeedItem = FeedData['items'][number]

export const isFeedData = (data: WidgetData): data is FeedData => 'items' in data
export const isWeatherData = (data: WidgetData): data is WeatherData => 'daily' in data
