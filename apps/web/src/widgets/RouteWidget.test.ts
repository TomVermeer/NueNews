import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../test/fakeApi'
import { routeData } from '../test/factories'
import { mountApp } from '../test/mount'
import RouteWidget from './RouteWidget.vue'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  const { fakeApi } = await import('../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

beforeEach(() => fakeApi.reset())

const mountRoute = (overrides: Parameters<typeof routeData>[0] = {}) =>
  mountApp(RouteWidget, { props: { data: routeData(overrides), dashboardId: 'd1' } })

type Mounted = Awaited<ReturnType<typeof mountRoute>>['wrapper']

/** The places the embedded map is currently asked to route between. */
function embeddedRoute(wrapper: Mounted) {
  const params = new URL(wrapper.get('iframe').attributes('src') ?? '').searchParams
  return { origin: params.get('origin'), destination: params.get('destination') }
}

describe('RouteWidget', () => {
  it('embeds the Google map for the route with the key from the server', async () => {
    const { wrapper } = await mountRoute()
    const iframe = wrapper.get('iframe')
    const url = new URL(iframe.attributes('src') ?? '')

    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/embed/v1/directions')
    expect(Object.fromEntries(url.searchParams)).toEqual({
      key: 'test-key',
      origin: 'Amsterdam Centraal',
      destination: 'Utrecht Centraal',
      mode: 'transit',
    })
    expect(iframe.attributes('title')).toBe('Route from Amsterdam Centraal to Utrecht Centraal')
  })

  it('sends the page address to Google, because the key only works for our own addresses', async () => {
    // The API answers every page with Referrer-Policy: no-referrer, which the iframe must override.
    const { wrapper } = await mountRoute()
    const iframe = wrapper.get('iframe')

    expect(iframe.attributes('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(iframe.attributes('loading')).toBe('lazy')
  })

  it('lets the mouse pass through the map while the card is being edited', async () => {
    // A drag in edit mode that crosses an iframe would otherwise stop receiving mouse events.
    const { wrapper } = await mountRoute()

    expect(wrapper.get('iframe').classes()).toContain('[[data-editing]_&]:pointer-events-none')
  })

  it('shows where the route starts and ends', async () => {
    const { wrapper } = await mountRoute()

    expect(wrapper.get('[data-testid="route-origin"]').text()).toBe('Amsterdam Centraal')
    expect(wrapper.get('[data-testid="route-destination"]').text()).toBe('Utrecht Centraal')
  })

  it('runs a reversed route from the destination back to the origin', async () => {
    const { wrapper } = await mountRoute({ reversed: true })

    expect(embeddedRoute(wrapper)).toEqual({
      origin: 'Utrecht Centraal',
      destination: 'Amsterdam Centraal',
    })
    expect(wrapper.get('[data-testid="route-origin"]').text()).toBe('Utrecht Centraal')
    expect(wrapper.get('[data-testid="route-destination"]').text()).toBe('Amsterdam Centraal')
  })

  it('links to the same route on google.com/maps in a new tab', async () => {
    const { wrapper } = await mountRoute()
    const link = wrapper.get('a')
    const url = new URL(link.attributes('href') ?? '')

    expect(link.text()).toBe('Open in Google Maps')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/')
    expect(url.searchParams.get('travelmode')).toBe('transit')
    expect(url.searchParams.get('origin')).toBe('Amsterdam Centraal')
  })

  it('follows new data from the server, for example a swap made in another tab', async () => {
    const { wrapper } = await mountRoute()

    await wrapper.setProps({ data: routeData({ reversed: true }) })

    expect(embeddedRoute(wrapper).origin).toBe('Utrecht Centraal')
  })
})

describe('RouteWidget swap button', () => {
  const swapButton = (wrapper: Mounted) =>
    wrapper.get('button[aria-label="Swap start and destination"]')

  it('swaps the route straight away and saves the new direction on the widget', async () => {
    fakeApi.on('PATCH widgets/:id', { body: {} })
    const { wrapper } = await mountRoute({ mode: 'walking' })

    await swapButton(wrapper).trigger('click')

    expect(embeddedRoute(wrapper)).toEqual({
      origin: 'Utrecht Centraal',
      destination: 'Amsterdam Centraal',
    })
    await flushPromises()
    const [call] = fakeApi.callsTo('PATCH widgets/:id')
    expect(call!.args.param).toEqual({ id: 'r1' })
    expect(call!.args.json).toMatchObject({
      config: {
        origin: 'Amsterdam Centraal',
        destination: 'Utrecht Centraal',
        mode: 'walking',
        reversed: true,
      },
    })
  })

  it('swaps back on the second press', async () => {
    fakeApi.on('PATCH widgets/:id', { body: {} })
    const { wrapper } = await mountRoute({ reversed: true })

    await swapButton(wrapper).trigger('click')
    await flushPromises()

    expect(embeddedRoute(wrapper).origin).toBe('Amsterdam Centraal')
    const [call] = fakeApi.callsTo('PATCH widgets/:id')
    expect(call!.args.json).toMatchObject({ config: { reversed: false } })
  })

  it('cannot be pressed again while the swap is being saved', async () => {
    fakeApi.on('PATCH widgets/:id', () => new Promise(() => {}))
    const { wrapper } = await mountRoute()

    await swapButton(wrapper).trigger('click')

    expect(swapButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('puts the route back and says so when saving fails', async () => {
    fakeApi.on('PATCH widgets/:id', {
      status: 500,
      body: { error: { code: 'x', message: 'x' } },
    })
    const { wrapper } = await mountRoute()

    await swapButton(wrapper).trigger('click')
    await flushPromises()

    expect(embeddedRoute(wrapper).origin).toBe('Amsterdam Centraal')
    expect(wrapper.get('[role="status"]').text()).toContain('Could not save the swap')
    expect(swapButton(wrapper).attributes('disabled')).toBeUndefined()
  })
})

describe('RouteWidget automatic swap', () => {
  // Only the date is faked: the widget's own timer is never reached in these tests.
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))
  afterEach(() => vi.useRealTimers())

  const clockAt = (hours: number) => vi.setSystemTime(new Date(2026, 10, 5, hours))

  it('shows the saved direction before the swap time', async () => {
    clockAt(9)
    const { wrapper } = await mountRoute({ autoSwapAt: '12:00' })

    expect(embeddedRoute(wrapper).origin).toBe('Amsterdam Centraal')
    wrapper.unmount()
  })

  it('shows the way back from the swap time on', async () => {
    clockAt(13)
    const { wrapper } = await mountRoute({ autoSwapAt: '12:00' })

    expect(embeddedRoute(wrapper)).toEqual({
      origin: 'Utrecht Centraal',
      destination: 'Amsterdam Centraal',
    })
    expect(wrapper.get('[data-testid="route-origin"]').text()).toBe('Utrecht Centraal')
    wrapper.unmount()
  })

  it('says when the direction switches, and only when it does', async () => {
    clockAt(9)
    const scheduled = await mountRoute({ autoSwapAt: '12:00' })
    const plain = await mountRoute()

    expect(scheduled.wrapper.text()).toContain('Switches direction at 12:00')
    expect(plain.wrapper.text()).not.toContain('Switches direction')
    scheduled.wrapper.unmount()
    plain.wrapper.unmount()
  })

  it('flips the route for now without saving anything', async () => {
    fakeApi.on('PATCH widgets/:id', { body: {} })
    clockAt(9)
    const { wrapper } = await mountRoute({ autoSwapAt: '12:00' })

    await wrapper.get('button[aria-label="Swap start and destination"]').trigger('click')
    await flushPromises()

    expect(embeddedRoute(wrapper).origin).toBe('Utrecht Centraal')
    expect(fakeApi.callsTo('PATCH widgets/:id')).toHaveLength(0)
    wrapper.unmount()
  })

  it('flips back when the button is pressed again', async () => {
    clockAt(9)
    const { wrapper } = await mountRoute({ autoSwapAt: '12:00' })
    const button = wrapper.get('button[aria-label="Swap start and destination"]')

    await button.trigger('click')
    await button.trigger('click')

    expect(embeddedRoute(wrapper).origin).toBe('Amsterdam Centraal')
    wrapper.unmount()
  })
})
