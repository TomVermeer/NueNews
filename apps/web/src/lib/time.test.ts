import { describe, expect, it } from 'vitest'
import { timeAgo } from './time'

const NOW = new Date('2026-02-15T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('timeAgo', () => {
  it.each([
    [10_000, 'just now'],
    [5 * MIN, '5 min ago'],
    [59 * MIN, '59 min ago'],
    [3 * HOUR, '3 h ago'],
    [23 * HOUR, '23 h ago'],
    [30 * HOUR, 'yesterday'],
    [4 * DAY, '4 d ago'],
  ])('describes %i ms ago as "%s"', (ms, expected) => {
    expect(timeAgo(ago(ms), NOW)).toBe(expected)
  })

  it('falls back to a short date for older items', () => {
    expect(timeAgo(ago(30 * DAY), NOW)).toMatch(/Jan/)
  })

  it('accepts Date objects', () => {
    expect(timeAgo(new Date(NOW.getTime() - 2 * HOUR), NOW)).toBe('2 h ago')
  })

  it('returns an empty string for invalid dates', () => {
    expect(timeAgo('not a date', NOW)).toBe('')
  })
})
