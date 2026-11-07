const MINUTES_PER_HOUR = 60

/** "09:30" as minutes after midnight. The widget's config schema has checked the format. */
function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * MINUTES_PER_HOUR + minutes
}

/** Whether the local time has reached the swap time today. It is false again after midnight. */
export function isAfterSwapTime(now: Date, swapAt: string): boolean {
  return now.getHours() * MINUTES_PER_HOUR + now.getMinutes() >= minutesOf(swapAt)
}

/** Time until the route next changes direction: at the swap time, or at midnight once past it. */
export function msUntilNextSwitch(now: Date, swapAt: string): number {
  const next = isAfterSwapTime(now, swapAt)
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    : new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, minutesOf(swapAt))
  return next.getTime() - now.getTime()
}
