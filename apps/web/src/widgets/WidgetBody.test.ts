import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../test/fakeApi'
import { feedData, feedItem, weatherData, widget } from '../test/factories'
import { mountApp } from '../test/mount'
import WidgetBody from './WidgetBody.vue'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  const { fakeApi } = await import('../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

beforeEach(() => fakeApi.reset())

describe('WidgetBody', () => {
  it('shows a loading placeholder first, then the feed', async () => {
    fakeApi.on('GET widgets/:id/data', { body: feedData([feedItem(1), feedItem(2)]) })
    const { wrapper } = await mountApp(WidgetBody, { props: { widget: widget('w1') } })

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(true)
    await flushPromises()

    expect(wrapper.find('[aria-busy="true"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Headline 1')
    expect(wrapper.text()).toContain('Headline 2')
    expect(fakeApi.callsTo('GET widgets/:id/data')[0]!.args).toEqual({ param: { id: 'w1' } })
  })

  it('renders weather widgets with the weather view', async () => {
    fakeApi.on('GET widgets/:id/data', { body: weatherData() })
    const { wrapper } = await mountApp(WidgetBody, {
      props: { widget: widget('w3', { type: 'weather', config: {} }) },
    })
    await flushPromises()
    expect(wrapper.get('[data-testid="temperature"]').text()).toBe('11°')
  })

  it('renders YouTube widgets as a thumbnail grid', async () => {
    fakeApi.on('GET widgets/:id/data', {
      body: feedData([feedItem(1)], { widget: { id: 'w2', type: 'youtube', title: 'YT' } }),
    })
    const { wrapper } = await mountApp(WidgetBody, {
      props: { widget: widget('w2', { type: 'youtube', config: {} }) },
    })
    await flushPromises()
    expect(wrapper.find('.aspect-video').exists()).toBe(true)
  })

  it('passes the display options of the widget on to the feed', async () => {
    fakeApi.on('GET widgets/:id/data', { body: feedData([feedItem(1)]) })
    const { wrapper } = await mountApp(WidgetBody, {
      props: {
        widget: widget('w1', { config: { excerpt: 'none', showImages: false, unreadDots: true } }),
      },
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Excerpt for headline 1')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('[data-testid="unread-dot"]').exists()).toBe(true)
  })

  it('shows the error from the server and lets you try again', async () => {
    let healthy = false
    fakeApi.on('GET widgets/:id/data', () =>
      healthy
        ? { body: feedData([feedItem(1)]) }
        : {
            status: 422,
            body: { error: { code: 'source_error', message: 'The weather service is down' } },
          },
    )
    const { wrapper } = await mountApp(WidgetBody, { props: { widget: widget('w1') } })
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('The weather service is down')

    healthy = true
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Headline 1')
  })

  it('marks an item read straight away when it is opened, and tells the server', async () => {
    fakeApi.on('GET widgets/:id/data', { body: feedData([feedItem(1), feedItem(2)]) })
    fakeApi.on('POST items/state', { body: { updated: 1 } })
    const { wrapper } = await mountApp(WidgetBody, {
      props: { widget: widget('w1', { config: { unreadDots: true } }) },
    })
    await flushPromises()
    expect(wrapper.findAll('[data-testid="unread-dot"]')).toHaveLength(2)

    await wrapper
      .findAll('a')
      .find((a) => a.text() === 'Headline 1')!
      .trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="unread-dot"]')).toHaveLength(1)
    expect(fakeApi.callsTo('POST items/state')).toHaveLength(1)
    expect(fakeApi.callsTo('POST items/state')[0]!.args).toEqual({
      json: { ids: ['item-1'], action: 'read' },
    })
  })

  it('does not tell the server again about items that are already read', async () => {
    fakeApi.on('GET widgets/:id/data', { body: feedData([feedItem(1, { read: true })]) })
    const { wrapper } = await mountApp(WidgetBody, { props: { widget: widget('w1') } })
    await flushPromises()
    await wrapper
      .findAll('a')
      .find((a) => a.text() === 'Headline 1')!
      .trigger('click')
    expect(fakeApi.callsTo('POST items/state')).toHaveLength(0)
  })
})
