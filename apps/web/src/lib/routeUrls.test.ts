import { describe, expect, it } from 'vitest'
import { embedUrl, mapsUrl, routeLeg } from './routeUrls'

const leg = {
  origin: 'Amsterdam Centraal',
  destination: 'Utrecht Centraal',
  mode: 'transit',
} as const

describe('routeLeg', () => {
  const route = { origin: 'Home', destination: 'Work', mode: 'walking', extra: 'ignored' } as const

  it('keeps the direction of a route that is not reversed', () => {
    expect(routeLeg(route, false)).toEqual({ origin: 'Home', destination: 'Work', mode: 'walking' })
  })

  it('swaps start and destination for a reversed route and keeps the mode', () => {
    expect(routeLeg(route, true)).toEqual({ origin: 'Work', destination: 'Home', mode: 'walking' })
  })
})

describe('embedUrl', () => {
  const url = new URL(embedUrl('test-key', leg))

  it('points at the Maps Embed API in directions mode', () => {
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/directions')
  })

  it('carries the key, both places and the travel mode', () => {
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: 'test-key',
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      mode: 'transit',
    })
  })

  it('encodes characters that would otherwise change the address', () => {
    const tricky = {
      origin: 'Café & Bar, Sint-Jansstraat 1 #2',
      destination: 'Zürich?x=1',
      mode: 'driving',
    } as const
    const params = new URL(embedUrl('k', tricky)).searchParams

    expect(params.get('origin')).toBe(tricky.origin)
    expect(params.get('destination')).toBe(tricky.destination)
    expect([...params.keys()].sort()).toEqual(['destination', 'key', 'mode', 'origin'])
  })
})

describe('mapsUrl', () => {
  it('opens the same route in Google Maps through its documented link format', () => {
    const url = new URL(mapsUrl(leg))

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      api: '1',
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      travelmode: 'transit',
    })
  })

  it('does not contain the API key', () => {
    expect(mapsUrl(leg)).not.toContain('key=')
  })
})
