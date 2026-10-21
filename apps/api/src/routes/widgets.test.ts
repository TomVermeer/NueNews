import { describe, expect, it } from 'vitest'
import { itemState, sources, widgetSources, widgets } from '../db/schema'
import { ProviderError } from '../providers/errors'
import { createTestApp, item, NOW } from '../test/helpers'

const feedWidget = (urls: string[], extra: Record<string, unknown> = {}) => ({
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

async function widgetWith(
  t: Awaited<ReturnType<typeof createTestApp>>,
  urls: string[],
  extra = {},
) {
  const dashboard = await t.call('POST', '/dashboards', { name: 'Home' })
  const widget = await t.call(
    'POST',
    `/dashboards/${dashboard.body.id}/widgets`,
    feedWidget(urls, extra),
  )
  expect(widget.status).toBe(201)
  return widget.body.id as string
}

describe('GET /widgets/:id/data', () => {
  it('returns the newest items, limited, with source names', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'], { limit: 2 })

    const { status, body } = await t.call('GET', `/widgets/${id}/data`)

    expect(status).toBe(200)
    expect(body.widget).toMatchObject({ id, type: 'feed', title: 'News' })
    expect(body.items.map((i: { title: string }) => i.title)).toEqual([
      'a.example item 3',
      'a.example item 2',
    ])
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
    const dashboard = await t.call('POST', '/dashboards', { name: 'Home' })
    const created = await t.call('POST', `/dashboards/${dashboard.body.id}/widgets`, {
      type: 'feed',
      title: 'Mixed',
      config: {
        sources: [
          { url: 'https://a.example/feed', label: 'Alpha' },
          { url: 'https://b.example/feed' },
        ],
      },
    })
    const { body } = await t.call('GET', `/widgets/${created.body.id}/data`)
    expect(body.items.map((i: { title: string }) => i.title)).toEqual(['From B', 'From A'])
    expect(body.items.map((i: { sourceName: string }) => i.sourceName)).toEqual([
      'Feed title',
      'Alpha',
    ])
    expect(body.sources.map((s: { title: string }) => s.title).sort()).toEqual([
      'Alpha',
      'Feed title',
    ])
  })

  it('reports a source that is failing', async () => {
    const t = await createTestApp({
      fetch: () => {
        throw new ProviderError('The site answered with HTTP 500', { status: 500 })
      },
    })
    const id = await widgetWith(t, ['https://a.example/feed'])
    const { body } = await t.call('GET', `/widgets/${id}/data`)
    expect(body.items).toEqual([])
    expect(body.sources[0].error).toBe('error: The site answered with HTTP 500')
  })

  it('answers 404 for unknown widgets', async () => {
    const t = await createTestApp()
    expect((await t.call('GET', '/widgets/nope/data')).status).toBe(404)
  })
})

describe('item state', () => {
  async function setup() {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    const { body } = await t.call('GET', `/widgets/${id}/data`)
    return { t, id, items: body.items as { id: string; seen: boolean; read: boolean }[] }
  }

  it('marks items seen and read, and shows it in the widget data', async () => {
    const { t, id, items } = await setup()
    const [first, second, third] = items

    expect(
      (await t.call('POST', '/items/state', { ids: [first!.id], action: 'read' })).body,
    ).toEqual({ updated: 1 })
    await t.call('POST', '/items/state', { ids: [second!.id], action: 'seen' })

    const { body } = await t.call('GET', `/widgets/${id}/data`)
    const byId = Object.fromEntries(body.items.map((i: { id: string }) => [i.id, i]))
    expect(byId[first!.id]).toMatchObject({ seen: true, read: true })
    expect(byId[second!.id]).toMatchObject({ seen: true, read: false })
    expect(byId[third!.id]).toMatchObject({ seen: false, read: false })
  })

  it('does not downgrade a read item when it is marked seen again', async () => {
    const { t, id, items } = await setup()
    await t.call('POST', '/items/state', { ids: [items[0]!.id], action: 'read' })
    await t.call('POST', '/items/state', { ids: [items[0]!.id], action: 'seen' })
    const { body } = await t.call('GET', `/widgets/${id}/data`)
    expect(body.items.find((i: { id: string }) => i.id === items[0]!.id)).toMatchObject({
      read: true,
    })
  })

  it('can mark an item unread again', async () => {
    const { t, id, items } = await setup()
    await t.call('POST', '/items/state', { ids: [items[0]!.id], action: 'read' })
    await t.call('POST', '/items/state', { ids: [items[0]!.id], action: 'unread' })
    const { body } = await t.call('GET', `/widgets/${id}/data`)
    expect(body.items.find((i: { id: string }) => i.id === items[0]!.id)).toMatchObject({
      read: false,
    })
  })

  it('ignores unknown item ids and rejects bad requests', async () => {
    const { t } = await setup()
    expect((await t.call('POST', '/items/state', { ids: ['nope'], action: 'read' })).body).toEqual({
      updated: 0,
    })
    expect((await t.call('POST', '/items/state', { ids: [], action: 'read' })).status).toBe(400)
    expect((await t.call('POST', '/items/state', { ids: ['x'], action: 'delete' })).status).toBe(
      400,
    )
  })

  it('stores state per user', async () => {
    const { t, items } = await setup()
    await t.call('POST', '/items/state', { ids: [items[0]!.id], action: 'read' })
    expect(await t.db.select().from(itemState)).toEqual([
      expect.objectContaining({ userId: t.userId, itemId: items[0]!.id }),
    ])
  })
})

describe('PATCH /widgets/:id', () => {
  it('renames a widget', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await t.call('PATCH', `/widgets/${id}`, { title: 'Renamed' })
    expect(res.body).toMatchObject({ id, title: 'Renamed' })
  })

  it('adds and removes sources when the config changes, keeping the shared source rows', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])

    await t.call('PATCH', `/widgets/${id}`, {
      config: { sources: [{ url: 'https://b.example/feed' }] },
    })

    expect(await t.db.select().from(sources)).toHaveLength(2)
    const linked = await t.db.select().from(widgetSources)
    expect(linked).toHaveLength(1)
    const { body } = await t.call('GET', `/widgets/${id}/data`)
    expect(body.items.every((i: { title: string }) => i.title.startsWith('b.example'))).toBe(true)
  })

  it('validates the new config against the widget type', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await t.call('PATCH', `/widgets/${id}`, { config: { sources: [] } })
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_config')
  })

  it('refuses private addresses in a changed config', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    const res = await t.call('PATCH', `/widgets/${id}`, {
      config: { sources: [{ url: 'http://localhost:3000/' }] },
    })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('blocked_url')
  })

  it('needs something to change, and a widget that exists', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect((await t.call('PATCH', `/widgets/${id}`, {})).status).toBe(400)
    expect((await t.call('PATCH', '/widgets/nope', { title: 'x' })).status).toBe(404)
  })
})

