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
import { firstRow, onlyRow } from '../db/query'

async function setup(behaviour: Parameters<typeof fakeProvider>[0]) {
  const db = await freshDb()
  const { provider, fetch } = fakeProvider(behaviour)
  const registry = makeRegistry(provider)
  const { source } = await seedSourceWithWidget(db)
  const deps = { db, registry, ctx: fakeContext() }
  const row = async () => onlyRow(await db.select().from(sources).where(eq(sources.id, source.id)))
  return { db, deps, fetch, source, row }
}

describe('refreshSource', () => {
  it('stores items and cache validators and schedules the next fetch', async () => {
    const { db, deps, source, row } = await setup({
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

    expect(await db.select().from(items)).toHaveLength(2)
    expect(await row()).toMatchObject({
      etag: '"v1"',
      lastModified: 'Sun, 01 Feb 2026 11:00:00 GMT',
      title: 'Example feed',
      siteUrl: 'https://example.com/',
      lastStatus: 'ok',
      errorCount: 0,
    })
    expect((await row()).lastFetchedAt).toEqual(NOW)
    expect((await row()).nextFetchAt).toEqual(new Date(NOW.getTime() + 30 * 60_000))
  })

  it('passes the stored validators to the provider', async () => {
    const { deps, fetch, db, source } = await setup({ fetch: () => ({ status: 'not_modified' }) })
    await db
      .update(sources)
      .set({ etag: '"old"', lastModified: 'yesterday' })
      .where(eq(sources.id, source.id))

    const current = firstRow(await db.select().from(sources).where(eq(sources.id, source.id)))!

    await refreshSource(deps, current, NOW)

    expect(fetch.mock.calls[0]![0]).toMatchObject({ etag: '"old"', lastModified: 'yesterday' })
  })

  it('does not overwrite a title the source already has', async () => {
    const { db, deps, source, row } = await setup({
      fetch: () => ({ status: 'ok', items: [], title: 'New title' }),
    })
    await db.update(sources).set({ title: 'My own title' }).where(eq(sources.id, source.id))
    await refreshSource(deps, firstRow(await db.select().from(sources))!, NOW)
    expect((await row()).title).toBe('My own title')
  })

  it('keeps only the newest items', async () => {
    const { db, deps, source } = await setup({
      fetch: () => ({ status: 'ok', items: [item(1), item(2), item(3), item(4)] }),
    })
    await refreshSource({ ...deps, keepItems: 2 }, source, NOW)
    expect((await listLatestItems(db, [source.id], 10)).map((i) => i.externalId)).toEqual([
      'guid-4',
      'guid-3',
    ])
  })

  it('treats not_modified as a success without touching items', async () => {
    const { db, deps, source, row } = await setup({ fetch: () => ({ status: 'not_modified' }) })
    await expect(refreshSource(deps, source, NOW)).resolves.toBe('not_modified')
    expect(await db.select().from(items)).toHaveLength(0)
    expect(await row()).toMatchObject({ lastStatus: 'not_modified', errorCount: 0 })
    expect((await row()).nextFetchAt).toEqual(new Date(NOW.getTime() + 30 * 60_000))
  })

  it('records errors, counts them and backs off', async () => {
    const { deps, source, row } = await setup({
      fetch: () => {
        throw new ProviderError('The site answered with HTTP 500', { status: 500 })
      },
    })

    await expect(refreshSource(deps, source, NOW)).resolves.toBe('error')
    expect(await row()).toMatchObject({
      errorCount: 1,
      lastStatus: 'error: The site answered with HTTP 500',
    })
    expect((await row()).nextFetchAt).toEqual(new Date(NOW.getTime() + 60 * 60_000))

    await refreshSource(deps, await row(), NOW)
    expect((await row()).errorCount).toBe(2)
    expect((await row()).nextFetchAt).toEqual(new Date(NOW.getTime() + 120 * 60_000))
  })

  it('honours Retry-After and resets the error count after a success', async () => {
    let failing = true
    const { deps, source, row } = await setup({
      fetch: () => {
        if (failing)
          throw new ProviderError('Rate limited', { status: 429, retryAfterSeconds: 4 * 3600 })
        return { status: 'ok', items: [] }
      },
    })
    await refreshSource(deps, source, NOW)
    expect((await row()).nextFetchAt).toEqual(new Date(NOW.getTime() + 4 * 3600_000))

    failing = false
    await refreshSource(deps, await row(), NOW)
    expect(await row()).toMatchObject({ errorCount: 0, lastStatus: 'ok' })
  })

  it('hides the details of unexpected errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { deps, source, row } = await setup({
      fetch: () => {
        throw new Error('database password is hunter2')
      },
    })
    await refreshSource(deps, source, NOW)
    expect((await row()).lastStatus).toBe('error: Unexpected error')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('refreshSource icons', () => {
  async function setupWithIcon(fetchIcon: () => Promise<string | undefined>) {
    const db = await freshDb()
    const { provider } = fakeProvider({ fetch: () => ({ status: 'ok', items: [item(1)] }) })
    const registry = makeRegistry({ ...provider, fetchIcon })
    const { source } = await seedSourceWithWidget(db)
    const row = async () =>
      onlyRow(await db.select().from(sources).where(eq(sources.id, source.id)))
    return { deps: { db, registry, ctx: fakeContext() }, source, row }
  }

  it('stores the icon the provider finds', async () => {
    const { deps, source, row } = await setupWithIcon(async () => 'https://img.example/a.jpg')
    await refreshSource(deps, source, NOW)
    expect((await row()).faviconUrl).toBe('https://img.example/a.jpg')
  })

  it('looks the icon up only once', async () => {
    const fetchIcon = vi.fn(async () => 'https://img.example/a.jpg')
    const { deps, source, row } = await setupWithIcon(fetchIcon)
    await refreshSource(deps, source, NOW)
    await refreshSource(deps, await row(), NOW)
    expect(fetchIcon).toHaveBeenCalledTimes(1)
  })

  it('does not fail the refresh when the icon lookup fails', async () => {
    const { deps, source, row } = await setupWithIcon(async () => {
      throw new Error('boom')
    })
    await expect(refreshSource(deps, source, NOW)).resolves.toBe('ok')
    expect((await row()).faviconUrl).toBeNull()
    expect((await row()).lastStatus).toBe('ok')
  })
})

describe('selectDueSources', () => {
  it('returns due, used sources whose provider exists, oldest first', async () => {
    const db = await freshDb()
    const registry = makeRegistry(fakeProvider().provider)
    const { source: due } = await seedSourceWithWidget(db)

    // not due yet
    await db.insert(sources).values({
      kind: 'rss',
      key: 'https://later.example/feed',
      nextFetchAt: new Date(NOW.getTime() + 1000),
    })

    // due but no widget uses it
    await db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://orphan.example/feed', nextFetchAt: new Date(0) })

    // due and used, but there is no provider for its kind
    const yt = onlyRow(
      await db
        .insert(sources)
        .values({ kind: 'youtube', key: 'UC123', nextFetchAt: new Date(0) })
        .returning(),
    )
    expect(yt.kind).toBe('youtube')

    expect((await selectDueSources(db, registry, NOW, 10)).map((s) => s.id)).toEqual([due.id])
  })

  it('respects the limit', async () => {
    const db = await freshDb()
    const registry = makeRegistry(fakeProvider().provider)
    await seedSourceWithWidget(db)
    expect(await selectDueSources(db, registry, NOW, 0)).toEqual([])
  })
})
