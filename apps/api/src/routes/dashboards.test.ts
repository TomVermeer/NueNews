import { describe, expect, it } from 'vitest'
import type { Layout } from '@nuenews/shared'
import { dashboards, items, sources, users, widgetSources, widgets } from '../db/schema'
import {
  addWidget,
  createTestApp,
  errorOf,
  item,
  newDashboard,
  type CreateWidgetInput,
  type TestApp,
} from '../test/helpers'
import { firstRow } from '../db/query'

const feedWidget = (
  urls: string[],
  extra: { title?: string; layout?: Layout } = {},
): CreateWidgetInput => ({
  type: 'feed',
  title: 'News',
  config: { sources: urls.map((url) => ({ url })) },
  ...extra,
})

async function listDashboards(t: TestApp) {
  const res = await t.client.dashboards.$get()
  expect(res.status).toBe(200)
  return await res.json()
}

describe('dashboards', () => {
  it('starts empty and lists dashboards in creation order', async () => {
    const t = await createTestApp()
    expect(await listDashboards(t)).toEqual({ dashboards: [] })

    await newDashboard(t, 'Home')
    await newDashboard(t, 'Reading')
    const body = await listDashboards(t)
    expect(body.dashboards.map((d) => d.name)).toEqual(['Home', 'Reading'])
    expect(body.dashboards.map((d) => d.position)).toEqual([0, 1])
  })

  it('validates names', async () => {
    const t = await createTestApp()
    const res = await t.client.dashboards.$post({ json: { name: '   ' } })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('invalid_request')
    expect((await t.send('POST', '/dashboards', {})).status).toBe(400)
  })

  it('renames and deletes', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const dashboard = t.client.dashboards[':id']

    const renamed = await dashboard.$patch({ param: { id }, json: { name: 'Dev' } })
    expect(await renamed.json()).toMatchObject({ id, name: 'Dev' })

    expect((await dashboard.$delete({ param: { id } })).status).toBe(204)
    expect((await dashboard.$get({ param: { id } })).status).toBe(404)
  })

  it('returns 404 for dashboards that do not exist', async () => {
    const t = await createTestApp()
    const res = await t.client.dashboards[':id'].$get({ param: { id: 'nope' } })
    expect(res.status).toBe(404)
    expect(await errorOf(res)).toEqual({
      error: { code: 'not_found', message: 'Dashboard not found' },
    })
  })

  it("never exposes another user's dashboard", async () => {
    const t = await createTestApp()
    await t.db.insert(users).values({ id: 'other', name: 'Other' })
    await t.db.insert(dashboards).values({ id: 'theirs', userId: 'other', name: 'Private' })
    const param = { id: 'theirs' }
    const dashboard = t.client.dashboards[':id']

    expect((await listDashboards(t)).dashboards).toEqual([])
    expect((await dashboard.$get({ param })).status).toBe(404)
    expect((await dashboard.$patch({ param, json: { name: 'Mine now' } })).status).toBe(404)
    expect((await dashboard.$delete({ param })).status).toBe(404)
    expect((await addWidget(t, 'theirs', feedWidget(['https://a.example/f']))).status).toBe(404)
    expect(await t.db.select().from(dashboards)).toHaveLength(1)
  })
})

describe('reorder', () => {
  it('saves a new tab order', async () => {
    const t = await createTestApp()
    const a = await newDashboard(t, 'A')
    const b = await newDashboard(t, 'B')
    const c = await newDashboard(t, 'C')

    const res = await t.client.dashboards.reorder.$put({ json: { ids: [c, a, b] } })
    expect(res.status).toBe(200)
    const body = await listDashboards(t)
    expect(body.dashboards.map((d) => d.name)).toEqual(['C', 'A', 'B'])
  })

  it.each([
    ['a missing dashboard', (ids: string[]) => ids.slice(1)],
    ['a duplicate', (ids: string[]) => [ids[0]!, ids[0]!]],
    ['an unknown id', (ids: string[]) => [...ids, 'nope']],
  ])('rejects a list with %s', async (_name, mutate) => {
    const t = await createTestApp()
    const ids = [await newDashboard(t, 'A'), await newDashboard(t, 'B')]
    const res = await t.client.dashboards.reorder.$put({ json: { ids: mutate(ids) } })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('invalid_order')
  })
})

