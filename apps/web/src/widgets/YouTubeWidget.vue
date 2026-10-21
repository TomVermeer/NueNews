<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import type { FeedData, FeedItem } from '../api/types'
import { timeAgo } from '../lib/time'

const props = defineProps<{ data: FeedData; now?: Date }>()
const emit = defineEmits<{ open: [item: FeedItem] }>()

interface ChannelRow {
  id: string
  name: string
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
      items: [item],
    })
  }
  return [...rows.values()]
}

const channels = computed(() => groupByChannel(props.data.items, props.data.sources))
const failing = computed(() => props.data.sources.filter((source) => source.error))
</script>

<template>
  <div>
    <p v-if="data.items.length === 0" class="py-6 text-center text-sm text-ink-muted">
      No videos yet. New uploads show up after the next fetch.
    </p>

    <section v-for="channel in channels" v-else :key="channel.id" class="mb-4 last:mb-0">
      <h3 class="mb-2 truncate text-sm font-semibold text-ink">{{ channel.name }}</h3>
      <ul class="flex gap-3 overflow-x-auto pb-1">
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
              class="mt-1.5 line-clamp-2 text-sm font-medium leading-snug group-hover:text-accent"
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
      class="mt-3 flex items-start gap-1.5 text-xs text-amber-400"
      role="status"
    >
      <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{{ source.title ?? 'A channel' }}: {{ source.error }}</span>
    </p>
  </div>
</template>
