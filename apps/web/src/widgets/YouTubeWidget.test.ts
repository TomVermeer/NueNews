import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { feedData, feedItem } from '../test/factories'
import YouTubeWidget from './YouTubeWidget.vue'

const NOW = new Date('2026-02-01T12:00:00Z')
type Props = InstanceType<typeof YouTubeWidget>['$props']

const render = (props: Omit<Props, 'now'>) =>
  mount(YouTubeWidget, { props: { now: NOW, ...props } })

describe('YouTubeWidget', () => {
  it('shows a message with an icon when there are no videos', () => {
    const wrapper = render({ data: feedData([]) })
    expect(wrapper.text()).toContain('No videos yet')
    expect(wrapper.find('svg[aria-hidden="true"]').exists()).toBe(true)
  })

  it('shows thumbnail, title, channel and age, linking out to YouTube', () => {
    const item = feedItem(1, { url: 'https://www.youtube.com/watch?v=abc', sourceName: 'Fireship' })
    const wrapper = render({ data: feedData([item]) })

    expect(wrapper.text()).toContain('Headline 1')
    expect(wrapper.text()).toContain('Fireship')
    expect(wrapper.text()).toContain('2 h ago')
    const link = wrapper.get('ul a')
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
    expect(rows[0]!.get('header').text()).toContain('2 videos')
    expect(rows[1]!.get('header').text()).toContain('1 video')
    expect(rows[1]!.get('header').text()).not.toContain('1 videos')
  })

  it('links the channel name to the channel on YouTube', () => {
    const item = feedItem(1, {
      sourceName: 'Fireship',
      sourceUrl: 'https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA',
    })
    const link = render({ data: feedData([item]) }).get('header a')

    expect(link.text()).toContain('Fireship')
    expect(link.attributes()).toMatchObject({
      href: 'https://www.youtube.com/channel/UCsBjURrPoezykLs9EqgamOA',
      target: '_blank',
      rel: 'noopener noreferrer',
    })
  })

  it('shows the channel avatar, or the first letter when there is none', () => {
    const withIcon = render({
      data: feedData([feedItem(1, { sourceIconUrl: 'https://yt3.example/a.jpg' })]),
    })
    const avatar = withIcon.get('header img')
    expect(avatar.attributes('src')).toBe('https://yt3.example/a.jpg')
    expect(avatar.attributes('referrerpolicy')).toBe('no-referrer')

    const withoutIcon = render({
      data: feedData([feedItem(1, { sourceName: 'fireship', sourceIconUrl: null })]),
    })
    expect(withoutIcon.find('header img').exists()).toBe(false)
    expect(withoutIcon.get('header span[aria-hidden="true"]').text()).toBe('F')
  })

  it('does not link a channel whose address is unknown', () => {
    const wrapper = render({ data: feedData([feedItem(1, { sourceUrl: null })]) })
    expect(wrapper.find('header a').exists()).toBe(false)
  })

  it('does not embed a player', () => {
    const wrapper = render({ data: feedData([feedItem(1)]) })
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('emits open when a video is clicked', async () => {
    const item = feedItem(1)
    const wrapper = render({ data: feedData([item]) })
    await wrapper.get('ul a').trigger('click')
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
            iconUrl: null,
            lastFetchedAt: null,
            error: 'error: HTTP 404',
          },
        ],
      }),
    })
    expect(wrapper.get('[role="status"]').text()).toContain('Some channel: error: HTTP 404')
  })
})
