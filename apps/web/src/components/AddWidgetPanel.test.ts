import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../test/fakeApi'
import { widget } from '../test/factories'
import { mountApp } from '../test/mount'
import AddWidgetPanel from './AddWidgetPanel.vue'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  const { fakeApi } = await import('../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

beforeEach(() => fakeApi.reset())

const button = (wrapper: { findAll: (s: string) => any[] }, text: string) =>
  wrapper.findAll('button').find((b) => b.text().includes(text))!

describe('AddWidgetPanel (adding)', () => {
  it('starts with the choice of widget types', async () => {
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })
    expect(wrapper.get('h2').text()).toBe('Add widget')
    expect(wrapper.text()).toContain('Feed list')
    expect(wrapper.text()).toContain('YouTube channels')
    expect(wrapper.text()).toContain('Weather')
    expect(wrapper.text()).not.toContain('RoyalRoad')
    expect(wrapper.find('footer').exists()).toBe(false)
  })

  it('shows the form of the chosen type and can go back', async () => {
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })
    await button(wrapper, 'Weather').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Weather')
    expect(wrapper.find('#weather-search').exists()).toBe(true)

    await wrapper.get('[aria-label="Back to widget types"]').trigger('click')
    expect(wrapper.get('h2').text()).toBe('Add widget')
  })

  it('creates the widget on the dashboard and closes', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    fakeApi.on('POST dashboards/:id/widgets', { status: 201, body: widget('new') })
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })

    await button(wrapper, 'Feed list').trigger('click')
    await wrapper.get('input[aria-label="Feed address 1"]').setValue('a.example')
    await button(wrapper, 'Look up').trigger('click')
    await flushPromises()
    await button(wrapper, 'Add widget').trigger('click')
    await flushPromises()

    const [call] = fakeApi.callsTo('POST dashboards/:id/widgets')
    expect(call!.args.param).toEqual({ id: 'd1' })
    expect(call!.args.json).toMatchObject({
      type: 'feed',
      title: 'News',
      config: { sources: [{ url: 'https://a.example/f' }], limit: 5 },
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('does not call the server while the form has problems', async () => {
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })
    await button(wrapper, 'Feed list').trigger('click')
    await button(wrapper, 'Add widget').trigger('click')
    await flushPromises()
    expect(fakeApi.callsTo('POST dashboards/:id/widgets')).toHaveLength(0)
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('shows the server error and stays open', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    fakeApi.on('POST dashboards/:id/widgets', {
      status: 422,
      body: {
        error: { code: 'blocked_url', message: 'Private and local addresses are not allowed' },
      },
    })
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })
    await button(wrapper, 'Feed list').trigger('click')
    await wrapper.get('input[aria-label="Feed address 1"]').setValue('a.example')
    await button(wrapper, 'Look up').trigger('click')
    await flushPromises()
    await button(wrapper, 'Add widget').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Private and local addresses are not allowed')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('closes from the close button and Cancel', async () => {
    const { wrapper } = await mountApp(AddWidgetPanel, { props: { dashboardId: 'd1' } })
    await wrapper.get('[aria-label="Close panel"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

describe('AddWidgetPanel (editing)', () => {
  const existing = widget('w1', {
    title: 'My news',
    config: {
      sources: [{ url: 'https://a.example/f', label: 'Alpha' }],
      limit: 4,
      excerpt: 'compact',
      showImages: true,
      unreadDots: false,
      variant: 'cards',
    },
  })

  it('opens the settings of the widget directly, without the type choice', async () => {
    const { wrapper } = await mountApp(AddWidgetPanel, {
      props: { dashboardId: 'd1', widget: existing },
    })
    expect(wrapper.get('h2').text()).toBe('Widget settings')
    expect((wrapper.get('#feed-title').element as HTMLInputElement).value).toBe('My news')
    expect(wrapper.find('[aria-label="Back to widget types"]').exists()).toBe(false)
  })

  it('saves changes to the existing widget', async () => {
    fakeApi.on('PATCH widgets/:id', { body: existing })
    const { wrapper } = await mountApp(AddWidgetPanel, {
      props: { dashboardId: 'd1', widget: existing },
    })

    await wrapper.get('#feed-title').setValue('Renamed')
    await button(wrapper, 'Save changes').trigger('click')
    await flushPromises()

    const [call] = fakeApi.callsTo('PATCH widgets/:id')
    expect(call!.args.param).toEqual({ id: 'w1' })
    expect(call!.args.json).toMatchObject({
      title: 'Renamed',
      config: { sources: [{ url: 'https://a.example/f', label: 'Alpha' }], limit: 4 },
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
