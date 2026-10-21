import Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from '../test/helpers'
import type { Db } from './client'
import { importSqlite } from './importSqlite'
import { dashboards, itemState, items, sources, users, widgetSources, widgets } from './schema'

const T0 = Date.UTC(2026, 0, 1, 12)

/** The tables as the SQLite version of NueNews created them. */
function legacyDatabase() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE dashboards (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE widgets (id TEXT PRIMARY KEY, dashboard_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, color TEXT, config TEXT NOT NULL, x INTEGER NOT NULL, y INTEGER NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE sources (id TEXT PRIMARY KEY, kind TEXT NOT NULL, key TEXT NOT NULL, title TEXT, site_url TEXT, favicon_url TEXT, interval_min INTEGER NOT NULL, etag TEXT, last_modified TEXT, last_fetched_at INTEGER, next_fetch_at INTEGER NOT NULL, last_status TEXT, error_count INTEGER NOT NULL);
    CREATE TABLE widget_sources (widget_id TEXT NOT NULL, source_id TEXT NOT NULL);
    CREATE TABLE items (id TEXT PRIMARY KEY, source_id TEXT NOT NULL, external_id TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, excerpt TEXT, image_url TEXT, author TEXT, published_at INTEGER NOT NULL, fetched_at INTEGER NOT NULL, meta TEXT);
    CREATE TABLE item_state (user_id TEXT NOT NULL, item_id TEXT NOT NULL, seen_at INTEGER, read_at INTEGER);
    CREATE TABLE credentials (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, encrypted_blob TEXT NOT NULL, created_at INTEGER NOT NULL);
  `)
  sqlite.prepare('INSERT INTO users VALUES (?, ?, ?, ?)').run('local', null, 'Local user', T0)
  sqlite.prepare('INSERT INTO dashboards VALUES (?, ?, ?, ?, ?)').run('d1', 'local', 'Home', 0, T0)
  sqlite
    .prepare('INSERT INTO widgets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run('w1', 'd1', 'feed', 'News', 'blue', '{"limit":5}', 0, 0, 4, 6, T0, T0 + 1000)
  sqlite
    .prepare('INSERT INTO sources VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      's1',
      'rss',
      'https://a.example/f',
      'A',
      'https://a.example/',
      null,
      30,
      '"v1"',
      null,
      T0,
      T0 + 60_000,
      'ok',
      0,
    )
  sqlite.prepare('INSERT INTO widget_sources VALUES (?, ?)').run('w1', 's1')
  sqlite
    .prepare('INSERT INTO items VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'i1',
      's1',
      'guid-1',
      'Headline',
      'https://a.example/1',
      null,
      null,
      null,
      T0,
      T0,
      '{"k":1}',
    )
  sqlite.prepare('INSERT INTO item_state VALUES (?, ?, ?, ?)').run('local', 'i1', T0, null)
  return sqlite
}

let db: Db

beforeEach(async () => {
  db = await freshDb()
})

describe('importSqlite', () => {
  it('copies every table, converting timestamps and JSON', async () => {
    const counts = await importSqlite(legacyDatabase(), db)

    expect(counts).toMatchObject({ users: 1, dashboards: 1, widgets: 1, sources: 1, items: 1 })
    const [widget] = await db.select().from(widgets)
    expect(widget).toMatchObject({
      id: 'w1',
      title: 'News',
      color: 'blue',
      config: { limit: 5 },
      w: 4,
      h: 6,
    })
    expect(widget?.createdAt).toEqual(new Date(T0))
    expect(widget?.updatedAt).toEqual(new Date(T0 + 1000))

    const [source] = await db.select().from(sources)
    expect(source).toMatchObject({ key: 'https://a.example/f', etag: '"v1"', lastStatus: 'ok' })
    expect(source?.lastFetchedAt).toEqual(new Date(T0))

    const [item] = await db.select().from(items)
    expect(item).toMatchObject({ title: 'Headline', meta: { k: 1 } })
    expect(await db.select().from(widgetSources)).toHaveLength(1)
    const [state] = await db.select().from(itemState)
    expect(state?.seenAt).toEqual(new Date(T0))
    expect(state?.readAt).toBeNull()
  })

  it('can give the local user a new id', async () => {
    await importSqlite(legacyDatabase(), db, { userIdMap: { local: 'auth-user-1' } })

    expect((await db.select().from(users)).map((u) => u.id)).toEqual(['auth-user-1'])
    expect((await db.select().from(dashboards)).map((d) => d.userId)).toEqual(['auth-user-1'])
    expect((await db.select().from(itemState)).map((s) => s.userId)).toEqual(['auth-user-1'])
  })

  it('can run again without duplicating anything', async () => {
    await importSqlite(legacyDatabase(), db)
    await importSqlite(legacyDatabase(), db)

    expect(await db.select().from(users)).toHaveLength(1)
    expect(await db.select().from(widgets)).toHaveLength(1)
    expect(await db.select().from(items)).toHaveLength(1)
  })
})
