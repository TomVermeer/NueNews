<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'
import { computed } from 'vue'
import { feedConfigSchema } from '@nuenews/shared'
import type { FeedData, FeedItem } from '../api/types'
import { timeAgo } from '../lib/time'
import SourceErrors from './SourceErrors.vue'

const displaySchema = feedConfigSchema.pick({
  excerpt: true,
  showImages: true,
  unreadDots: true,
  variant: true,
})

const props = defineProps<{
  data: FeedData
  config?: Record<string, unknown>
  now?: Date
}>()

const emit = defineEmits<{ open: [item: FeedItem] }>()

// Missing options get the schema's defaults; a config that does not parse gets all of them.
const display = computed(
  () => displaySchema.safeParse(props.config ?? {}).data ?? displaySchema.parse({}),
)

// A feed that never has images keeps the plain layout instead of a column of empty placeholders.
const showThumbnails = computed(
  () =>
    display.value.variant === 'cards' &&
    display.value.showImages &&
    props.data.items.some((item) => item.imageUrl),
)

function meta(item: FeedItem): string {
  return [item.sourceName, timeAgo(item.publishedAt, props.now)].filter(Boolean).join(' · ')
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <div v-if="data.items.length === 0" class="py-6 text-center">
      <Inbox class="mx-auto mb-2 size-6 text-ink-muted" aria-hidden="true" />
      <p class="text-sm text-ink-muted">No items yet. New items show up after the next fetch.</p>
    </div>

    <ul v-else class="divide-y divide-line">
      <li v-for="item in data.items" :key="item.id" class="flex gap-3 py-3 first:pt-0 last:pb-0">
        <span
          v-if="display.unreadDots"
          class="mt-1.5 size-1.5 shrink-0 rounded-full"
          :class="item.read ? 'bg-transparent' : 'bg-accent'"
          :data-testid="item.read ? 'read-dot' : 'unread-dot'"
        />

        <a
          v-if="showThumbnails"
          :href="item.url"
          target="_blank"
          rel="noopener noreferrer"
          tabindex="-1"
          aria-hidden="true"
          class="shrink-0"
          @click="emit('open', item)"
        >
          <img
            v-if="item.imageUrl"
            :src="item.imageUrl"
            alt=""
            loading="lazy"
            referrerpolicy="no-referrer"
            class="size-14 rounded-lg bg-line object-cover"
          />
          <div v-else class="size-14 rounded-lg bg-line" data-testid="thumbnail-placeholder" />
        </a>

        <div class="min-w-0 flex-1">
          <a
            :href="item.url"
            target="_blank"
            rel="noopener noreferrer"
            class="line-clamp-2 text-sm/5 font-medium hover:text-accent"
            :class="item.read ? 'text-ink-muted' : 'text-ink'"
            @click="emit('open', item)"
            >{{ item.title }}</a
          >
          <p
            v-if="item.excerpt && display.excerpt !== 'none' && display.variant === 'cards'"
            class="mt-0.5 text-xs text-ink-muted"
            :class="display.excerpt === 'expanded' ? 'line-clamp-4' : 'line-clamp-2'"
          >
            {{ item.excerpt }}
          </p>
          <p class="mt-1 truncate text-xs text-ink-muted">{{ meta(item) }}</p>
        </div>
      </li>
    </ul>

    <SourceErrors :sources="data.sources" fallback-name="A source" class="mt-2" />
  </div>
</template>
