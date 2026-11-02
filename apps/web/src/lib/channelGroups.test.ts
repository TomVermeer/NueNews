import { describe, expect, it } from 'vitest'
import { feedItem } from '../test/factories'
import { groupByChannel } from './channelGroups'

const source = { siteUrl: null, iconUrl: null, lastFetchedAt: null, error: null }

describe('groupByChannel', () => {
  it('groups items per channel in order of each channel’s latest upload', () => {
    const items = [
      feedItem(1, { sourceId: 'a', sourceName: 'Fireship' }),
      feedItem(2, { sourceId: 'b', sourceName: 'Veritasium' }),
      feedItem(3, { sourceId: 'a', sourceName: 'Fireship' }),
    ]
    const groups = groupByChannel(items, [])

    expect(groups.map((group) => group.name)).toEqual(['Fireship', 'Veritasium'])
    expect(groups[0]?.items.map((item) => item.id)).toEqual(['item-1', 'item-3'])
    expect(groups[1]?.items.map((item) => item.id)).toEqual(['item-2'])
  })

  it('takes the channel link and avatar from its first item', () => {
    const items = [
      feedItem(1, {
        sourceId: 'a',
        sourceUrl: 'https://www.youtube.com/channel/UCa',
        sourceIconUrl: 'https://yt3.example/a.jpg',
      }),
    ]
    expect(groupByChannel(items, [])).toEqual([
      {
        id: 'a',
        name: 'Example News',
        url: 'https://www.youtube.com/channel/UCa',
        iconUrl: 'https://yt3.example/a.jpg',
        items,
      },
    ])
  })

  it('names a channel after its source when the item has no name, else "Unknown channel"', () => {
    const items = [
      feedItem(1, { sourceId: 'a', sourceName: null }),
      feedItem(2, { sourceId: 'b', sourceName: null }),
    ]
    const groups = groupByChannel(items, [{ id: 'a', title: 'From source', ...source }])
    expect(groups.map((group) => group.name)).toEqual(['From source', 'Unknown channel'])
  })

  it('returns no groups for no items', () => {
    expect(groupByChannel([], [])).toEqual([])
  })
})
