import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import type { updateWidgetSchema } from '@nuenews/shared'
import { itemState, sources, users, widgetSources, widgets } from '../db/schema'
import { ProviderError } from '../providers/errors'
import {
  addWidget,
  createTestApp,
  errorOf,
  item,
  newDashboard,
  NOW,
  type CreateWidgetInput,
  type TestApp,
} from '../test/helpers'

const feedWidget = (
  urls: string[],
  extra: { limit?: number } = {},
): Extract<CreateWidgetInput, { type: 'feed' }> => ({
  type: 'feed',
  title: 'News',
  config: { sources: urls.map((url) => ({ url })), ...extra },
})

/** A provider where each source returns three items named after its host. */
const threeItemsPerSource = {
  fetch: (source: { key: string }) => ({
    status: 'ok' as const,
    title: new URL(source.key).host,
    items: [1, 2, 3].map((n) =>
      item(n, {
        externalId: `${source.key}#${n}`,
        title: `${new URL(source.key).host} item ${n}`,
        url: `${source.key}/${n}`,
      }),
    ),
  }),
}

async function createdWidgetId(t: TestApp, widget: CreateWidgetInput) {
  const res = await addWidget(t, await newDashboard(t), widget)
  expect(res.status).toBe(201)
  return (await res.json()).id
}

async function widgetWith(t: TestApp, urls: string[], extra: { limit?: number } = {}) {
  return await createdWidgetId(t, feedWidget(urls, extra))
}

/** GET /widgets/:id/data for a feed or YouTube widget, checked to be a 200 with items. */
async function feedData(t: TestApp, id: string) {
  const res = await t.client.widgets[':id'].data.$get({ param: { id } })
  expect(res.status).toBe(200)
  const body = await res.json()
  if (!('items' in body)) throw new Error('Expected feed data, got weather data')
  return body
}

const markItems = (t: TestApp, ids: string[], action: 'seen' | 'read' | 'unread') =>
  t.client.items.state.$post({ json: { ids, action } })

type WidgetPatch = z.input<typeof updateWidgetSchema>

const patchWidget = (t: TestApp, id: string, json: WidgetPatch) =>
  t.client.widgets[':id'].$patch({ param: { id }, json })

describe('GET /widgets/:id/data', () => {
  it('returns the newest items, limited, with source names', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'], { limit: 2 })

    const body = await feedData(t, id)

    expect(body.widget).toMatchObject({ id, type: 'feed', title: 'News' })
    expect(body.items.map((i) => i.title)).toEqual(['a.example item 3', 'a.example item 2'])
    expect(body.items[0]).toMatchObject({
      url: 'https://a.example/feed/3',
      sourceName: 'a.example',
      read: false,
      seen: false,
    })
  })

  it('merges several sources newest first and prefers the label you gave a source', async () => {
    const t = await createTestApp({
      fetch: (source) => ({
        status: 'ok',
        items: source.key.includes('a.example')
          ? [item(5, { externalId: 'a5', title: 'From A' })]
          : [item(9, { externalId: 'b9', title: 'From B' })],
        title: 'Feed title',
      }),
    })
    const id = await createdWidgetId(t, {
      type: 'feed',
      title: 'Mixed',
      config: {
        sources: [
          { url: 'https://a.example/feed', label: 'Alpha' },
          { url: 'https://b.example/feed' },
        ],
      },
    })
    const body = await feedData(t, id)
    expect(body.items.map((i) => i.title)).toEqual(['From B', 'From A'])
    expect(body.items.map((i) => i.sourceName)).toEqual(['Feed title', 'Alpha'])
    expect(body.sources.map((s) => s.title).sort()).toEqual(['Alpha', 'Feed title'])
  })

  it('reports a source that is failing', async () => {
    const t = await createTestApp({
      fetch: () => {
        throw new ProviderError('The site answered with HTTP 500', { status: 500 })
      },
    })
    const id = await widgetWith(t, ['https://a.example/feed'])
    const body = await feedData(t, id)
    expect(body.items).toEqual([])
    expect(body.sources[0]?.error).toBe('error: The site answered with HTTP 500')
  })

  it('answers 404 for unknown widgets', async () => {
    const t = await createTestApp()
    const res = await t.client.widgets[':id'].data.$get({ param: { id: 'nope' } })
    expect(res.status).toBe(404)
  })
})

describe('item state', () => {
  async function setup() {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    const { items } = await feedData(t, id)
    return { t, id, items }
  }

  it('marks items seen and read, and shows it in the widget data', async () => {
    const { t, id, items } = await setup()
    const [first, second, third] = items

    expect(await (await markItems(t, [first!.id], 'read')).json()).toEqual({ updated: 1 })
    await markItems(t, [second!.id], 'seen')

    const body = await feedData(t, id)
    const byId = (itemId: string) => body.items.find((i) => i.id === itemId)
    expect(byId(first!.id)).toMatchObject({ seen: true, read: true })
    expect(byId(second!.id)).toMatchObject({ seen: true, read: false })
    expect(byId(third!.id)).toMatchObject({ seen: false, read: false })
  })

  it('does not downgrade a read item when it is marked seen again', async () => {
    const { t, id, items } = await setup()
    await markItems(t, [items[0]!.id], 'read')
    await markItems(t, [items[0]!.id], 'seen')
    const body = await feedData(t, id)
    expect(body.items.find((i) => i.id === items[0]!.id)).toMatchObject({ read: true })
  })

  it('can mark an item unread again', async () => {
    const { t, id, items } = await setup()
    await markItems(t, [items[0]!.id], 'read')
    await markItems(t, [items[0]!.id], 'unread')
    const body = await feedData(t, id)
    expect(body.items.find((i) => i.id === items[0]!.id)).toMatchObject({ read: false })
  })

  it('ignores unknown item ids and rejects bad requests', async () => {
    const { t } = await setup()
    expect(await (await markItems(t, ['nope'], 'read')).json()).toEqual({ updated: 0 })
    expect((await markItems(t, [], 'read')).status).toBe(400)
    expect((await t.send('POST', '/items/state', { ids: ['x'], action: 'delete' })).status).toBe(
      400,
    )
  })

  it('stores state per user', async () => {
    const { t, items } = await setup()
    await markItems(t, [items[0]!.id], 'read')
    expect(await t.db.select().from(itemState)).toEqual([
      expect.objectContaining({ userId: t.userId, itemId: items[0]!.id }),
    ])
  })

  it("ignores another user's state for the same item", async () => {
    const { t, id, items } = await setup()
    await t.db.insert(users).values({ id: 'other', name: 'Other' })
    await t.db
      .insert(itemState)
      .values({ userId: 'other', itemId: items[0]!.id, seenAt: NOW, readAt: NOW })

    await markItems(t, [items[0]!.id], 'seen')

    const body = await feedData(t, id)
    expect(body.items.find((i) => i.id === items[0]!.id)).toMatchObject({
      seen: true,
      read: false,
    })
    expect(await t.db.select().from(itemState)).toContainEqual(
      expect.objectContaining({ userId: 'other', readAt: NOW }),
    )
  })
})

