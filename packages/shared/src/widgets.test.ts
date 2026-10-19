import { describe, expect, it } from 'vitest'
import { feedConfigSchema, weatherConfigSchema, widgetConfigSchemas } from './widgets'

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

describe('widgetConfigSchemas', () => {
  it('has a schema for every widget type', () => {
    expect(Object.keys(widgetConfigSchemas).sort()).toEqual([
      'feed',
      'royalroad',
      'weather',
      'youtube',
    ])
  })
})
