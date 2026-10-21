import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { HttpClient } from '../lib/http'
import { sources, weatherCache } from '../db/schema'
import { createTestApp, fakeContext, item, NOW } from '../test/helpers'

const CHANNEL = 'UCsBjURrPoezykLs9EqgamOA'
const fixture = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

async function dashboard(t: Awaited<ReturnType<typeof createTestApp>>) {
  return (await t.call('POST', '/dashboards', { name: 'Home' })).body.id as string
}

const youtubeWidget = (channels: { input: string; label?: string }[]) => ({
  type: 'youtube',
  title: 'Videos',
  config: { channels },
})

describe('YouTube widgets', () => {
  it('creates a widget from channel IDs and addresses, as one source per channel', async () => {
    const t = await createTestApp({
      fetch: (source) => ({
        status: 'ok',
        items: [item(1, { externalId: `${source.key}-v1`, title: 'A video' })],
        title: 'Channel name',
      }),
    })
    const id = await dashboard(t)
    const res = await t.call(
      'POST',
      `/dashboards/${id}/widgets`,
      youtubeWidget([
        { input: CHANNEL },
        { input: `https://www.youtube.com/channel/${CHANNEL}` }, // same channel again
        { input: 'UCabcdefghijklmnopqrstuv', label: 'My label' },
      ]),
    )

    expect(res.status).toBe(201)
    expect(res.body.layout).toEqual({ x: 0, y: 0, w: 6, h: 5 })
    const rows = await t.db.select().from(sources)
    expect(rows.map((r) => [r.kind, r.key]).sort()).toEqual([
      ['youtube', 'UCabcdefghijklmnopqrstuv'],
      ['youtube', CHANNEL],
    ])
    expect(t.fetch).toHaveBeenCalledTimes(2)
  })

  it('asks the user to resolve handles first, because it will not look them up while saving', async () => {
    const t = await createTestApp()
    const id = await dashboard(t)
    const res = await t.call(
      'POST',
      `/dashboards/${id}/widgets`,
      youtubeWidget([{ input: '@somechannel' }]),
    )
    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('invalid_config')
    expect(res.body.error.message).toContain('/sources/resolve')
    expect(t.fetch).not.toHaveBeenCalled()
  })

  it('returns videos with the label you gave each channel', async () => {
    const t = await createTestApp({
      fetch: () => ({
        status: 'ok',
        items: [item(3, { externalId: 'v3', title: 'Newest video' })],
        title: 'Channel name',
      }),
    })
    const id = await dashboard(t)
    const created = await t.call(
      'POST',
      `/dashboards/${id}/widgets`,
      youtubeWidget([{ input: CHANNEL, label: 'Fireship' }]),
    )
    const { status, body } = await t.call('GET', `/widgets/${created.body.id}/data`)
    expect(status).toBe(200)
    expect(body.items).toHaveLength(1)
    expect(body.items[0]).toMatchObject({ title: 'Newest video', sourceName: 'Fireship' })
    expect(body.sources[0]).toMatchObject({ title: 'Fireship', error: null })
  })

  it('can be resolved through /sources/resolve', async () => {
    const t = await createTestApp({
      resolve: async (input) => ({ kind: 'youtube', key: CHANNEL, title: `Resolved ${input}` }),
    })
    const res = await t.call('POST', '/sources/resolve', { kind: 'youtube', input: '@Fireship' })
    expect(res.body).toMatchObject({ kind: 'youtube', key: CHANNEL })
  })
})