describe('widget color', () => {
  it('starts without a color, which means the default card', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    const dashboard = (await t.call('GET', '/dashboards')).body.dashboards[0]
    const detail = await t.call('GET', `/dashboards/${dashboard.id}`)
    expect(detail.body.widgets.find((w: { id: string }) => w.id === id).color).toBeNull()
  })

  it('can be chosen when the widget is created', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const dashboard = await t.call('POST', '/dashboards', { name: 'Home' })
    const res = await t.call('POST', `/dashboards/${dashboard.body.id}/widgets`, {
      ...feedWidget(['https://a.example/feed']),
      color: 'blue',
    })
    expect(res.status).toBe(201)
    expect(res.body.color).toBe('blue')
  })

  it('can be changed on its own, and reset to the default with null', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])

    const set = await t.call('PATCH', `/widgets/${id}`, { color: 'teal' })
    expect(set.status).toBe(200)
    expect(set.body).toMatchObject({ color: 'teal', title: 'News' })

    const renamed = await t.call('PATCH', `/widgets/${id}`, { title: 'Tech' })
    expect(renamed.body).toMatchObject({ color: 'teal', title: 'Tech' })

    const reset = await t.call('PATCH', `/widgets/${id}`, { color: null })
    expect(reset.body.color).toBeNull()
  })

  it('only accepts colors from the palette', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect((await t.call('PATCH', `/widgets/${id}`, { color: '#ff0000' })).status).toBe(400)
    expect((await t.call('PATCH', `/widgets/${id}`, { color: 'chartreuse' })).status).toBe(400)
  })
})

describe('DELETE /widgets/:id', () => {
  it('removes the widget and its links but keeps shared sources', async () => {
    const t = await createTestApp()
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect((await t.call('DELETE', `/widgets/${id}`)).status).toBe(204)
    expect(await t.db.select().from(widgets)).toHaveLength(0)
    expect(await t.db.select().from(widgetSources)).toHaveLength(0)
    expect(await t.db.select().from(sources)).toHaveLength(1)
    expect((await t.call('DELETE', `/widgets/${id}`)).status).toBe(404)
  })
})

describe('POST /widgets/:id/refresh', () => {
  it('skips sources that were fetched very recently', async () => {
    const t = await createTestApp(threeItemsPerSource)
    const id = await widgetWith(t, ['https://a.example/feed'])
    expect(t.fetch).toHaveBeenCalledTimes(1)

    const res = await t.call('POST', `/widgets/${id}/refresh`)
    expect(res.body).toEqual({ refreshed: 0, skipped: 1 })
    expect(t.fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes once the minimum interval has passed', async () => {
    let current = NOW
    const t = await createTestApp(threeItemsPerSource, { now: () => current })
    const id = await widgetWith(t, ['https://a.example/feed'])

    current = new Date(NOW.getTime() + 61_000)
    const res = await t.call('POST', `/widgets/${id}/refresh`)
    expect(res.body).toEqual({ refreshed: 1, skipped: 0 })
    expect(t.fetch).toHaveBeenCalledTimes(2)
  })

  it('answers 404 for unknown widgets', async () => {
    const t = await createTestApp()
    expect((await t.call('POST', '/widgets/nope/refresh')).status).toBe(404)
  })
})
