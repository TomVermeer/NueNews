import { computed, onScopeDispose, ref, watch, type ComputedRef } from 'vue'
import { isAfterSwapTime, msUntilNextSwitch } from '../lib/routeSchedule'

export interface DirectionSettings {
  /** The direction saved on the widget. */
  readonly reversed: boolean
  /** Local time (HH:MM) from which the route runs the other way, until midnight. */
  readonly autoSwapAt?: string
}

export interface RouteDirection {
  /** Whether the route runs from the destination back to the origin right now. */
  readonly reversed: ComputedRef<boolean>
  readonly autoSwap: ComputedRef<boolean>
  /** Reverses the route until the next scheduled switch. Nothing is saved. */
  flip: () => void
}

/** A timer that fires slightly early must not make the next one fire in a tight loop. */
const MIN_DELAY_MS = 1000

/**
 * The direction of a route: the saved one, turned around from the swap time until midnight. The
 * direction is read from the clock every time a switch is due, so a timer that fires late (the
 * computer slept) still ends up right.
 */
export function useRouteDirection(
  settings: () => DirectionSettings,
  clock: () => Date = () => new Date(),
): RouteDirection {
  const swapTime = () => settings().autoSwapAt
  const phaseNow = () => {
    const at = swapTime()
    return at !== undefined && isAfterSwapTime(clock(), at)
  }

  const afterSwapTime = ref(phaseNow())
  // A flip belongs to the switch period it was made in; the next switch starts a new period.
  const period = ref(0)
  const flippedInPeriod = ref<number | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined

  function startNewPeriod() {
    period.value += 1
  }

  function arm() {
    clearTimeout(timer)
    const at = swapTime()
    if (at === undefined) return
    timer = setTimeout(
      () => {
        const after = phaseNow()
        if (after !== afterSwapTime.value) {
          afterSwapTime.value = after
          startNewPeriod()
        }
        arm()
      },
      Math.max(msUntilNextSwitch(clock(), at), MIN_DELAY_MS),
    )
  }

  watch(
    swapTime,
    () => {
      afterSwapTime.value = phaseNow()
      startNewPeriod()
      arm()
    },
    { immediate: true },
  )
  onScopeDispose(() => clearTimeout(timer))

  const autoSwap = computed(() => swapTime() !== undefined)
  const flipped = computed(() => flippedInPeriod.value === period.value)
  const scheduled = computed(() => settings().reversed !== afterSwapTime.value)

  return {
    reversed: computed(() => scheduled.value !== flipped.value),
    autoSwap,
    flip: () => {
      flippedInPeriod.value = flipped.value ? null : period.value
    },
  }
}
