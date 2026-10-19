import { refreshSource, selectDueSources, type RefreshDeps, type SourceRow } from './refresh'

export interface SchedulerOptions extends RefreshDeps {
  now?: () => Date
  /** How often to look for due sources. */
  tickMs?: number
  /** At most this many different hosts are fetched at the same time. */
  maxConcurrentHosts?: number
  /** At most this many sources are started per tick. */
  batchLimit?: number
}

export interface Scheduler {
  /** Runs one polling pass. Resolves with the number of sources that were refreshed. */
  tick(): Promise<number>
  start(): void
  stop(): void
}

/** Groups sources by the site they hit, so one site is never fetched from in parallel. */
function hostOf(source: SourceRow): string {
  if (source.kind === 'rss') {
    try {
      return new URL(source.key).host
    } catch {
      // fall through to the kind
    }
  }
  return source.kind
}

export function groupByHost(list: SourceRow[]): SourceRow[][] {
  const groups = new Map<string, SourceRow[]>()
  for (const source of list) {
    const host = hostOf(source)
    groups.set(host, [...(groups.get(host) ?? []), source])
  }
  return [...groups.values()]
}

async function runWithLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<void> {
  const queue = [...tasks]
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let task = queue.shift(); task; task = queue.shift()) await task()
  })
  await Promise.all(workers)
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const {
    now = () => new Date(),
    tickMs = 60_000,
    maxConcurrentHosts = 4,
    batchLimit = 50,
    ...deps
  } = options
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  async function tick(): Promise<number> {
    if (running) return 0
    running = true
    try {
      const started = now()
      const due = selectDueSources(deps.db, deps.registry, started, batchLimit)
      const tasks = groupByHost(due).map((group) => async () => {
        for (const source of group) await refreshSource(deps, source, now())
      })
      await runWithLimit(tasks, maxConcurrentHosts)
      return due.length
    } finally {
      running = false
    }
  }

  return {
    tick,
    start() {
      if (timer) return
      void tick()
      timer = setInterval(() => void tick(), tickMs)
      timer.unref?.()
    },
    stop() {
      if (timer) clearInterval(timer)
      timer = undefined
    },
  }
}
