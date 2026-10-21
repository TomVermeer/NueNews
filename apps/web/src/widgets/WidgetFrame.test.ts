import { mount } from '@vue/test-utils'
import { Rss } from 'lucide-vue-next'
import { describe, expect, it } from 'vitest'
import WidgetFrame from './WidgetFrame.vue'

const render = (props: { editing: boolean; refreshing?: boolean }) =>
  mount(WidgetFrame, {
    props: { title: 'News', icon: Rss, ...props },
    slots: { default: '<p>Body content</p>' },
  })

describe('WidgetFrame', () => {
  it('shows the title and its content', () => {
    const wrapper = render({ editing: false })
    expect(wrapper.get('h2').text()).toBe('News')
    expect(wrapper.text()).toContain('Body content')
  })

  it('only lets you rename the title while editing', async () => {
    expect(render({ editing: false }).find('[aria-label="Rename widget"]').exists()).toBe(false)

    const wrapper = render({ editing: true })
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')
    await wrapper.get('input').setValue('Tech')
    await wrapper.get('input').trigger('keydown.enter')
    expect(wrapper.emitted('rename')).toEqual([['Tech']])
  })

  describe('in view mode', () => {
    it('offers a refresh button and no editing controls', async () => {
      const wrapper = render({ editing: false })
      expect(wrapper.find('[aria-label="Widget settings"]').exists()).toBe(false)
      expect(wrapper.find('[aria-label="Remove widget"]').exists()).toBe(false)
      expect(wrapper.find('.drag-handle').exists()).toBe(false)

      await wrapper.get('[aria-label="Refresh widget"]').trigger('click')
      expect(wrapper.emitted('refresh')).toHaveLength(1)
    })

    it('disables the refresh button and spins while refreshing', () => {
      const wrapper = render({ editing: false, refreshing: true })
      const button = wrapper.get('[aria-label="Refresh widget"]')
      expect(button.attributes('disabled')).toBeDefined()
      expect(button.find('svg').classes()).toContain('animate-spin')
    })
  })

  describe('in edit mode', () => {
    it('shows a drag handle, settings and remove instead of refresh', () => {
      const wrapper = render({ editing: true })
      expect(wrapper.find('.drag-handle').exists()).toBe(true)
      expect(wrapper.find('[aria-label="Refresh widget"]').exists()).toBe(false)
    })

    it('emits settings and remove', async () => {
      const wrapper = render({ editing: true })
      await wrapper.get('[aria-label="Widget settings"]').trigger('click')
      await wrapper.get('[aria-label="Remove widget"]').trigger('click')
      expect(wrapper.emitted('settings')).toHaveLength(1)
      expect(wrapper.emitted('remove')).toHaveLength(1)
    })

    it('is outlined with a dashed border', () => {
      expect(render({ editing: true }).get('section').classes()).toContain('border-dashed')
      expect(render({ editing: false }).get('section').classes()).not.toContain('border-dashed')
    })
  })
})
