<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import { computed } from 'vue'
import type { FeedData, FeedItem } from '../api/types'
import { groupByChannel } from '../lib/channelGroups'
import { timeAgo } from '../lib/time'
import SourceErrors from './SourceErrors.vue'
import SourceGroupHeader from './SourceGroupHeader.vue'

const props = defineProps<{ data: FeedData; now?: Date }>()
const emit = defineEmits<{ open: [item: FeedItem] }>()

const videoCount = (count: number) => `${count} ${count === 1 ? 'video' : 'videos'}`
const channels = computed(() => groupByChannel(props.data.items, props.data.sources))
</script>

<template>
  <div>
    <div v-if="data.items.length === 0" class="py-6 text-center">
      <Inbox class="mx-auto mb-2 size-6 text-ink-muted" aria-hidden="true" />
      <p class="text-sm text-ink-muted">No videos yet. New uploads show up after the next fetch.</p>
    </div>

    <template v-else>
      <section v-for="channel in channels" :key="channel.id" class="mb-6 last:mb-0">
        <SourceGroupHeader
          :name="channel.name"
          :url="channel.url"
          :icon-url="channel.iconUrl"
          :count="videoCount(channel.items.length)"
        />
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
    </template>

    <SourceErrors :sources="data.sources" fallback-name="A channel" class="mt-3" />
  </div>
</template>
