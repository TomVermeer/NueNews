const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 d ago", then a short date. */
export function timeAgo(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diff = now.getTime() - date.getTime()
  if (Number.isNaN(diff)) return ''

  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  if (diff < 2 * DAY) return 'yesterday'
  if (diff < 14 * DAY) return `${Math.floor(diff / DAY)} d ago`
  return date.toLocaleDateString('en', { day: 'numeric', month: 'short' })
}
