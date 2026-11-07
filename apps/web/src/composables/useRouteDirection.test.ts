import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRouteDirection } from './useRouteDirection'

/** A moment on 5 November 2026 in the local time zone. */
const setClock = (hours: number, minutes = 0, seconds = 0) =>
  vi.setSystemTime(new Date(2026, 10, 5, hours, minutes, seconds))

const MINUTE = 60_000
const HOUR = 60 * MINUTE

interface Settings {
  reversed: boolean
  autoSwapAt?: string
}

/** The composable running in its own scope, like inside a component, with settings to change. */
function setup(initial: Settings) {
  const settings = ref<Settings>(initial)
  const scope = effectScope()
  const direction = scope.run(() => useRouteDirection(() => settings.value))
  if (!direction) throw new Error('The composable did not start')
  return { settings, direction, stop: () => scope.stop() }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useRouteDirection without an automatic swap', () => {
  it('follows the saved direction', async () => {
    setClock(9)
    const { settings, direction } = setup({ reversed: false })
    expect(direction.reversed.value).toBe(false)
    expect(direction.autoSwap.value).toBe(false)

    settings.value = { reversed: true }
    await nextTick()
    expect(direction.reversed.value).toBe(true)
  })

  it('sets no timer', () => {
    setClock(9)
    setup({ reversed: false })
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('useRouteDirection with an automatic swap', () => {
  it('keeps the saved direction before the swap time and reverses it from then on', () => {
    setClock(9)
    expect(setup({ reversed: false, autoSwapAt: '12:00' }).direction.reversed.value).toBe(false)

    setClock(12)
    expect(setup({ reversed: false, autoSwapAt: '12:00' }).direction.reversed.value).toBe(true)
  })

  it('starts from the other direction when the saved route is already reversed', () => {
    setClock(9)
    expect(setup({ reversed: true, autoSwapAt: '12:00' }).direction.reversed.value).toBe(true)

    setClock(13)
    expect(setup({ reversed: true, autoSwapAt: '12:00' }).direction.reversed.value).toBe(false)
  })

  it('swaps by itself when the clock reaches the swap time', () => {
    setClock(11, 59)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })
    expect(direction.autoSwap.value).toBe(true)
    expect(direction.reversed.value).toBe(false)

    vi.advanceTimersByTime(MINUTE)

    expect(direction.reversed.value).toBe(true)
  })

  it('goes back at midnight and swaps again the next day', () => {
    setClock(23, 0)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })
    expect(direction.reversed.value).toBe(true)

    vi.advanceTimersByTime(HOUR)
    expect(direction.reversed.value).toBe(false)

    vi.advanceTimersByTime(12 * HOUR)
    expect(direction.reversed.value).toBe(true)
  })

  it('reads the clock when a timer fires instead of assuming what time it is', () => {
    setClock(9)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    // The computer slept and woke up the next morning; the timer for 12:00 fires at 03:30.
    vi.setSystemTime(new Date(2026, 10, 6, 0, 30))
    vi.advanceTimersByTime(3 * HOUR)

    expect(direction.reversed.value).toBe(false)
  })

  it('stays in step with the saved direction', async () => {
    setClock(9)
    const { settings, direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    settings.value = { reversed: true, autoSwapAt: '12:00' }
    await nextTick()

    expect(direction.reversed.value).toBe(true)
  })
})

describe('useRouteDirection flip', () => {
  it('reverses the route until the next scheduled switch, then the schedule takes over', () => {
    setClock(9)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    direction.flip()
    expect(direction.reversed.value).toBe(true)

    // At 12:00 the schedule reverses the route itself, so a flip that lingered would undo it.
    vi.advanceTimersByTime(3 * HOUR)
    expect(direction.reversed.value).toBe(true)

    vi.advanceTimersByTime(12 * HOUR)
    expect(direction.reversed.value).toBe(false)
  })

  it('also ends at midnight, the other scheduled switch', () => {
    setClock(13)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })
    expect(direction.reversed.value).toBe(true)

    direction.flip()
    expect(direction.reversed.value).toBe(false)

    vi.advanceTimersByTime(11 * HOUR)
    expect(direction.reversed.value).toBe(false)
  })

  it('lasts through the hours in between', () => {
    setClock(13)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    direction.flip()
    vi.advanceTimersByTime(5 * HOUR)

    expect(direction.reversed.value).toBe(false)
  })

  it('undoes itself when pressed twice', () => {
    setClock(9)
    const { direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    direction.flip()
    direction.flip()

    expect(direction.reversed.value).toBe(false)
  })

  it('is forgotten when the swap time is changed', async () => {
    setClock(9)
    const { settings, direction } = setup({ reversed: false, autoSwapAt: '12:00' })
    direction.flip()

    settings.value = { reversed: false, autoSwapAt: '17:00' }
    await nextTick()

    expect(direction.reversed.value).toBe(false)
  })
})

describe('useRouteDirection timers', () => {
  it('moves to the new swap time when it changes, with only one timer running', async () => {
    setClock(9)
    const { settings, direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    settings.value = { reversed: false, autoSwapAt: '10:00' }
    await nextTick()
    expect(vi.getTimerCount()).toBe(1)

    vi.advanceTimersByTime(HOUR)
    expect(direction.reversed.value).toBe(true)
  })

  it('stops the timer when the automatic swap is switched off', async () => {
    setClock(9)
    const { settings, direction } = setup({ reversed: false, autoSwapAt: '12:00' })

    settings.value = { reversed: false }
    await nextTick()

    expect(vi.getTimerCount()).toBe(0)
    expect(direction.autoSwap.value).toBe(false)
  })

  it('stops the timer when its scope ends', () => {
    setClock(9)
    const { stop } = setup({ reversed: false, autoSwapAt: '12:00' })
    expect(vi.getTimerCount()).toBe(1)

    stop()

    expect(vi.getTimerCount()).toBe(0)
  })
})
