import type { Database as SqliteDatabase } from 'better-sqlite3'
import type { PgTable } from 'drizzle-orm/pg-core'
import type { Db } from './client'
import {
  credentials,
  dashboards,
  itemState,
  items,
  sources,
  users,
  widgetSources,
  widgets,
} from './schema'

type Row = Record<string, unknown>

export interface ImportOptions {
  /** Moves the rows of one user to another id, e.g. `{ local: '<supabase user id>' }`. */
  userIdMap?: Record<string, string>
}

const CHUNK = 500

/** SQLite stored timestamps as milliseconds since the epoch. */
const date = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(Number(value))
const json = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : null)
const text = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value)

/**
 * Copies a NueNews SQLite database into Postgres: users, dashboards, widgets, sources, cached
 * items and read state. Safe to run again, rows that already exist are left alone. The weather
 * cache is skipped, it refills itself.
 */
export async function importSqlite(
  source: SqliteDatabase,
  db: Db,
  options: ImportOptions = {},
): Promise<Record<string, number>> {
  const user = (id: unknown) => options.userIdMap?.[String(id)] ?? String(id)
  const counts: Record<string, number> = {}

  async function copy(name: string, table: PgTable, convert: (row: Row) => Row) {
    const rows = source.prepare<[], Row>(`SELECT * FROM ${name}`).all()
    counts[name] = rows.length
    for (let start = 0; start < rows.length; start += CHUNK) {
      const chunk = rows.slice(start, start + CHUNK).map(convert)
      await db.insert(table).values(chunk).onConflictDoNothing()
    }
  }

  // Parents before children, so the foreign keys hold.
  await copy('users', users, (r) => ({
    id: user(r.id),
    email: text(r.email),
    name: String(r.name),
    createdAt: date(r.created_at),
  }))
  await copy('dashboards', dashboards, (r) => ({
    id: String(r.id),
    userId: user(r.user_id),
    name: String(r.name),
    position: Number(r.position),
    createdAt: date(r.created_at),
  }))
  await copy('widgets', widgets, (r) => ({
    id: String(r.id),
    dashboardId: String(r.dashboard_id),
    type: String(r.type),
    title: String(r.title),
    color: text(r.color),
    config: json(r.config),
    x: Number(r.x),
    y: Number(r.y),
    w: Number(r.w),
    h: Number(r.h),
    createdAt: date(r.created_at),
    updatedAt: date(r.updated_at),
  }))
  await copy('sources', sources, (r) => ({
    id: String(r.id),
    kind: String(r.kind),
    key: String(r.key),
    title: text(r.title),
    siteUrl: text(r.site_url),
    faviconUrl: text(r.favicon_url),
    intervalMin: Number(r.interval_min),
    etag: text(r.etag),
    lastModified: text(r.last_modified),
    lastFetchedAt: date(r.last_fetched_at),
    nextFetchAt: date(r.next_fetch_at),
    lastStatus: text(r.last_status),
    errorCount: Number(r.error_count),
  }))
  await copy('widget_sources', widgetSources, (r) => ({
    widgetId: String(r.widget_id),
    sourceId: String(r.source_id),
  }))
  await copy('items', items, (r) => ({
    id: String(r.id),
    sourceId: String(r.source_id),
    externalId: String(r.external_id),
    title: String(r.title),
    url: String(r.url),
    excerpt: text(r.excerpt),
    imageUrl: text(r.image_url),
    author: text(r.author),
    publishedAt: date(r.published_at),
    fetchedAt: date(r.fetched_at),
    meta: json(r.meta),
  }))
  await copy('item_state', itemState, (r) => ({
    userId: user(r.user_id),
    itemId: String(r.item_id),
    seenAt: date(r.seen_at),
    readAt: date(r.read_at),
  }))
  await copy('credentials', credentials, (r) => ({
    id: String(r.id),
    userId: user(r.user_id),
    provider: String(r.provider),
    encryptedBlob: String(r.encrypted_blob),
    createdAt: date(r.created_at),
  }))

  return counts
}
