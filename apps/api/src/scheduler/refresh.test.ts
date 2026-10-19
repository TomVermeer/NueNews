import { eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { listLatestItems } from '../db/items'
import { items, sources } from '../db/schema'
import { ProviderError } from '../providers/errors'
import {
  fakeContext,
  fakeProvider,
  freshDb,
  item,
  makeRegistry,
  NOW,
  seedSourceWithWidget,
} from '../test/helpers'
import { refreshSource, selectDueSources } from './refresh'

function setup(behaviour: Parameters<typeof fakeProvider>[0]) {
  const db = freshDb()
  const { provider, fetch } = fakeProvider(behaviour)
  const registry = makeRegistry(provider)
  const { source } = seedSourceWithWidget(db)
  const deps = { db, registry, ctx: fakeContext() }
  const row = () => db.select().from(sources).where(eq(sources.id, source.id)).get()!
  return { db, deps, fetch, source, row }
}

describe('refreshSource', () => {
  it('stores items and cache validators and schedules the next fetch', async () => {
    const { db, deps, source, row } = setup({
      fetch: () => ({
        status: 'ok',
        items: [item(1), item(2)],
        etag: '"v1"',
        lastModified: 'Sun, 01 Feb 2026 11:00:00 GMT',
        title: 'Example feed',
        siteUrl: 'https://example.com/',
      }),
    })

    await expect(refreshSource(deps, source, NOW)).resolves.toBe('ok')

    expect(db.select().from(items).all()).toHaveLength(2)
    expect(row()).toMatchObject({
      etag: '"v1"',
      lastModified: 'Sun, 01 Feb 2026 11:00:00 GMT',
      title: 'Example feed',
      siteUrl: 'https://example.com/',
      lastStatus: 'ok',
      errorCount: 0,
    })
    expect(row().lastFetchedAt).toEqual(NOW)
    expect(row().nextFetchAt).toEqual(new Date(NOW.getTime() + 30 * 60_000))
  })

  it('passes the stored validators to the provider', async () => {
    const { deps, fetch, db, source } = setup({ fetch: () => ({ status: 'not_modified' }) })
    db.update(sources)
      .set({ etag: '"old"', lastModified: 'yesterday' })
      .where(eq(sources.id, source.id))
      .run()
    const current = db.select().from(sources).where(eq(sources.id, source.id)).get()!

    await refreshSource(deps, current, NOW)

    expect(fetch.mock.calls[0]![0]).toMatchObject({ etag: '"old"', lastModified: 'yesterday' })
  })

  it('does not overwrite a title the source already has', async () => {
    const { db, deps, source, row } = setup({
      fetch: () => ({ status: 'ok', items: [], title: 'New title' }),
    })
    db.update(sources).set({ title: 'My own title' }).where(eq(sources.id, source.id)).run()
    await refreshSource(deps, db.select().from(sources).get()!, NOW)
    expect(row().title).toBe('My own title')
  })

  it('keeps only the newest items', async () => {
    const { db, deps, source } = setup({
      fetch: () => ({ status: 'ok', items: [item(1), item(2), item(3), item(4)] }),
    })
    await refreshSource({ ...deps, keepItems: 2 }, source, NOW)
    expect(listLatestItems(db, [source.id], 10).map((i) => i.externalId)).toEqual([
      'guid-4',
      'guid-3',
    ])
  })

  it('treats not_modified as a success without touching items', async () => {
    const { db, deps, source, row } = setup({ fetch: () => ({ status: 'not_modified' }) })
    await expect(refreshSource(deps, source, NOW)).resolves.toBe('not_modified')
    expect(db.select().from(items).all()).toHaveLength(0)
    expect(row()).toMatchObject({ lastStatus: 'not_modified', errorCount: 0 })
    expect(row().nextFetchAt).toEqual(new Date(NOW.getTime() + 30 * 60_000))
  })

  it('records errors, counts them and backs off', async () => {
    const { deps, source, row } = setup({
      fetch: () => {
        throw new ProviderError('The site answered with HTTP 500', { status: 500 })
      },
    })

    await expect(refreshSource(deps, source, NOW)).resolves.toBe('error')
    expect(row()).toMatchObject({
      errorCount: 1,
      lastStatus: 'error: The site answered with HTTP 500',
    })
    expect(row().nextFetchAt).toEqual(new Date(NOW.getTime() + 60 * 60_000))

    await refreshSource(deps, row(), NOW)
    expect(row().errorCount).toBe(2)
    expect(row().nextFetchAt).toEqual(new Date(NOW.getTime() + 120 * 60_000))
  })

  it('honours Retry-After and resets the error count after a success', async () => {
    let failing = true
    const { deps, source, row } = setup({
      fetch: () => {
        if (failing)
          throw new ProviderError('Rate limited', { status: 429, retryAfterSeconds: 4 * 3600 })
        return { status: 'ok', items: [] }
      },
    })
    await refreshSource(deps, source, NOW)
    expect(row().nextFetchAt).toEqual(new Date(NOW.getTime() + 4 * 3600_000))

    failing = false
    await refreshSource(deps, row(), NOW)
    expect(row()).toMatchObject({ errorCount: 0, lastStatus: 'ok' })
  })

  it('hides the details of unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, source, row } = setup({
      fetch: () => {
        throw new Error('database password is hunter2')
      },
    })
    await refreshSource(deps, source, NOW)
    expect(row().lastStatus).toBe('error: Unexpected error')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('selectDueSources', () => {
  it('returns due, used sources whose provider exists, oldest first', () => {
    const db = freshDb()
    const registry = makeRegistry(fakeProvider().provider)
    const { source: due } = seedSourceWithWidget(db)

    // not due yet
    db.insert(sources)
      .values({
        kind: 'rss',
        key: 'https://later.example/feed',
        nextFetchAt: new Date(NOW.getTime() + 1000),
      })
      .run()
    // due but no widget uses it
    db.insert(sources)
      .values({ kind: 'rss', key: 'https://orphan.example/feed', nextFetchAt: new Date(0) })
      .run()
    // due and used, but there is no provider for its kind
    const yt = db
      .insert(sources)
      .values({ kind: 'youtube', key: 'UC123', nextFetchAt: new Date(0) })
      .returning()
      .get()
    expect(yt.kind).toBe('youtube')

    expect(selectDueSources(db, registry, NOW, 10).map((s) => s.id)).toEqual([due.id])
  })

  it('respects the limit', () => {
    const db = freshDb()
    const registry = makeRegistry(fakeProvider().provider)
    seedSourceWithWidget(db)
    expect(selectDueSources(db, registry, NOW, 0)).toEqual([])
  })
})
