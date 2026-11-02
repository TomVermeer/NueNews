import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import { testClient } from 'hono/testing'
import { afterAll, expect, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../app'
import type { AppDeps } from '../context'
import type { ApiErrorBody, createWidgetSchema, NormalizedItem, SourceKind } from '@nuenews/shared'
import { createDb, type Database, type Db } from '../db/client'
import { onlyRow } from '../db/query'
import * as schema from '../db/schema'
import { dashboards, sources, widgetSources, widgets } from '../db/schema'
import { ensureLocalUser } from '../db/seed'
import { createRegistry } from '../providers/registry'
import type { FetchContext, FetchResult, Provider, SourceRef } from '../providers/types'

export const NOW = new Date('2026-02-01T12:00:00Z')

export function fakeContext(now: Date = NOW): FetchContext {
  return {
    http: {
      get: async () => {
        throw new Error('The network must not be used in tests')
      },
    },
    now: () => now,
  }
}

export function item(n: number, overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    externalId: `guid-${n}`,
    title: `Item ${n}`,
    url: `https://example.com/${n}`,
    publishedAt: new Date(Date.UTC(2026, 0, n)),
    ...overrides,
  }
}

/** A provider whose fetch and resolve results are scripted per test. */
export function fakeProvider(
  behaviour: {
    fetch?: (source: SourceRef) => Promise<FetchResult> | FetchResult
    resolve?: Provider['resolve']
  } = {},
) {
  const fetch = vi.fn<(source: SourceRef) => Promise<FetchResult> | FetchResult>(
    behaviour.fetch ?? (() => ({ status: 'ok', items: [] })),
  )
  const provider: Provider = {
    kind: 'rss',
    resolve: behaviour.resolve ?? (async (input) => ({ kind: 'rss', key: input })),
    fetch: async (source) => fetch(source),
  }
  return { provider, fetch }
}

export function makeRegistry(provider: Provider) {
  return createRegistry([provider])
}

/** The local user, a dashboard, a widget and one linked source. */
export async function seedSourceWithWidget(
  db: Db,
  overrides: Partial<typeof sources.$inferInsert> = {},
) {
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
  const source = onlyRow(
    await db
      .insert(sources)
      .values({
        kind: 'rss',
        key: 'https://example.com/feed.xml',
        nextFetchAt: new Date(NOW.getTime() - 1000),
        ...overrides,
      })
      .returning(),
  )
  await db.insert(widgetSources).values({ widgetId: widget.id, sourceId: source.id })
  return { userId, dashboard, widget, source }
}

// Starting Postgres (even in-process) takes a moment, so each test file starts one and every test
// begins by emptying it. Test files run in separate workers, so they never share a database.
let shared: Promise<Database> | undefined
const tableNames = Object.values(schema)
  .filter((value) => is(value, PgTable))
  .map((table) => getTableName(table as PgTable))

afterAll(async () => {
  if (shared) await (await shared).close()
})

/** An empty, fully migrated database. */
export async function freshDb(): Promise<Db> {
  shared ??= createDb()
  const { db } = await shared
  await db.execute(
    sql.raw(
      `TRUNCATE ${tableNames.map((name) => `"${name}"`).join(', ')} RESTART IDENTITY CASCADE`,
    ),
  )
  return db
}

/** The whole API on an in-memory database with a scripted provider, fixed clock and no network. */
export async function createTestApp(
  behaviour: Parameters<typeof fakeProvider>[0] = {},
  overrides: Partial<AppDeps> & { registryKinds?: SourceKind[] } = {},
) {
  const db = await freshDb()
  const userId = await ensureLocalUser(db)
  const { provider, fetch } = fakeProvider(behaviour)
  const deps: AppDeps = {
    db,
    registry: createRegistry(
      (overrides.registryKinds ?? ['rss', 'youtube']).map((kind) => ({ ...provider, kind })),
    ),
    fetchContext: fakeContext(),
    now: () => NOW,
    authenticate: async () => ({ id: userId }),
    minRefreshIntervalSec: 60,
    ...overrides,
  }
  delete (deps as { registryKinds?: unknown }).registryKinds
  const app = createApp(deps)

  /**
   * Sends a raw request under /api/v1. Only for input the typed client would refuse to send,
   * such as invalid bodies; everything else goes through `client`.
   */
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    return await app.request(`/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /** The API under /api/v1 as the web app sees it, with response bodies typed from the routes. */
  const client = testClient(app).api.v1

  return { app, db, deps, userId, fetch, client, send }
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>

/** What POST /dashboards/:id/widgets accepts, before defaults are filled in. */
export type CreateWidgetInput = z.input<typeof createWidgetSchema>

/** Creates a dashboard through the API and returns its id. */
export async function newDashboard(t: TestApp, name = 'Home'): Promise<string> {
  const response = await t.client.dashboards.$post({ json: { name } })
  expect(response.status).toBe(201)
  return (await response.json()).id
}

/** POST /dashboards/:id/widgets through the typed client. */
export async function addWidget(t: TestApp, dashboardId: string, widget: CreateWidgetInput) {
  return await t.client.dashboards[':id'].widgets.$post({
    param: { id: dashboardId },
    json: widget,
  })
}

const apiErrorBodySchema = z.strictObject({
  error: z.strictObject({ code: z.string(), message: z.string() }),
})

/** The body of an error response, checked to be exactly the API's `{ error: { code, message } }`. */
export async function errorOf(response: { json(): Promise<unknown> }): Promise<ApiErrorBody> {
  return apiErrorBodySchema.parse(await response.json())
}
