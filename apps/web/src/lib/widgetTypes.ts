import { CloudSun, Rss, Youtube } from 'lucide-vue-next'
import type { Component } from 'vue'
import type { WidgetType } from '@nuenews/shared'

export interface WidgetTypeInfo {
  label: string
  description: string
  icon: Component
  defaultTitle: string
}

/** The widget types that can be added today (RoyalRoad is not available yet). */
export const ADDABLE_WIDGET_TYPES = ['feed', 'youtube', 'weather'] as const satisfies WidgetType[]
export type AddableWidgetType = (typeof ADDABLE_WIDGET_TYPES)[number]

export const WIDGET_TYPE_INFO: Record<AddableWidgetType, WidgetTypeInfo> = {
  feed: {
    label: 'Feed list',
    description: 'RSS and Atom feeds, including blogs, news sites and subreddits',
    icon: Rss,
    defaultTitle: 'News',
  },
  youtube: {
    label: 'YouTube channels',
    description: 'Latest uploads from channels you follow',
    icon: Youtube,
    defaultTitle: 'YouTube',
  },
  weather: {
    label: 'Weather',
    description: 'Current conditions and a five day forecast',
    icon: CloudSun,
    defaultTitle: 'Weather',
  },
}

export function widgetIcon(type: WidgetType): Component {
  return WIDGET_TYPE_INFO[type as AddableWidgetType]?.icon ?? Rss
}
