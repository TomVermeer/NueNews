import { describe, expect, it } from 'vitest'
import { isAfterSwapTime, msUntilNextSwitch } from './routeSchedule'

/** A moment on 5 November 2026 in the local time zone, which is what the swap time refers to. */
const at = (hours: number, minutes = 0, seconds = 0) =>
  new Date(2026, 10, 5, hours, minutes, seconds)

const MINUTE = 60_000
const HOUR = 60 * MINUTE

describe('isAfterSwapTime', () => {
  it('is false until the swap time and true from then on', () => {
    expect(isAfterSwapTime(at(8, 59, 59), '09:00')).toBe(false)
    expect(isAfterSwapTime(at(9, 0), '09:00')).toBe(true)
    expect(isAfterSwapTime(at(23, 59), '09:00')).toBe(true)
  })

  it('counts from midnight, so the early hours are before any later swap time', () => {
    expect(isAfterSwapTime(at(0, 0), '12:30')).toBe(false)
    expect(isAfterSwapTime(at(12, 29), '12:30')).toBe(false)
    expect(isAfterSwapTime(at(12, 30), '12:30')).toBe(true)
  })
})

describe('msUntilNextSwitch', () => {
  it('counts down to the swap time while it is still ahead', () => {
    expect(msUntilNextSwitch(at(9, 0), '12:30')).toBe(3 * HOUR + 30 * MINUTE)
    expect(msUntilNextSwitch(at(12, 29, 30), '12:30')).toBe(30_000)
  })

  it('counts down to midnight, when the route goes back, once the swap time has passed', () => {
    expect(msUntilNextSwitch(at(12, 30), '12:30')).toBe(11 * HOUR + 30 * MINUTE)
    expect(msUntilNextSwitch(at(23, 59, 30), '12:30')).toBe(30_000)
  })
})
