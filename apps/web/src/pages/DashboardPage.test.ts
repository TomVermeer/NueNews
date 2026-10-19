import { flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../test/fakeApi'
import { feedData, feedItem, weatherData, widget } from '../test/factories'
import { mountApp } from '../test/mount'
import DashboardPage from './DashboardPage.vue'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  const { fakeApi } = await import('../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

// The grid library measures the DOM, which happy-dom cannot do. Layout behaviour is covered in
// useLayoutDraft's tests and by hand in a browser; here the grid just renders its items.
vi.mock('grid-layout-plus', () => ({
  GridLayout: defineComponent({ template: '<div data-testid="grid"><slot /></div>' }),
  GridItem: defineComponent({ template: '<div data-testid="grid-item"><slot /></div>' }),
}))

const HOME = { id: 'd1', name: 'Home', position: 0 }
const READING = { id: 'd2', name: 'Reading', position: 1 }

const news = widget('w1', { title: 'News', layout: { x: 0, y: 0, w: 4, h: 6 } })
const forecast = widget('w2', {
  title: 'Weather',
  type: 'weather',
  config: {},
  layout: { x: 4, y: 0, w: 4, h: 4 },
})

function serve(options: { dashboards?: unknown[]; widgets?: ReturnType<typeof widget>[] } = {}) {
  const dashboards = options.dashboards ?? [HOME, READING]
  const widgets = options.widgets ?? [news, forecast]
  fakeApi.on('GET dashboards', { body: { dashboards } })
  fakeApi.on('GET dashboards/:id', (args) => ({
    body: { ...HOME, id: args.param.id, widgets },
  }))
  fakeApi.on('GET widgets/:id/data', (args) => ({
    body: args.param.id === 'w2' ? weatherData() : feedData([feedItem(1, { title: 'Top story' })]),
  }))
}

async function open(route = '/') {
  const mounted = await mountApp(DashboardPage, { route })
  await flushPromises()
  return mounted
}

const button = (wrapper: { findAll: (s: string) => any[] }, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))

beforeEach(() => fakeApi.reset())
afterEach(() => vi.unstubAllGlobals())

describe('first run', () => {
  it('invites you to create the first dashboard', async () => {
    fakeApi.on('GET dashboards', { body: { dashboards: [] } })
    fakeApi.on('POST dashboards', { status: 201, body: HOME })
    const { wrapper } = await open()

    expect(wrapper.text()).toContain('Start your first dashboard')
    await wrapper.get('input[aria-label="Dashboard name"]').setValue('My start page')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fakeApi.callsTo('POST dashboards')[0]!.args).toEqual({ json: { name: 'My start page' } })
  })

  it('falls back to "Home" when the name is left empty', async () => {
    fakeApi.on('GET dashboards', { body: { dashboards: [] } })
    fakeApi.on('POST dashboards', { status: 201, body: HOME })
    const { wrapper } = await open()
    await wrapper.get('input[aria-label="Dashboard name"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fakeApi.callsTo('POST dashboards')[0]!.args.json.name).toBe('Home')
  })
})

describe('viewing a dashboard', () => {
  it('shows the tabs and the widgets of the first dashboard', async () => {
    serve()
    const { wrapper, router } = await open()

    expect(wrapper.findAll('nav a').map((a) => a.text())).toEqual(['Home', 'Reading'])
    expect(wrapper.findAll('section h2').map((h) => h.text())).toEqual(['News', 'Weather'])
    expect(wrapper.text()).toContain('Top story')
    expect(wrapper.get('[data-testid="temperature"]').text()).toBe('11°')
    expect(router.currentRoute.value.fullPath).toBe('/d/d1')
  })

  it('shows the dashboard from the address when it exists', async () => {
    serve()
    await open('/d/d2')
    expect(fakeApi.callsTo('GET dashboards/:id')[0]!.args.param).toEqual({ id: 'd2' })
  })

  it('falls back to the first dashboard for an address that does not exist', async () => {
    serve()
    const { router } = await open('/d/missing')
    expect(router.currentRoute.value.params.id).toBe('d1')
  })

  it('shows a friendly state for an empty dashboard', async () => {
    serve({ widgets: [] })
    const { wrapper } = await open()
    expect(wrapper.text()).toContain('This dashboard is empty')

    await button(wrapper, 'Add a widget')!.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('shows an error with a retry when the dashboards cannot be loaded', async () => {
    fakeApi.on('GET dashboards', {
      status: 500,
      body: { error: { code: 'internal_error', message: 'x' } },
    })
    const { wrapper } = await open()
    expect(wrapper.get('[role="alert"]').text()).toContain('Could not load your dashboards')

    serve()
    await button(wrapper, 'Try again')!.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('nav a')).toHaveLength(2)
  })

  it('refreshes every widget from the top bar', async () => {
    serve()
    fakeApi.on('POST widgets/:id/refresh', { body: { refreshed: 1, skipped: 0 } })
    const { wrapper } = await open()

    await wrapper.get('[aria-label="Refresh all widgets"]').trigger('click')
    await flushPromises()
    expect(
      fakeApi
        .callsTo('POST widgets/:id/refresh')
        .map((c) => c.args.param.id)
        .sort(),
    ).toEqual(['w1', 'w2'])
  })

  it('refreshes a single widget from its own button', async () => {
    serve()
    fakeApi.on('POST widgets/:id/refresh', { body: { refreshed: 1, skipped: 0 } })
    const { wrapper } = await open()

    await wrapper.findAll('[aria-label="Refresh widget"]')[0]!.trigger('click')
    await flushPromises()
    expect(fakeApi.callsTo('POST widgets/:id/refresh').map((c) => c.args.param.id)).toEqual(['w1'])
  })
})

describe('edit mode', () => {
  it('lets you remove a widget and saves the layout in one request', async () => {
    serve()
    fakeApi.on('PUT dashboards/:id/layout', { body: { ...HOME, widgets: [forecast] } })
    const { wrapper } = await open()

    await button(wrapper, 'Edit layout')!.trigger('click')
    expect(wrapper.find('.drag-handle').exists()).toBe(true)

    await wrapper.findAll('[aria-label="Remove widget"]')[0]!.trigger('click')
    expect(wrapper.findAll('section h2').map((h) => h.text())).toEqual(['Weather'])

    await button(wrapper, 'Save layout')!.trigger('click')
    await flushPromises()

    const [call] = fakeApi.callsTo('PUT dashboards/:id/layout')
    expect(call!.args).toEqual({
      param: { id: 'd1' },
      json: { widgets: [{ id: 'w2', x: 4, y: 0, w: 4, h: 4 }], removed: ['w1'] },
    })
    expect(wrapper.find('.drag-handle').exists()).toBe(false) // back in view mode
  })

  it('cancel brings back removed widgets and sends nothing', async () => {
    serve()
    const { wrapper } = await open()
    await button(wrapper, 'Edit layout')!.trigger('click')
    await wrapper.findAll('[aria-label="Remove widget"]')[0]!.trigger('click')
    expect(wrapper.findAll('section')).toHaveLength(1)

    await button(wrapper, 'Cancel')!.trigger('click')
    expect(wrapper.findAll('section h2').map((h) => h.text())).toEqual(['News', 'Weather'])
    expect(fakeApi.callsTo('PUT dashboards/:id/layout')).toHaveLength(0)
  })

  it('"Done" without any change does not call the server', async () => {
    serve()
    const { wrapper } = await open()
    await button(wrapper, 'Edit layout')!.trigger('click')
    await button(wrapper, 'Done')!.trigger('click')
    await flushPromises()
    expect(fakeApi.callsTo('PUT dashboards/:id/layout')).toHaveLength(0)
    expect(wrapper.find('.drag-handle').exists()).toBe(false)
  })

  it('opens the settings of a widget with its current values', async () => {
    serve()
    const { wrapper } = await open()
    await button(wrapper, 'Edit layout')!.trigger('click')
    await wrapper.findAll('[aria-label="Widget settings"]')[0]!.trigger('click')

    expect(wrapper.get('[role="dialog"] h2').text()).toBe('Widget settings')
    expect((wrapper.get('#feed-title').element as HTMLInputElement).value).toBe('News')
  })

  it('adds a widget through the panel and refreshes the dashboard', async () => {
    serve()
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    fakeApi.on('POST dashboards/:id/widgets', { status: 201, body: widget('w3') })
    const { wrapper } = await open()

    await button(wrapper, 'Edit layout')!.trigger('click')
    await button(wrapper, 'Add widget')!.trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

    await button(wrapper, 'Feed list')!.trigger('click')
    await wrapper.get('input[aria-label="Feed address 1"]').setValue('a.example')
    await button(wrapper, 'Look up')!.trigger('click')
    await flushPromises()
    await wrapper
      .findAll('[role="dialog"] footer button')
      .find((b) => b.text() === 'Add widget')!
      .trigger('click')
    await flushPromises()

    expect(fakeApi.callsTo('POST dashboards/:id/widgets')).toHaveLength(1)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(fakeApi.callsTo('GET dashboards/:id').length).toBeGreaterThan(1) // reloaded
  })

  it('creates another dashboard and switches to it', async () => {
    serve()
    fakeApi.on('POST dashboards', { status: 201, body: { id: 'd3', name: 'Dev', position: 2 } })
    const { wrapper, router } = await open()

    await wrapper.get('[aria-label="New dashboard"]').trigger('click')
    await wrapper.get('input[aria-label="New dashboard name"]').setValue('Dev')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(fakeApi.callsTo('POST dashboards')[0]!.args).toEqual({ json: { name: 'Dev' } })
    expect(router.currentRoute.value.fullPath).toBe('/d/d3')
  })

  it('renames and deletes the dashboard', async () => {
    serve()
    fakeApi.on('PATCH dashboards/:id', { body: { ...HOME, name: 'Start' } })
    fakeApi.on('DELETE dashboards/:id', { status: 204 })
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true))
    const { wrapper } = await open()

    await button(wrapper, 'Edit layout')!.trigger('click')
    await wrapper.get('[aria-label="Rename dashboard"]').trigger('click')
    await wrapper.get('input[aria-label="Dashboard name"]').setValue('Start')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(fakeApi.callsTo('PATCH dashboards/:id')[0]!.args).toEqual({
      param: { id: 'd1' },
      json: { name: 'Start' },
    })

    await wrapper.get('[aria-label="Delete dashboard"]').trigger('click')
    await flushPromises()
    expect(fakeApi.callsTo('DELETE dashboards/:id')[0]!.args).toEqual({ param: { id: 'd1' } })
  })
})
