import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import FeedForm from './FeedForm.vue'
import WeatherForm from './WeatherForm.vue'
import YouTubeForm from './YouTubeForm.vue'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  const { fakeApi } = await import('../../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

beforeEach(() => fakeApi.reset())
afterEach(() => vi.useRealTimers())

async function lookUp(wrapper: ReturnType<typeof mount>, index: number, text: string) {
  const inputs = wrapper.findAll('input[aria-label^="Feed address"], input[aria-label^="Channel "]')
  await inputs[index]!.setValue(text)
  await wrapper
    .findAll('button')
    .find((b) => b.text() === 'Look up' && !b.attributes('disabled'))!
    .trigger('click')
  await flushPromises()
}

describe('FeedForm', () => {
  it('asks for a feed before it will submit, and shows why', async () => {
    const wrapper = mount(FeedForm)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('Add at least one feed')
  })

  it('does not show problems before the first attempt', () => {
    expect(mount(FeedForm).find('[role="alert"]').exists()).toBe(false)
  })

  it('refuses an empty title', async () => {
    const wrapper = mount(FeedForm)
    await wrapper.get('#feed-title').setValue('  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Give the widget a title')
  })

  it('refuses addresses that were typed but not looked up', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    const wrapper = mount(FeedForm)
    await lookUp(wrapper, 0, 'a.example')
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add another feed'))!
      .trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Look up every address')
    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('submits the looked-up feeds with their names and the display options', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    const wrapper = mount(FeedForm)
    await wrapper.get('#feed-title').setValue('  Tech  ')
    await lookUp(wrapper, 0, 'a.example')
    await wrapper.get('input[aria-label="Name for feed 1"]').setValue('Alpha')
    await wrapper.get('#feed-limit').setValue('8')
    await wrapper.get('#feed-excerpt').setValue('expanded')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        title: 'Tech',
        config: {
          sources: [{ url: 'https://a.example/f', label: 'Alpha' }],
          limit: 8,
          excerpt: 'expanded',
          showImages: true,
          unreadDots: false,
          variant: 'cards',
        },
      },
    ])
  })

  it('prefills from an existing widget', () => {
    const wrapper = mount(FeedForm, {
      props: {
        initial: {
          title: 'My feeds',
          config: {
            sources: [{ url: 'https://x.example/f', label: 'X' }],
            limit: 3,
            unreadDots: true,
          },
        },
      },
    })
    expect((wrapper.get('#feed-title').element as HTMLInputElement).value).toBe('My feeds')
    expect((wrapper.get('#feed-limit').element as HTMLInputElement).value).toBe('3')
    expect(
      (wrapper.get('input[aria-label="Feed address 1"]').element as HTMLInputElement).value,
    ).toBe('https://x.example/f')
  })

  it('lets you remove a feed once there is more than one', async () => {
    const wrapper = mount(FeedForm)
    expect(wrapper.find('[aria-label="Remove feed 1"]').exists()).toBe(false)
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('Add another feed'))!
      .trigger('click')
    expect(wrapper.findAll('input[aria-label^="Feed address"]')).toHaveLength(2)
    await wrapper.get('[aria-label="Remove feed 2"]').trigger('click')
    expect(wrapper.findAll('input[aria-label^="Feed address"]')).toHaveLength(1)
  })
})

describe('YouTubeForm', () => {
  it('needs at least one looked-up channel', async () => {
    const wrapper = mount(YouTubeForm)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toContain('Add at least one channel')
  })

  it('submits channel IDs, names and the video limit', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'youtube', key: 'UCsBjURrPoezykLs9EqgamOA', title: 'Fireship' },
    })
    const wrapper = mount(YouTubeForm)
    await lookUp(wrapper, 0, '@Fireship')
    await wrapper.get('input[aria-label="Name for channel 1"]').setValue('Fire')
    await wrapper.get('#yt-limit').setValue('6')
    await wrapper.get('form').trigger('submit')

    expect(fakeApi.callsTo('POST sources/resolve')[0]!.args.json.kind).toBe('youtube')
    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        title: 'YouTube',
        config: { channels: [{ input: 'UCsBjURrPoezykLs9EqgamOA', label: 'Fire' }], limit: 6 },
      },
    ])
  })
})

describe('WeatherForm', () => {
  const places = [
    { name: 'Utrecht', region: 'Utrecht', country: 'The Netherlands', lat: 52.09, lon: 5.12 },
    { name: 'Utrecht', region: 'KwaZulu-Natal', country: 'South Africa', lat: -27.66, lon: 30.32 },
  ]

  it('requires a location', async () => {
    const wrapper = mount(WeatherForm)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.get('[role="alert"]').text()).toContain('Choose a location')
  })

  it('searches after a short pause in typing, not on every key', async () => {
    vi.useFakeTimers()
    fakeApi.on('GET geocode', { body: { results: places } })
    const wrapper = mount(WeatherForm)

    await wrapper.get('#weather-search').setValue('Ut')
    await wrapper.get('#weather-search').setValue('Utr')
    await wrapper.get('#weather-search').setValue('Utrecht')
    expect(fakeApi.callsTo('GET geocode')).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(fakeApi.callsTo('GET geocode')).toHaveLength(1)
    expect(fakeApi.callsTo('GET geocode')[0]!.args).toEqual({ query: { q: 'Utrecht' } })
    expect(wrapper.findAll('ul[aria-label="Search results"] button').map((b) => b.text())).toEqual([
      'Utrecht, Utrecht, The Netherlands',
      'Utrecht, KwaZulu-Natal, South Africa',
    ])
  })

  it('does not search for fewer than two characters', async () => {
    vi.useFakeTimers()
    const wrapper = mount(WeatherForm)
    await wrapper.get('#weather-search').setValue('U')
    await vi.advanceTimersByTimeAsync(500)
    expect(fakeApi.callsTo('GET geocode')).toHaveLength(0)
  })

  it('says when nothing was found', async () => {
    vi.useFakeTimers()
    fakeApi.on('GET geocode', { body: { results: [] } })
    const wrapper = mount(WeatherForm)
    await wrapper.get('#weather-search').setValue('Nowhereville')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()
    expect(wrapper.text()).toContain('No places found')
  })

  it('submits the chosen place and units', async () => {
    vi.useFakeTimers()
    fakeApi.on('GET geocode', { body: { results: places } })
    const wrapper = mount(WeatherForm)
    await wrapper.get('#weather-search').setValue('Utrecht')
    await vi.advanceTimersByTimeAsync(300)
    await flushPromises()

    await wrapper.get('ul[aria-label="Search results"] button').trigger('click')
    expect(wrapper.text()).toContain('Utrecht')
    expect(wrapper.find('ul[aria-label="Search results"]').exists()).toBe(false)

    await wrapper.get('input[value="imperial"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('submit')![0]).toEqual([
      {
        title: 'Weather',
        config: { location: { name: 'Utrecht', lat: 52.09, lon: 5.12 }, units: 'imperial' },
      },
    ])
  })

  it('prefills from an existing widget', () => {
    const wrapper = mount(WeatherForm, {
      props: {
        initial: {
          title: 'Home weather',
          config: { location: { name: 'Delft', lat: 52, lon: 4.36 }, units: 'imperial' },
        },
      },
    })
    expect(wrapper.text()).toContain('Delft')
    expect((wrapper.get('input[value="imperial"]').element as HTMLInputElement).checked).toBe(true)
  })
})
