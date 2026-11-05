import { describe, expect, it } from 'vitest'
import { createWidgetSchema } from './api'
import {
  feedConfigSchema,
  routeConfigSchema,
  weatherConfigSchema,
  widgetConfigSchemas,
} from './widgets'

describe('feedConfigSchema', () => {
  it('applies defaults', () => {
    const config = feedConfigSchema.parse({ sources: [{ url: 'https://example.com/feed.xml' }] })
    expect(config).toMatchObject({
      limit: 5,
      excerpt: 'compact',
      showImages: true,
      unreadDots: false,
      variant: 'cards',
    })
  })

  it('rejects an empty source list', () => {
    expect(feedConfigSchema.safeParse({ sources: [] }).success).toBe(false)
  })

  it('rejects an invalid url', () => {
    expect(feedConfigSchema.safeParse({ sources: [{ url: 'not a url' }] }).success).toBe(false)
  })
})

describe('weatherConfigSchema', () => {
  it('rejects out-of-range coordinates', () => {
    const result = weatherConfigSchema.safeParse({ location: { name: 'X', lat: 91, lon: 0 } })
    expect(result.success).toBe(false)
  })
})

describe('routeConfigSchema', () => {
  const base = { origin: 'Amsterdam Centraal', destination: 'Utrecht Centraal' }

  it('applies defaults', () => {
    expect(routeConfigSchema.parse(base)).toEqual({
      ...base,
      mode: 'driving',
      reversed: false,
    })
  })

  it('trims both addresses', () => {
    const config = routeConfigSchema.parse({ origin: '  Home ', destination: ' Work  ' })
    expect(config).toMatchObject({ origin: 'Home', destination: 'Work' })
  })

  it('rejects an empty origin or destination', () => {
    expect(routeConfigSchema.safeParse({ ...base, origin: '   ' }).success).toBe(false)
    expect(routeConfigSchema.safeParse({ ...base, destination: '' }).success).toBe(false)
  })

  it.each(['driving', 'bicycling', 'walking', 'transit'])('accepts the %s mode', (mode) => {
    expect(routeConfigSchema.parse({ ...base, mode }).mode).toBe(mode)
  })

  it('rejects an unknown mode', () => {
    expect(routeConfigSchema.safeParse({ ...base, mode: 'flying' }).success).toBe(false)
  })

  it.each(['00:00', '08:30', '12:00', '23:59'])('accepts the swap time %s', (autoSwapAt) => {
    expect(routeConfigSchema.parse({ ...base, autoSwapAt }).autoSwapAt).toBe(autoSwapAt)
  })

  it.each(['24:00', '12:60', '9:00', '12', 'noon'])('rejects the swap time %s', (autoSwapAt) => {
    expect(routeConfigSchema.safeParse({ ...base, autoSwapAt }).success).toBe(false)
  })
})

describe('createWidgetSchema', () => {
  it('accepts a route widget', () => {
    const result = createWidgetSchema.safeParse({
      type: 'route',
      title: 'Commute',
      config: { origin: 'Home', destination: 'Work' },
    })
    expect(result.success).toBe(true)
  })
})

describe('widgetConfigSchemas', () => {
  it('has a schema for every widget type', () => {
    expect(Object.keys(widgetConfigSchemas).sort()).toEqual([
      'feed',
      'route',
      'royalroad',
      'weather',
      'youtube',
    ])
  })
})