describe('creating widgets', () => {
  it('creates a feed widget, links its source and fills it right away', async () => {
    const t = await createTestApp({
      fetch: (source) => ({
        status: 'ok',
        items: [item(1, { externalId: `${source.key}#1` })],
        title: 'Example',
      }),
    })
    const id = await newDashboard(t)

    const res = await addWidget(t, id, feedWidget(['https://a.example/feed.xml']))

    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({
      type: 'feed',
      title: 'News',
      layout: { x: 0, y: 0, w: 4, h: 6 },
      config: { limit: 5, excerpt: 'compact', showImages: true },
    })
    expect(await t.db.select().from(sources)).toHaveLength(1)
    expect(await t.db.select().from(widgetSources)).toHaveLength(1)
    expect(await t.db.select().from(items)).toHaveLength(1)
    expect(t.fetch).toHaveBeenCalledTimes(1)
  })

  it('stacks new widgets below the existing ones, or honours an explicit layout', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const first = await addWidget(t, id, feedWidget(['https://a.example/f']))
    const second = await addWidget(t, id, feedWidget(['https://b.example/f']))
    const placed = await addWidget(
      t,
      id,
      feedWidget(['https://c.example/f'], { layout: { x: 6, y: 0, w: 6, h: 3 } }),
    )
    expect((await first.json()).layout).toMatchObject({ x: 0, y: 0 })
    expect((await second.json()).layout).toMatchObject({ x: 0, y: 6 })
    expect((await placed.json()).layout).toEqual({ x: 6, y: 0, w: 6, h: 3 })
  })

  it('shares one source between widgets that use the same URL', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    await addWidget(t, id, feedWidget(['https://a.example/f']))
    await addWidget(t, id, feedWidget(['https://a.example/f']))
    expect(await t.db.select().from(sources)).toHaveLength(1)
    expect(await t.db.select().from(widgetSources)).toHaveLength(2)
    expect(t.fetch).toHaveBeenCalledTimes(1) // the second widget reuses the fresh data
  })

  it('creates widgets even when the first fetch fails, and records the error', async () => {
    const t = await createTestApp({
      fetch: () => {
        throw new Error('network down')
      },
    })
    const id = await newDashboard(t)
    const res = await addWidget(t, id, feedWidget(['https://a.example/f']))
    expect(res.status).toBe(201)
    expect(firstRow(await t.db.select().from(sources))).toMatchObject({ errorCount: 1 })
  })

  it('creates a weather widget without sources', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const res = await addWidget(t, id, {
      type: 'weather',
      title: 'Weather',
      config: { location: { name: 'Amsterdam', lat: 52.37, lon: 4.9 } },
    })
    expect(res.status).toBe(201)
    expect((await res.json()).config.units).toBe('metric')
    expect(await t.db.select().from(sources)).toHaveLength(0)
  })

  it('rejects widget types that have no provider yet', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const res = await addWidget(t, id, {
      type: 'royalroad',
      title: 'Chapters',
      config: { fictions: [{ urlOrId: '12345' }] },
    })
    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('widget_type_unavailable')
    expect(await t.db.select().from(widgets)).toHaveLength(0)
  })

  it('rejects invalid configs and unknown types', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const empty = await addWidget(t, id, feedWidget([]))
    expect(empty.status).toBe(400)
    const badUrl = await addWidget(t, id, feedWidget(['not a url']))
    expect(badUrl.status).toBe(400)
    const unknown = await t.send('POST', `/dashboards/${id}/widgets`, {
      type: 'nope',
      title: 'x',
      config: {},
    })
    expect(unknown.status).toBe(400)
    const badLayout = await addWidget(
      t,
      id,
      feedWidget(['https://a.example/f'], { layout: { x: 20, y: 0, w: 4, h: 4 } }),
    )
    expect(badLayout.status).toBe(400)
    expect(await t.db.select().from(widgets)).toHaveLength(0)
  })

  it('refuses feed addresses that point at private networks', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const res = await addWidget(t, id, feedWidget(['http://169.254.169.254/latest']))
    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('blocked_url')
    expect(await t.db.select().from(widgets)).toHaveLength(0)
    expect(await t.db.select().from(sources)).toHaveLength(0)
  })
})

