import { describe, expect, it } from 'vitest'
import { nextFetchAfterError, nextFetchAfterSuccess } from './backoff'

const NOW = new Date('2026-02-01T12:00:00Z')
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000)

describe('nextFetchAfterSuccess', () => {
  it('waits one interval', () => {
    expect(nextFetchAfterSuccess(NOW, 30)).toEqual(minutes(30))
  })
})

describe('nextFetchAfterError', () => {
  it('doubles the delay with every consecutive error', () => {
    expect(nextFetchAfterError(NOW, 30, 1)).toEqual(minutes(60))
    expect(nextFetchAfterError(NOW, 30, 2)).toEqual(minutes(120))
    expect(nextFetchAfterError(NOW, 30, 3)).toEqual(minutes(240))
  })

  it('never waits longer than six hours', () => {
    expect(nextFetchAfterError(NOW, 30, 4)).toEqual(minutes(360))
    expect(nextFetchAfterError(NOW, 30, 20)).toEqual(minutes(360))
  })

  it('follows a longer Retry-After hint', () => {
    expect(nextFetchAfterError(NOW, 30, 1, 3 * 3600)).toEqual(minutes(180))
  })

  it('ignores a Retry-After hint that is shorter than the backoff', () => {
    expect(nextFetchAfterError(NOW, 30, 1, 60)).toEqual(minutes(60))
  })

  it('caps absurd Retry-After values at a day', () => {
    expect(nextFetchAfterError(NOW, 30, 1, 10 * 24 * 3600)).toEqual(minutes(24 * 60))
  })
})
