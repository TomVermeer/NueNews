import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { ensureLocalUser, LOCAL_USER_ID } from './seed'
import { dashboards, itemState, items, sources, users, widgetSources, widgets } from './schema'
import { onlyRow } from './query'
import { freshDb } from '../test/helpers'

let db: Db

beforeEach(async () => {
  db = await freshDb()
})

async function makeDashboardWithWidget() {
  const userId = await ensureLocalUser(db)
  const dashboard = onlyRow(
    await db.insert(dashboards).values({ userId, name: 'Home' }).returning(),
  )
  const widget = onlyRow(
    await db
      .insert(widgets)
      .values({ dashboardId: dashboard.id, type: 'feed', title: 'News', config: {} })
      .returning(),
  )
  return { userId, dashboard, widget }
}

describe('ensureLocalUser', () => {
  it('creates the local user once and is safe to call repeatedly', async () => {
    await ensureLocalUser(db)
    await ensureLocalUser(db)
    const rows = await db.select().from(users)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(LOCAL_USER_ID)
  })
})

describe('foreign keys', () => {
  it('rejects a widget that points at a missing dashboard', async () => {
    await expect(
      db.insert(widgets).values({ dashboardId: 'nope', type: 'feed', title: 'x', config: {} }),
    ).rejects.toThrow()
  })

  it('deletes widgets and their source links when a dashboard is deleted', async () => {
    const { dashboard, widget } = await makeDashboardWithWidget()
    const source = onlyRow(
      await db
        .insert(sources)
        .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
        .returning(),
    )
    await db.insert(widgetSources).values({ widgetId: widget.id, sourceId: source.id })

    await db.delete(dashboards).where(eq(dashboards.id, dashboard.id))

    expect(await db.select().from(widgets)).toHaveLength(0)
    expect(await db.select().from(widgetSources)).toHaveLength(0)
    // Sources are shared, so they stay.
    expect(await db.select().from(sources)).toHaveLength(1)
  })
})

describe('sources', () => {
  it('enforces one source per kind and key', async () => {
    await db.insert(sources).values({ kind: 'rss', key: 'https://example.com/feed.xml' })
    await expect(
      db.insert(sources).values({ kind: 'rss', key: 'https://example.com/feed.xml' }),
    ).rejects.toThrow()
    // Same key under another kind is a different source.
    await db.insert(sources).values({ kind: 'youtube', key: 'https://example.com/feed.xml' })
    expect(await db.select().from(sources)).toHaveLength(2)
  })

  it('applies fetch defaults', async () => {
    const source = onlyRow(
      await db
        .insert(sources)
        .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
        .returning(),
    )
    expect(source).toMatchObject({ intervalMin: 30, errorCount: 0, etag: null })
    expect(source.nextFetchAt).toBeInstanceOf(Date)
  })
})

describe('item state', () => {
  it('is removed when the item or the user is deleted', async () => {
    const userId = await ensureLocalUser(db)
    const source = onlyRow(
      await db
        .insert(sources)
        .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
        .returning(),
    )
    const item = onlyRow(
      await db
        .insert(items)
        .values({
          sourceId: source.id,
          externalId: '1',
          title: 'Hello',
          url: 'https://example.com/1',
          publishedAt: new Date(),
        })
        .returning(),
    )
    await db.insert(itemState).values({ userId, itemId: item.id, readAt: new Date() })

    await db.delete(items).where(eq(items.id, item.id))
    expect(await db.select().from(itemState)).toHaveLength(0)
  })
})

describe('row-level security', () => {
  it('is on for every table, so hosted Postgres REST roles see nothing', async () => {
    // Both Postgres drivers (pg and PGlite) answer with { rows }.
    const result = (await db.execute(sql`
      SELECT c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
    `)) as { rows: unknown[] }
    expect(result.rows).toEqual([])
  })
})
