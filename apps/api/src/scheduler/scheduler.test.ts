import { afterEach, describe, expect, it, vi } from 'vitest'
import { dashboards, sources, widgetSources, widgets } from '../db/schema'
import type { Db } from '../db/client'
import {
  fakeContext,
  fakeProvider,
  freshDb,
  makeRegistry,
  NOW,
  seedSourceWithWidget,
} from '../test/helpers'
import { createScheduler, groupByHost } from './scheduler'
import { onlyRow } from '../db/query'

async function addSource(db: Db, widgetId: string, key: string) {
  const source = onlyRow(
    await db
      .insert(sources)
      .values({ kind: 'rss', key, nextFetchAt: new Date(NOW.getTime() - 1000) })
      .returning(),
  )
  await db.insert(widgetSources).values({ widgetId, sourceId: source.id })
  return source
}

afterEach(() => {
  vi.useRealTimers()
})

describe('groupByHost', () => {
  it('puts sources of the same site together', async () => {
    const db = await freshDb()
    const { widget } = await seedSourceWithWidget(db)
    const a = await addSource(db, widget.id, 'https://a.example/1.xml')
    const b = await addSource(db, widget.id, 'https://a.example/2.xml')
    const c = await addSource(db, widget.id, 'https://c.example/feed')
    const groups = groupByHost([a, b, c])
    expect(groups.map((g) => g.map((s) => s.key))).toEqual([
      ['https://a.example/1.xml', 'https://a.example/2.xml'],
      ['https://c.example/feed'],
    ])
  })
})

describe('createScheduler.tick', () => {
  it('refreshes every due source and reports how many', async () => {
    const db = await freshDb()
    const { provider, fetch } = fakeProvider()
    const { widget } = await seedSourceWithWidget(db)
    await addSource(db, widget.id, 'https://other.example/feed')

    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      now: () => NOW,
    })
    await expect(scheduler.tick()).resolves.toBe(2)
    expect(fetch).toHaveBeenCalledTimes(2)

    // Both were rescheduled, so nothing is due now.
    await expect(scheduler.tick()).resolves.toBe(0)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('never fetches from the same host in parallel', async () => {
    const db = await freshDb()
    const { widget } = await seedSourceWithWidget(db)
    await addSource(db, widget.id, 'https://example.com/second.xml')
    await addSource(db, widget.id, 'https://other.example/feed')

    let active = 0
    const activeByHost = new Map<string, number>()
    let maxSameHost = 0
    const { provider } = fakeProvider({
      fetch: async (source) => {
        const host = new URL(source.key).host
        activeByHost.set(host, (activeByHost.get(host) ?? 0) + 1)
        active++
        maxSameHost = Math.max(maxSameHost, activeByHost.get(host)!)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        activeByHost.set(host, activeByHost.get(host)! - 1)
        return { status: 'not_modified' }
      },
    })

    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      now: () => NOW,
    })
    await scheduler.tick()
    expect(maxSameHost).toBe(1)
    expect(active).toBe(0)
  })

  it('keeps going when one source fails', async () => {
    const db = await freshDb()
    const { widget } = await seedSourceWithWidget(db, { key: 'https://bad.example/feed' })
    await addSource(db, widget.id, 'https://good.example/feed')
    const seen: string[] = []
    const { provider } = fakeProvider({
      fetch: (source) => {
        seen.push(source.key)
        if (source.key.includes('bad')) throw new Error('boom')
        return { status: 'not_modified' }
      },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      now: () => NOW,
    })
    await scheduler.tick()
    spy.mockRestore()
    expect(seen.sort()).toEqual(['https://bad.example/feed', 'https://good.example/feed'])
  })

  it('does not start a second pass while one is running', async () => {
    const db = await freshDb()
    await seedSourceWithWidget(db)
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const { provider, fetch } = fakeProvider({
      fetch: async () => (await gate, { status: 'not_modified' }),
    })

    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      now: () => NOW,
    })
    const first = scheduler.tick()
    await expect(scheduler.tick()).resolves.toBe(0)
    release()
    await expect(first).resolves.toBe(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('ignores widgets and dashboards that no longer exist', async () => {
    const db = await freshDb()
    const { dashboard } = await seedSourceWithWidget(db)
    await db.delete(widgets)
    await db.delete(dashboards)
    expect(dashboard).toBeDefined()
    const { provider, fetch } = fakeProvider()
    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      now: () => NOW,
    })
    await expect(scheduler.tick()).resolves.toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('createScheduler.start / stop', () => {
  it('polls immediately and then on an interval, until stopped', async () => {
    vi.useFakeTimers()
    const db = await freshDb()
    await seedSourceWithWidget(db, { intervalMin: 0, nextFetchAt: new Date(0) })
    const { provider, fetch } = fakeProvider()
    const scheduler = createScheduler({
      db,
      registry: makeRegistry(provider),
      ctx: fakeContext(),
      tickMs: 1000,
    })

    scheduler.start()
    scheduler.start() // starting twice must not create a second timer
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetch).toHaveBeenCalledTimes(4) // once at start, then at 1s, 2s and 3s

    scheduler.stop()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
