<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import type { FeedData, FeedItem } from '../api/types'
import { timeAgo } from '../lib/time'

const props = defineProps<{ data: FeedData; now?: Date }>()
const emit = defineEmits<{ open: [item: FeedItem] }>()

const failing = computed(() => props.data.sources.filter((source) => source.error))
</script>

<template>
  <div>
    <p v-if="data.items.length === 0" class="py-6 text-center text-sm text-ink-muted">
      No videos yet. New uploads show up after the next fetch.
    </p>

    <ul v-else class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3">
      <li v-for="item in data.items" :key="item.id" class="min-w-0">
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
            {{
              [item.sourceName, timeAgo(item.publishedAt, props.now)].filter(Boolean).join(' · ')
            }}
          </p>
        </a>
      </li>
    </ul>

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
