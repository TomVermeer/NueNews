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
const fromEpochMs = (value: unknown): Date | null =>
  value === null || value === undefined ? null : new Date(Number(value))
/** SQLite stored JSON columns as text. */
const fromJsonText = (value: unknown): unknown =>
  typeof value === 'string' ? JSON.parse(value) : null
const nullableString = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value)

/** Maps an old user id to the id it gets in Postgres. */
type UserIdOf = (id: unknown) => string

/** How one SQLite table becomes rows of its Postgres table. */
interface TableCopy {
  readonly name: string
  readonly table: PgTable
  readonly convert: (row: Row, userIdOf: UserIdOf) => Row
}

// Parents before children, so the foreign keys hold.
const TABLES: readonly TableCopy[] = [
  {
    name: 'users',
    table: users,
    convert: (row, userIdOf) => ({
      id: userIdOf(row.id),
      email: nullableString(row.email),
      name: String(row.name),
      createdAt: fromEpochMs(row.created_at),
    }),
  },
  {
    name: 'dashboards',
    table: dashboards,
    convert: (row, userIdOf) => ({
      id: String(row.id),
      userId: userIdOf(row.user_id),
      name: String(row.name),
      position: Number(row.position),
      createdAt: fromEpochMs(row.created_at),
    }),
  },
  {
    name: 'widgets',
    table: widgets,
    convert: (row) => ({
      id: String(row.id),
      dashboardId: String(row.dashboard_id),
      type: String(row.type),
      title: String(row.title),
      color: nullableString(row.color),
      config: fromJsonText(row.config),
      x: Number(row.x),
      y: Number(row.y),
      w: Number(row.w),
      h: Number(row.h),
      createdAt: fromEpochMs(row.created_at),
      updatedAt: fromEpochMs(row.updated_at),
    }),
  },
  {
    name: 'sources',
    table: sources,
    convert: (row) => ({
      id: String(row.id),
      kind: String(row.kind),
      key: String(row.key),
      title: nullableString(row.title),
      siteUrl: nullableString(row.site_url),
      faviconUrl: nullableString(row.favicon_url),
      intervalMin: Number(row.interval_min),
      etag: nullableString(row.etag),
      lastModified: nullableString(row.last_modified),
      lastFetchedAt: fromEpochMs(row.last_fetched_at),
      nextFetchAt: fromEpochMs(row.next_fetch_at),
      lastStatus: nullableString(row.last_status),
      errorCount: Number(row.error_count),
    }),
  },
  {
    name: 'widget_sources',
    table: widgetSources,
    convert: (row) => ({
      widgetId: String(row.widget_id),
      sourceId: String(row.source_id),
    }),
  },
  {
    name: 'items',
    table: items,
    convert: (row) => ({
      id: String(row.id),
      sourceId: String(row.source_id),
      externalId: String(row.external_id),
      title: String(row.title),
      url: String(row.url),
      excerpt: nullableString(row.excerpt),
      imageUrl: nullableString(row.image_url),
      author: nullableString(row.author),
      publishedAt: fromEpochMs(row.published_at),
      fetchedAt: fromEpochMs(row.fetched_at),
      meta: fromJsonText(row.meta),
    }),
  },
  {
    name: 'item_state',
    table: itemState,
    convert: (row, userIdOf) => ({
      userId: userIdOf(row.user_id),
      itemId: String(row.item_id),
      seenAt: fromEpochMs(row.seen_at),
      readAt: fromEpochMs(row.read_at),
    }),
  },
  {
    name: 'credentials',
    table: credentials,
    convert: (row, userIdOf) => ({
      id: String(row.id),
      userId: userIdOf(row.user_id),
      provider: String(row.provider),
      encryptedBlob: String(row.encrypted_blob),
      createdAt: fromEpochMs(row.created_at),
    }),
  },
]

/** Copies one table in chunks and returns how many rows it had. */
async function copyTable(
  source: SqliteDatabase,
  db: Db,
  { name, table, convert }: TableCopy,
  userIdOf: UserIdOf,
): Promise<number> {
  const rows = source.prepare<[], Row>(`SELECT * FROM ${name}`).all()
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK).map((row) => convert(row, userIdOf))
    await db.insert(table).values(chunk).onConflictDoNothing()
  }
  return rows.length
}

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
  const userIdOf: UserIdOf = (id) => options.userIdMap?.[String(id)] ?? String(id)
  const counts: Record<string, number> = {}
  for (const copy of TABLES) counts[copy.name] = await copyTable(source, db, copy, userIdOf)
  return counts
}
