import { randomUUID } from 'node:crypto'
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import type { SourceKind, WidgetColor, WidgetType } from '@nuenews/shared'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
})

export const dashboards = sqliteTable(
  'dashboards',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('dashboards_user_idx').on(t.userId, t.position)],
)

export const widgets = sqliteTable(
  'widgets',
  {
    id: id(),
    dashboardId: text('dashboard_id')
      .notNull()
      .references(() => dashboards.id, { onDelete: 'cascade' }),
    type: text('type').$type<WidgetType>().notNull(),
    title: text('title').notNull(),
    /** Null: the default card color. */
    color: text('color').$type<WidgetColor>(),
    config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    x: integer('x').notNull().default(0),
    y: integer('y').notNull().default(0),
    w: integer('w').notNull().default(1),
    h: integer('h').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index('widgets_dashboard_idx').on(t.dashboardId)],
)

/** Shared between users: one fetch serves every widget that points at the same source. */
export const sources = sqliteTable(
  'sources',
  {
    id: id(),
    kind: text('kind').$type<SourceKind>().notNull(),
    /** Canonical feed URL, YouTube channel id or RoyalRoad fiction id. */
    key: text('key').notNull(),
    title: text('title'),
    siteUrl: text('site_url'),
    faviconUrl: text('favicon_url'),
    intervalMin: integer('interval_min').notNull().default(30),
    etag: text('etag'),
    lastModified: text('last_modified'),
    lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp_ms' }),
    nextFetchAt: integer('next_fetch_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    lastStatus: text('last_status'),
    errorCount: integer('error_count').notNull().default(0),
  },
  (t) => [
    uniqueIndex('sources_kind_key_uq').on(t.kind, t.key),
    index('sources_next_fetch_idx').on(t.nextFetchAt),
  ],
)

export const widgetSources = sqliteTable(
  'widget_sources',
  {
    widgetId: text('widget_id')
      .notNull()
      .references(() => widgets.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.widgetId, t.sourceId] })],
)

export const items = sqliteTable(
  'items',
  {
    id: id(),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull(),
    excerpt: text('excerpt'),
    imageUrl: text('image_url'),
    author: text('author'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }).notNull(),
    fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
    meta: text('meta', { mode: 'json' }).$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('items_source_external_uq').on(t.sourceId, t.externalId),
    index('items_source_published_idx').on(t.sourceId, t.publishedAt),
  ],
)

export const itemState = sqliteTable(
  'item_state',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    itemId: text('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    seenAt: integer('seen_at', { mode: 'timestamp_ms' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
)

export const weatherCache = sqliteTable('weather_cache', {
  /** Rounded "lat,lon,units". */
  key: text('key').primaryKey(),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  fetchedAt: integer('fetched_at', { mode: 'timestamp_ms' }).notNull(),
})

export const credentials = sqliteTable(
  'credentials',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    encryptedBlob: text('encrypted_blob').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('credentials_user_provider_uq').on(t.userId, t.provider)],
)
