import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, type Db } from './client'
import { ensureLocalUser, LOCAL_USER_ID } from './seed'
import { dashboards, itemState, items, sources, users, widgetSources, widgets } from './schema'

let db: Db

beforeEach(() => {
  db = createDb(':memory:')
})

function makeDashboardWithWidget() {
  const userId = ensureLocalUser(db)
  const dashboard = db.insert(dashboards).values({ userId, name: 'Home' }).returning().get()
  const widget = db
    .insert(widgets)
    .values({ dashboardId: dashboard.id, type: 'feed', title: 'News', config: {} })
    .returning()
    .get()
  return { userId, dashboard, widget }
}

describe('ensureLocalUser', () => {
  it('creates the local user once and is safe to call repeatedly', () => {
    ensureLocalUser(db)
    ensureLocalUser(db)
    const rows = db.select().from(users).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.id).toBe(LOCAL_USER_ID)
  })
})

describe('foreign keys', () => {
  it('rejects a widget that points at a missing dashboard', () => {
    expect(() =>
      db
        .insert(widgets)
        .values({ dashboardId: 'nope', type: 'feed', title: 'x', config: {} })
        .run(),
    ).toThrow()
  })

  it('deletes widgets and their source links when a dashboard is deleted', () => {
    const { dashboard, widget } = makeDashboardWithWidget()
    const source = db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
      .returning()
      .get()
    db.insert(widgetSources).values({ widgetId: widget.id, sourceId: source.id }).run()

    db.delete(dashboards).where(eq(dashboards.id, dashboard.id)).run()

    expect(db.select().from(widgets).all()).toHaveLength(0)
    expect(db.select().from(widgetSources).all()).toHaveLength(0)
    // Sources are shared, so they stay.
    expect(db.select().from(sources).all()).toHaveLength(1)
  })
})

describe('sources', () => {
  it('enforces one source per kind and key', () => {
    db.insert(sources).values({ kind: 'rss', key: 'https://example.com/feed.xml' }).run()
    expect(() =>
      db.insert(sources).values({ kind: 'rss', key: 'https://example.com/feed.xml' }).run(),
    ).toThrow()
    // Same key under another kind is a different source.
    db.insert(sources).values({ kind: 'youtube', key: 'https://example.com/feed.xml' }).run()
    expect(db.select().from(sources).all()).toHaveLength(2)
  })

  it('applies fetch defaults', () => {
    const source = db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
      .returning()
      .get()
    expect(source).toMatchObject({ intervalMin: 30, errorCount: 0, etag: null })
    expect(source.nextFetchAt).toBeInstanceOf(Date)
  })
})

describe('item state', () => {
  it('is removed when the item or the user is deleted', () => {
    const userId = ensureLocalUser(db)
    const source = db
      .insert(sources)
      .values({ kind: 'rss', key: 'https://example.com/feed.xml' })
      .returning()
      .get()
    const item = db
      .insert(items)
      .values({
        sourceId: source.id,
        externalId: '1',
        title: 'Hello',
        url: 'https://example.com/1',
        publishedAt: new Date(),
      })
      .returning()
      .get()
    db.insert(itemState).values({ userId, itemId: item.id, readAt: new Date() }).run()

    db.delete(items).where(eq(items.id, item.id)).run()
    expect(db.select().from(itemState).all()).toHaveLength(0)
  })
})
