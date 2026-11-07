import { describe, expect, it } from 'vitest'
import { widgets } from '../db/schema'
import {
  addWidget,
  createTestApp,
  errorOf,
  newDashboard,
  type CreateWidgetInput,
  type TestApp,
} from '../test/helpers'

const routeWidget: Extract<CreateWidgetInput, { type: 'route' }> = {
  type: 'route',
  title: 'Commute',
  config: { origin: 'Amsterdam Centraal', destination: 'Utrecht Centraal' },
}

const withKey = { googleMapsEmbedKey: 'test-key' }

const widgetData = (t: TestApp, id: string) => t.client.widgets[':id'].data.$get({ param: { id } })

async function createdRouteId(t: TestApp): Promise<string> {
  const res = await addWidget(t, await newDashboard(t), routeWidget)
  expect(res.status).toBe(201)
  return (await res.json()).id
}

describe('route widgets', () => {
  it('are created with the default size and no network access', async () => {
    const t = await createTestApp({}, withKey)
    const res = await addWidget(t, await newDashboard(t), routeWidget)

    expect(res.status).toBe(201)
    expect((await res.json()).layout).toEqual({ x: 0, y: 0, w: 6, h: 5 })
    expect(t.fetch).not.toHaveBeenCalled()
  })

  it('fill in the defaults of the config', async () => {
    const t = await createTestApp({}, withKey)
    const res = await addWidget(t, await newDashboard(t), routeWidget)

    expect((await res.json()).config).toEqual({
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      mode: 'driving',
      reversed: false,
    })
  })

  it('cannot be created while the server has no Google Maps key', async () => {
    const t = await createTestApp()
    const res = await addWidget(t, await newDashboard(t), routeWidget)

    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('widget_type_unavailable')
  })

  it('reject an unknown mode and a badly formatted swap time', async () => {
    const t = await createTestApp({}, withKey)
    const dashboardId = await newDashboard(t)
    const send = (config: Record<string, unknown>) =>
      t.send('POST', `/dashboards/${dashboardId}/widgets`, { ...routeWidget, config })

    expect((await send({ ...routeWidget.config, mode: 'flying' })).status).toBe(400)
    expect((await send({ ...routeWidget.config, autoSwapAt: '9am' })).status).toBe(400)
  })

  it('return the route and the key the browser needs to show the map', async () => {
    const t = await createTestApp({}, withKey)
    const id = await createdRouteId(t)

    const res = await widgetData(t, id)

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      widget: { id, type: 'route', title: 'Commute' },
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      mode: 'driving',
      reversed: false,
      embedKey: 'test-key',
    })
  })

  it('return the automatic swap time when one is set', async () => {
    const t = await createTestApp({}, withKey)
    const res = await addWidget(t, await newDashboard(t), {
      ...routeWidget,
      config: { ...routeWidget.config, mode: 'transit', autoSwapAt: '12:30' },
    })
    const { id } = await res.json()

    expect(await (await widgetData(t, id)).json()).toMatchObject({
      mode: 'transit',
      autoSwapAt: '12:30',
    })
  })

  it('remember a swap saved through the widget config', async () => {
    const t = await createTestApp({}, withKey)
    const id = await createdRouteId(t)

    const patched = await t.client.widgets[':id'].$patch({
      param: { id },
      json: { config: { ...routeWidget.config, reversed: true } },
    })

    expect(patched.status).toBe(200)
    expect(await (await widgetData(t, id)).json()).toMatchObject({
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      reversed: true,
    })
  })

  it('stop showing a map when the key is removed from the server', async () => {
    const t = await createTestApp()
    const dashboardId = await newDashboard(t)
    const [widget] = await t.db
      .insert(widgets)
      .values({ dashboardId, type: 'route', title: 'Commute', config: routeWidget.config })
      .returning({ id: widgets.id })

    const res = await widgetData(t, widget?.id ?? '')

    expect(res.status).toBe(422)
    expect((await errorOf(res)).error.code).toBe('widget_type_unavailable')
  })
})
