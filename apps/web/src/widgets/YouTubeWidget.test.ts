import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { feedData, feedItem } from '../test/factories'
import YouTubeWidget from './YouTubeWidget.vue'

const NOW = new Date('2026-02-01T12:00:00Z')
const render = (props: Record<string, unknown>) =>
  mount(YouTubeWidget, { props: { now: NOW, ...props } as never })

describe('YouTubeWidget', () => {
  it('shows a message when there are no videos', () => {
    expect(render({ data: feedData([]) }).text()).toContain('No videos yet')
  })

  it('shows thumbnail, title, channel and age, linking out to YouTube', () => {
    const item = feedItem(1, { url: 'https://www.youtube.com/watch?v=abc', sourceName: 'Fireship' })
    const wrapper = render({ data: feedData([item]) })

    expect(wrapper.text()).toContain('Headline 1')
    expect(wrapper.text()).toContain('Fireship')
    expect(wrapper.text()).toContain('2 h ago')
    const link = wrapper.get('a')
    expect(link.attributes()).toMatchObject({
      href: 'https://www.youtube.com/watch?v=abc',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
    expect(wrapper.get('img').attributes('referrerpolicy')).toBe('no-referrer')
  })

  it('groups videos into one row per channel, ordered by latest upload', () => {
    const items = [
      feedItem(1, { sourceId: 'a', sourceName: 'Fireship' }),
      feedItem(2, { sourceId: 'b', sourceName: 'Veritasium' }),
      feedItem(3, { sourceId: 'a', sourceName: 'Fireship' }),
    ]
    const wrapper = render({ data: feedData(items) })

    const rows = wrapper.findAll('section')
    expect(rows.map((row) => row.get('h3').text())).toEqual(['Fireship', 'Veritasium'])
    expect(rows[0]!.findAll('li').map((li) => li.text())).toEqual([
      expect.stringContaining('Headline 1'),
      expect.stringContaining('Headline 3'),
    ])
    expect(rows[1]!.findAll('li')).toHaveLength(1)
  })

  it('does not embed a player', () => {
    const wrapper = render({ data: feedData([feedItem(1)]) })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('emits open when a video is clicked', async () => {
    const item = feedItem(1)
    const wrapper = render({ data: feedData([item]) })
    await wrapper.get('a').trigger('click')
    expect(wrapper.emitted('open')).toEqual([[item]])
  })

  it('dims videos that were opened already', () => {
    const wrapper = render({ data: feedData([feedItem(1), feedItem(2, { read: true })]) })
    const titles = wrapper.findAll('p.line-clamp-2')
    expect(titles[0]!.classes()).toContain('text-ink')
    expect(titles[1]!.classes()).toContain('text-ink-muted')
  })

  it('warns about a channel that is failing', () => {
    const wrapper = render({
      data: feedData([feedItem(1)], {
        sources: [
          {
            id: 's',
            title: 'Some channel',
            siteUrl: null,
            lastFetchedAt: null,
            error: 'error: HTTP 404',
          },
        ],
      }),
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Some channel: error: HTTP 404')
  })
})