describe('weather widgets', () => {
  async function weatherApp(get: HttpClient['get']) {
    return await createTestApp({}, { fetchContext: { ...fakeContext(), http: { get } } })
  }

  const respond = (body: string, status = 200) => ({
    status,
    headers: { get: () => null },
    url: '',
    body,
  })

  const weatherWidget = {
    type: 'weather',
    title: 'Weather',
    config: { location: { name: 'Amsterdam', lat: 52.37, lon: 4.9 }, units: 'metric' },
  }

  it('returns the current weather and forecast with attribution', async () => {
    const get = vi.fn<HttpClient['get']>(async () =>
      respond(fixture('../weather/__fixtures__/forecast.json')),
    )
    const t = await weatherApp(get)
    const created = await t.call('POST', `/dashboards/${await dashboard(t)}/widgets`, weatherWidget)

    const { status, body } = await t.call('GET', `/widgets/${created.body.id}/data`)

    expect(status).toBe(200)
    expect(body).toMatchObject({
      widget: { type: 'weather', title: 'Weather' },
      location: { name: 'Amsterdam' },
      units: 'metric',
      current: { temperature: 11, icon: 'cloudy', isDay: false },
      stale: false,
      attribution: 'Weather data by Open-Meteo.com',
    })
    expect(body.daily).toHaveLength(5)
    expect(await t.db.select().from(weatherCache)).toHaveLength(1)
  })

  it('serves repeat views from the cache', async () => {
    const get = vi.fn<HttpClient['get']>(async () =>
      respond(fixture('../weather/__fixtures__/forecast.json')),
    )
    const t = await weatherApp(get)
    const created = await t.call('POST', `/dashboards/${await dashboard(t)}/widgets`, weatherWidget)
    await t.call('GET', `/widgets/${created.body.id}/data`)
    await t.call('GET', `/widgets/${created.body.id}/data`)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reports an unavailable weather service as a 422 the UI can show', async () => {
    const t = await weatherApp(async () => respond('', 500))
    const created = await t.call('POST', `/dashboards/${await dashboard(t)}/widgets`, weatherWidget)
    const { status, body } = await t.call('GET', `/widgets/${created.body.id}/data`)
    expect(status).toBe(422)
    expect(body.error.code).toBe('source_error')
  })

  it('validates coordinates and units', async () => {
    const t = await weatherApp(async () => respond('{}'))
    const id = await dashboard(t)
    const badLat = await t.call('POST', `/dashboards/${id}/widgets`, {
      ...weatherWidget,
      config: { location: { name: 'X', lat: 120, lon: 0 } },
    })
    const badUnits = await t.call('POST', `/dashboards/${id}/widgets`, {
      ...weatherWidget,
      config: { ...weatherWidget.config, units: 'kelvin' },
    })
    expect(badLat.status).toBe(400)
    expect(badUnits.status).toBe(400)
  })
})

describe('GET /geocode', () => {
  const respond = (body: string, status = 200) => ({
    status,
    headers: { get: () => null },
    url: '',
    body,
  })

  it('returns matching places', async () => {
    const get = vi.fn<HttpClient['get']>(async () =>
      respond(fixture('../weather/__fixtures__/geocoding.json')),
    )
    const t = await createTestApp({}, { fetchContext: { ...fakeContext(), http: { get } } })
    const { status, body } = await t.call('GET', '/geocode?q=Amsterdam')
    expect(status).toBe(200)
    expect(body.results[0]).toMatchObject({
      name: 'Amsterdam',
      country: 'Netherlands',
      lat: 52.37403,
    })
    expect(new URL(get.mock.calls[0]![0]).searchParams.get('name')).toBe('Amsterdam')
  })

  it('needs a query of at least two characters', async () => {
    const t = await createTestApp()
    expect((await t.call('GET', '/geocode')).status).toBe(400)
    expect((await t.call('GET', '/geocode?q=a')).status).toBe(400)
  })

  it('reports service failures', async () => {
    const t = await createTestApp(
      {},
      { fetchContext: { ...fakeContext(), http: { get: async () => respond('', 500) } } },
    )
    const res = await t.call('GET', '/geocode?q=Amsterdam')
    expect(res.status).toBe(422)
  })
})

it('keeps the fixed clock in the test helper', () => {
  expect(NOW.toISOString()).toBe('2026-02-01T12:00:00.000Z')
})