describe('PATCH /widgets/:id', () => {
  it('renames a widget', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await patchWidget(t, id, { title: 'Renamed' })
    expect(await res.json()).toMatchObject({ id, title: 'Renamed' })
  })

  it('adds and removes sources when the config changes, keeping the shared source rows', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])

    await patchWidget(t, id, { config: { sources: [{ url: 'https://b.example/feed' }] } })

    expect(await t.db.select().from(sources)).toHaveLength(2)
    const linked = await t.db.select().from(widgetSources)
    expect(linked).toHaveLength(1)
    const body = await feedData(t, id)
    expect(body.items.every((i) => i.title.startsWith('b.example'))).toBe(true)
  })

  it('validates the new config against the widget type', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await patchWidget(t, id, { config: { sources: [] } })
    expect(res.status).toBe(400)
    expect((await errorOf(res)).error.code).toBe('invalid_config')
  })

  it('refuses private addresses in a changed config', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await patchWidget(t, id, {
      config: { sources: [{ url: 'http://localhost:3000/' }] },
    })
    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('blocked_url')
  })

  it('needs something to change, and a widget that exists', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect((await t.send('PATCH', `/widgets/${id}`, {})).status).toBe(400)
    expect((await patchWidget(t, 'nope', { title: 'x' })).status).toBe(404)
  })
})

describe('widget color', () => {
  it('starts without a color, which means the default card', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    const list = await (await t.client.dashboards.$get()).json()
    const dashboardId = list.dashboards[0]!.id
    const detail = await t.client.dashboards[':id'].$get({ param: { id: dashboardId } })
    const widget = (await detail.json()).widgets.find((w) => w.id === id)
    expect(widget).toBeDefined()
    expect(widget?.color).toBeNull()
  })

  it('can be chosen when the widget is created', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const res = await addWidget(t, await newDashboard(t), {
      ...feedWidget(['https://a.example/feed']),
      color: 'blue',
    })
    expect(res.status).toBe(201)
    expect((await res.json()).color).toBe('blue')
  })

  it('can be changed on its own, and reset to the default with null', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])

    const set = await patchWidget(t, id, { color: 'teal' })
    expect(set.status).toBe(200)
    expect(await set.json()).toMatchObject({ color: 'teal', title: 'News' })

    const renamed = await patchWidget(t, id, { title: 'Tech' })
    expect(await renamed.json()).toMatchObject({ color: 'teal', title: 'Tech' })

    const reset = await patchWidget(t, id, { color: null })
    expect((await reset.json()).color).toBeNull()
  })

  it('only accepts colors from the palette', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect((await t.send('PATCH', `/widgets/${id}`, { color: '#ff0000' })).status).toBe(400)
    expect((await t.send('PATCH', `/widgets/${id}`, { color: 'chartreuse' })).status).toBe(400)
  })
})

describe('DELETE /widgets/:id', () => {
  it('removes the widget and its links but keeps shared sources', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const remove = () => t.client.widgets[':id'].$delete({ param: { id } })
    expect((await remove()).status).toBe(204)
    expect(await t.db.select().from(widgets)).toHaveLength(0)
    expect(await t.db.select().from(widgetSources)).toHaveLength(0)
    expect(await t.db.select().from(sources)).toHaveLength(1)
    expect((await remove()).status).toBe(404)
  })
})

describe('POST /widgets/:id/refresh', () => {
  const refresh = (t: TestApp, id: string) =>
    t.client.widgets[':id'].refresh.$post({ param: { id } })

  it('skips sources that were fetched very recently', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect(t.fetch).toHaveBeenCalledTimes(1)

    const res = await refresh(t, id)
    expect(await res.json()).toEqual({ refreshed: 0, skipped: 1 })
    expect(t.fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes once the minimum interval has passed', async () => {
    let current = NOW
    const t = await createTestApp(threeItemsPerSource, { now: () => current })
    const id = await widgetWith(t, ['https://a.example/feed'])

    current = new Date(NOW.getTime() + 61_000)
    const res = await refresh(t, id)
    expect(await res.json()).toEqual({ refreshed: 1, skipped: 0 })
    expect(t.fetch).toHaveBeenCalledTimes(2)
  })

  it('answers 404 for unknown widgets', async () => {
    const t = await createTestApp()
    expect((await refresh(t, 'nope')).status).toBe(404)
  })
})
