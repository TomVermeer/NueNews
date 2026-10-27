<script setup lang="ts">
import { Inbox, TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import type { FeedData, FeedItem } from '../api/types'
import { timeAgo } from '../lib/time'

const props = defineProps<{ data: FeedData; now?: Date }>()
const emit = defineEmits<{ open: [item: FeedItem] }>()

interface ChannelRow {
  id: string
  name: string
  url: string | null
  iconUrl: string | null
  items: FeedItem[]
}

// Items arrive newest first, so channels end up ordered by their latest upload.
function groupByChannel(items: FeedItem[], sources: FeedData['sources']): ChannelRow[] {
  const rows = new Map<string, ChannelRow>()
  for (const item of items) {
    const row = rows.get(item.sourceId)
    if (row) {
      row.items.push(item)
      continue
    }
    const title = sources.find((source) => source.id === item.sourceId)?.title
    rows.set(item.sourceId, {
      id: item.sourceId,
      name: item.sourceName ?? title ?? 'Unknown channel',
      url: item.sourceUrl,
      iconUrl: item.sourceIconUrl,
      items: [item],
    })
  }
  return [...rows.values()]
}

const channelLink = (url: string | null) =>
  url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : {}
const videoCount = (count: number) => `${count} ${count === 1 ? 'video' : 'videos'}`
const channels = computed(() => groupByChannel(props.data.items, props.data.sources))
const failing = computed(() => props.data.sources.filter((source) => source.error))
</script>

<template>
  <div>
    <div v-if="data.items.length === 0" class="py-6 text-center">
      <Inbox class="mx-auto mb-2 size-6 text-ink-muted" aria-hidden="true" />
      <p class="text-sm text-ink-muted">No videos yet. New uploads show up after the next fetch.</p>
    </div>

    <section v-for="channel in channels" v-else :key="channel.id" class="mb-6 last:mb-0">
      <header class="-mx-4 flex items-center gap-3 border-b border-line px-4 pt-1 pb-2">
        <component
          :is="channel.url ? 'a' : 'div'"
          v-bind="channelLink(channel.url)"
          class="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <img
            v-if="channel.iconUrl"
            :src="channel.iconUrl"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            class="size-8 shrink-0 rounded-full object-cover"
          />
          <span
            v-else
            class="grid size-8 shrink-0 place-items-center rounded-full bg-accent-container text-xs/4 font-medium text-accent"
            aria-hidden="true"
          >
            {{ channel.name.charAt(0).toUpperCase() }}
          </span>
          <h3
            class="min-w-0 flex-1 truncate text-base/6 font-medium text-ink group-hover:text-accent"
          >
            {{ channel.name }}
          </h3>
        </component>
        <span class="shrink-0 text-xs/4 font-medium text-ink-muted">
          {{ videoCount(channel.items.length) }}
        </span>
      </header>
      <ul class="mt-4 flex gap-3 overflow-x-auto pb-1">
        <li v-for="item in channel.items" :key="item.id" class="w-44 shrink-0">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="group block"
            @click="emit('open', item)"
          >
            <div class="aspect-video overflow-hidden rounded-lg bg-line">
              <img
                v-if="item.imageUrl"
                :src="item.imageUrl"
                alt=""
                loading="lazy"
                referrerpolicy="no-referrer"
                class="size-full object-cover"
              />
            </div>
            <p
              class="mt-1.5 line-clamp-2 text-sm/5 font-medium group-hover:text-accent"
              :class="item.read ? 'text-ink-muted' : 'text-ink'"
            >
              {{ item.title }}
            </p>
            <p class="mt-0.5 truncate text-xs text-ink-muted">
              {{ timeAgo(item.publishedAt, props.now) }}
            </p>
          </a>
        </li>
      </ul>
    </section>

    <p
      v-for="source in failing"
      :key="source.id"
      class="mt-3 flex items-start gap-1.5 text-xs text-warning"
      role="status"
    >
      <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{{ source.title ?? 'A channel' }}: {{ source.error }}</span>
    </p>
  </div>
</template>
