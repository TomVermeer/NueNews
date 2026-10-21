import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { feedData, feedItem } from '../test/factories'
import FeedWidget from './FeedWidget.vue'

const NOW = new Date('2026-02-01T12:00:00Z')

function render(props: Record<string, unknown>) {
  return mount(FeedWidget, { props: { now: NOW, ...props } as never })
}

describe('FeedWidget', () => {
  it('shows a friendly message when there are no items', () => {
    const wrapper = render({ data: feedData([]) })
    expect(wrapper.text()).toContain('No items yet')
  })

  it('shows title, excerpt, source and age for each item', () => {
    const wrapper = render({ data: feedData([feedItem(1)]) })
    expect(wrapper.text()).toContain('Headline 1')
    expect(wrapper.text()).toContain('Excerpt for headline 1')
    expect(wrapper.text()).toContain('Example News · 2 h ago')
  })

  it('links every title to the original page in a new tab, without leaking the opener', () => {
    const wrapper = render({ data: feedData([feedItem(1)]) })
    const link = wrapper.findAll('a').find((a) => a.text() === 'Headline 1')!
    expect(link.attributes()).toMatchObject({
      href: 'https://example.com/articles/1',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('tells the parent when an item is opened', async () => {
    const item = feedItem(1)
    const wrapper = render({ data: feedData([item]) })
    await wrapper
      .findAll('a')
      .find((a) => a.text() === 'Headline 1')!
      .trigger('click')
    expect(wrapper.emitted('open')).toEqual([[item]])
  })

  describe('images', () => {
    it('hotlinks thumbnails without sending a referrer', () => {
      const wrapper = render({ data: feedData([feedItem(1)]) })
      const img = wrapper.get('img')
      expect(img.attributes('src')).toBe('https://img.example.com/1.jpg')
      expect(img.attributes('referrerpolicy')).toBe('no-referrer')
      expect(img.attributes('loading')).toBe('lazy')
    })

    it('hides images when turned off, and for items without one', () => {
      const off = render({ data: feedData([feedItem(1)]), config: { showImages: false } })
      expect(off.find('img').exists()).toBe(false)
      const none = render({ data: feedData([feedItem(1, { imageUrl: null })]) })
      expect(none.find('img').exists()).toBe(false)
    })
  })

  describe('excerpt modes', () => {
    it('hides excerpts when set to none', () => {
      const wrapper = render({ data: feedData([feedItem(1)]), config: { excerpt: 'none' } })
      expect(wrapper.text()).not.toContain('Excerpt for headline 1')
    })

    it('uses a longer clamp when expanded', () => {
      const compact = render({ data: feedData([feedItem(1)]), config: { excerpt: 'compact' } })
      const expanded = render({ data: feedData([feedItem(1)]), config: { excerpt: 'expanded' } })
      expect(compact.find('p.line-clamp-2').text()).toContain('Excerpt')
      expect(expanded.find('p.line-clamp-4').text()).toContain('Excerpt')
    })

    it('leaves out excerpts and images in the plain list layout', () => {
      const wrapper = render({ data: feedData([feedItem(1)]), config: { variant: 'list' } })
      expect(wrapper.text()).toContain('Headline 1')
      expect(wrapper.text()).not.toContain('Excerpt for headline 1')
      expect(wrapper.find('img').exists()).toBe(false)
    })
  })

  describe('unread dots', () => {
    it('are off by default', () => {
      const wrapper = render({ data: feedData([feedItem(1)]) })
      expect(wrapper.find('[data-testid="unread-dot"]').exists()).toBe(false)
    })

    it('mark unread items and fade read ones when enabled', () => {
      const wrapper = render({
        data: feedData([feedItem(1), feedItem(2, { read: true })]),
        config: { unreadDots: true },
      })
      expect(wrapper.findAll('[data-testid="unread-dot"]')).toHaveLength(1)
      expect(wrapper.findAll('[data-testid="read-dot"]')).toHaveLength(1)
      const titles = wrapper.findAll('a.line-clamp-2')
      expect(titles[0]!.classes()).toContain('text-ink')
      expect(titles[1]!.classes()).toContain('text-ink-muted')
    })
  })

  it('warns about sources that are failing', () => {
    const wrapper = render({
      data: feedData([feedItem(1)], {
        sources: [
          {
            id: 's1',
            title: 'Broken feed',
            siteUrl: null,
            iconUrl: null,
            lastFetchedAt: null,
            error: 'error: HTTP 500',
          },
          {
            id: 's2',
            title: 'Fine feed',
            siteUrl: null,
            iconUrl: null,
            lastFetchedAt: null,
            error: null,
          },
        ],
      }),
    })
    const warnings = wrapper.findAll('[role="status"]')
    expect(warnings).toHaveLength(1)
    expect(warnings[0]!.text()).toContain('Broken feed: error: HTTP 500')
  })
})