describe('dashboard with widgets', () => {
  it('returns widgets ordered top to bottom', async () => {
    const t = await createTestApp()
    const id = await newDashboard(t)
    await addWidget(t, id, feedWidget(['https://a.example/f'], { title: 'First' }))
    await addWidget(t, id, feedWidget(['https://b.example/f'], { title: 'Second' }))
    const res = await t.client.dashboards[':id'].$get({ param: { id } })
    expect((await res.json()).widgets.map((w) => w.title)).toEqual(['First', 'Second'])
  })
})

describe('saving a layout', () => {
  async function widgetIdOf(response: ReturnType<typeof addWidget>) {
    const created = await response
    expect(created.status).toBe(201)
    return (await created.json()).id
  }

  async function setup() {
    const t = await createTestApp()
    const id = await newDashboard(t)
    const a = await widgetIdOf(addWidget(t, id, feedWidget(['https://a.example/f'])))
    const b = await widgetIdOf(addWidget(t, id, feedWidget(['https://b.example/f'])))
    const saveLayout = t.client.dashboards[':id'].layout.$put
    return { t, id, a, b, saveLayout }
  }

  it('moves and resizes widgets', async () => {
    const { id, a, b, saveLayout } = await setup()
    const res = await saveLayout({
      param: { id },
      json: {
        widgets: [
          { id: a, x: 6, y: 0, w: 6, h: 4 },
          { id: b, x: 0, y: 0, w: 6, h: 4 },
        ],
      },
    })
    expect(res.status).toBe(200)
    const { widgets: saved } = await res.json()
    expect(saved.find((w) => w.id === a)?.layout).toEqual({ x: 6, y: 0, w: 6, h: 4 })
    expect(saved.find((w) => w.id === b)?.layout).toEqual({ x: 0, y: 0, w: 6, h: 4 })
  })

  it('removes widgets that were deleted in edit mode, in the same save', async () => {
    const { t, id, a, b, saveLayout } = await setup()
    const res = await saveLayout({
      param: { id },
      json: {
        widgets: [
          { id: a, x: 0, y: 0, w: 4, h: 4 },
          { id: b, x: 4, y: 0, w: 4, h: 4 },
        ],
        removed: [b],
      },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).widgets.map((w) => w.id)).toEqual([a])
    expect(await t.db.select().from(widgetSources)).toHaveLength(1)
  })

  it('changes nothing when any id is not a widget of this dashboard', async () => {
    const { t, id, a, saveLayout } = await setup()
    const other = await newDashboard(t, 'Other')
    const foreign = await widgetIdOf(addWidget(t, other, feedWidget(['https://c.example/f'])))

    const res = await saveLayout({
      param: { id },
      json: {
        widgets: [
          { id: a, x: 3, y: 3, w: 3, h: 3 },
          { id: foreign, x: 0, y: 0, w: 3, h: 3 },
        ],
      },
    })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('unknown_widget')
    const unchanged = (await t.db.select().from(widgets)).find((w) => w.id === a)
    expect(unchanged).toMatchObject({ x: 0, y: 0 })
  })

  it('validates positions', async () => {
    const { id, a, saveLayout } = await setup()
    const res = await saveLayout({
      param: { id },
      json: { widgets: [{ id: a, x: -1, y: 0, w: 4, h: 4 }] },
    })
    expect(res.status).toBe(400)
  })
})
