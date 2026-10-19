import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeApi } from '../../test/fakeApi'
import ResolveInput from './ResolveInput.vue'

vi.mock('../../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/client')>()
  const { fakeApi } = await import('../../test/fakeApi')
  return { ...actual, api: fakeApi.api }
})

function render(modelValue = '', kind: 'rss' | 'youtube' = 'rss') {
  const wrapper = mount(ResolveInput, {
    props: {
      kind,
      label: 'Feed address',
      modelValue,
      'onUpdate:modelValue': (value: string | undefined) =>
        void wrapper.setProps({ modelValue: value ?? '' }),
    },
  })
  return wrapper
}

const type = (wrapper: ReturnType<typeof render>, text: string) =>
  wrapper.get('input').setValue(text)

beforeEach(() => fakeApi.reset())

describe('ResolveInput', () => {
  it('cannot look up an empty address', () => {
    expect(render().get('button').attributes('disabled')).toBeDefined()
  })

  it('looks the address up when the button is clicked and reports what it found', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://news.example.com/feed.xml', title: 'Example News' },
    })
    const wrapper = render()
    await type(wrapper, 'news.example.com')
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(fakeApi.callsTo('POST sources/resolve')[0]!.args).toEqual({
      json: { kind: 'rss', input: 'news.example.com' },
    })
    expect(wrapper.props('modelValue')).toBe('https://news.example.com/feed.xml')
    expect(wrapper.get('input').element.value).toBe('https://news.example.com/feed.xml')
    expect(wrapper.text()).toContain('Found: Example News')
    expect(wrapper.emitted('resolved')![0]).toEqual([
      { kind: 'rss', key: 'https://news.example.com/feed.xml', title: 'Example News' },
    ])
  })

  it('looks the address up when Enter is pressed', async () => {
    fakeApi.on('POST sources/resolve', { body: { kind: 'youtube', key: 'UC123', title: 'Chan' } })
    const wrapper = render('', 'youtube')
    await type(wrapper, '@chan')
    await wrapper.get('input').trigger('keydown.enter')
    await flushPromises()
    expect(fakeApi.callsTo('POST sources/resolve')[0]!.args.json).toEqual({
      kind: 'youtube',
      input: '@chan',
    })
    expect(wrapper.props('modelValue')).toBe('UC123')
  })

  it('shows the reason when the address cannot be used, and keeps the value empty', async () => {
    fakeApi.on('POST sources/resolve', {
      status: 422,
      body: {
        error: { code: 'source_error', message: 'No RSS or Atom feed found at this address' },
      },
    })
    const wrapper = render()
    await type(wrapper, 'example.com')
    await wrapper.get('button').trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('No RSS or Atom feed found')
    expect(wrapper.props('modelValue')).toBe('')
  })

  it('treats an edit after a successful lookup as unchecked again', async () => {
    fakeApi.on('POST sources/resolve', {
      body: { kind: 'rss', key: 'https://a.example/f', title: 'A' },
    })
    const wrapper = render()
    await type(wrapper, 'a.example')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.props('modelValue')).toBe('https://a.example/f')

    await type(wrapper, 'b.example')
    expect(wrapper.props('modelValue')).toBe('')
    expect(wrapper.text()).not.toContain('Found:')
  })

  it('starts out checked when it is given an existing value', () => {
    const wrapper = render('https://existing.example/feed')
    expect(wrapper.get('input').element.value).toBe('https://existing.example/feed')
    expect(wrapper.text()).toContain('Address checked')
  })
})
