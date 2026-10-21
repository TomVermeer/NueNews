import type { FeedData, FeedItem, WeatherData, WidgetDto } from '../api/types'

export function feedItem(n: number, overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: `item-${n}`,
    sourceId: 'source-1',
    title: `Headline ${n}`,
    url: `https://example.com/articles/${n}`,
    excerpt: `Excerpt for headline ${n}`,
    imageUrl: `https://img.example.com/${n}.jpg`,
    author: 'Jane Doe',
    publishedAt: '2026-02-01T10:00:00.000Z',
    sourceName: 'Example News',
    sourceUrl: 'https://example.com/',
    sourceIconUrl: null,
    seen: false,
    read: false,
    ...overrides,
  }
}

export function feedData(items: FeedItem[], overrides: Partial<FeedData> = {}): FeedData {
  return {
    widget: { id: 'w1', type: 'feed', title: 'News' },
    items,
    sources: [
      {
        id: 'source-1',
        title: 'Example News',
        siteUrl: null,
        iconUrl: null,
        lastFetchedAt: null,
        error: null,
      },
    ],
    ...overrides,
  } as FeedData
}

export function weatherData(overrides: Partial<WeatherData> = {}): WeatherData {
  return {
    widget: { id: 'w3', type: 'weather', title: 'Weather' },
    location: { name: 'Utrecht', lat: 52.09, lon: 5.12 },
    units: 'metric',
    current: { temperature: 11, label: 'Overcast', icon: 'cloudy', isDay: false },
    daily: [
      { date: '2026-10-19', min: 9, max: 15, label: 'Drizzle', icon: 'drizzle' },
      { date: '2026-10-20', min: 5, max: 14, label: 'Light rain', icon: 'rain' },
      { date: '2026-10-21', min: 6, max: 12, label: 'Clear sky', icon: 'clear' },
      { date: '2026-10-22', min: 4, max: 10, label: 'Snow', icon: 'snow' },
      { date: '2026-10-23', min: 7, max: 13, label: 'Fog', icon: 'fog' },
    ],
    fetchedAt: '2026-02-01T10:00:00.000Z',
    stale: false,
    attribution: 'Weather data by Open-Meteo.com',
    ...overrides,
  } as WeatherData
}

export function widget(id: string, overrides: Partial<WidgetDto> = {}): WidgetDto {
  return {
    id,
    dashboardId: 'd1',
    type: 'feed',
    title: `Widget ${id}`,
    config: {
      sources: [{ url: 'https://example.com/feed.xml' }],
      limit: 5,
      excerpt: 'compact',
      showImages: true,
      unreadDots: false,
      variant: 'cards',
    },
    layout: { x: 0, y: 0, w: 4, h: 6 },
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
    ...overrides,
  } as WidgetDto
}
