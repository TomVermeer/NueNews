import type { FeedData, FeedItem } from '../api/types'

/** The videos of one channel, with what its group header shows. */
export interface ChannelGroup {
  readonly id: string
  readonly name: string
  readonly url: string | null
  readonly iconUrl: string | null
  readonly items: FeedItem[]
}

/**
 * Groups items by the channel they came from. Items arrive newest first, so channels end up
 * ordered by their latest upload, and each channel's videos stay newest first.
 */
export function groupByChannel(
  items: readonly FeedItem[],
  sources: FeedData['sources'],
): ChannelGroup[] {
  const groups = new Map<string, ChannelGroup>()
  for (const item of items) {
    const group = groups.get(item.sourceId)
    if (group) {
      group.items.push(item)
      continue
    }
    const title = sources.find((source) => source.id === item.sourceId)?.title
    groups.set(item.sourceId, {
      id: item.sourceId,
      name: item.sourceName ?? title ?? 'Unknown channel',
      url: item.sourceUrl,
      iconUrl: item.sourceIconUrl,
      items: [item],
    })
  }
  return [...groups.values()]
}
