<script setup lang="ts">
import { useQueryClient } from '@tanstack/vue-query'
import { computed } from 'vue'
import { ApiRequestError } from '../api/client'
import { keys, useItemStateMutation, useWidgetDataQuery } from '../api/queries'
import {
  isFeedData,
  isWeatherData,
  type FeedItem,
  type WidgetData,
  type WidgetDto,
} from '../api/types'
import FeedWidget from './FeedWidget.vue'
import WeatherWidget from './WeatherWidget.vue'
import YouTubeWidget from './YouTubeWidget.vue'

const props = defineProps<{ widget: WidgetDto }>()

const query = useWidgetDataQuery(() => props.widget.id)
const client = useQueryClient()
const itemState = useItemStateMutation()

const errorMessage = computed(() => {
  const error = query.error.value
  if (!error) return ''
  return error instanceof ApiRequestError ? error.message : 'Something went wrong'
})

/** Opening an item marks it read, and the list updates immediately without waiting for the server. */
function markRead(item: FeedItem) {
  if (item.read) return
  client.setQueryData<WidgetData>(keys.widgetData(props.widget.id), (old) =>
    old && isFeedData(old)
      ? {
          ...old,
          items: old.items.map((i) => (i.id === item.id ? { ...i, read: true, seen: true } : i)),
        }
      : old,
  )
  itemState.mutate({ ids: [item.id], action: 'read' })
}
</script>

<template>
  <div v-if="query.isPending.value" class="space-y-3" aria-busy="true" aria-label="Loading">
    <div v-for="n in 3" :key="n" class="flex gap-3">
      <div class="size-12 animate-pulse rounded-lg bg-line" />
      <div class="flex-1 space-y-2 pt-1">
        <div class="h-3 w-4/5 animate-pulse rounded bg-line" />
        <div class="h-3 w-2/5 animate-pulse rounded bg-line" />
      </div>
    </div>
  </div>

  <div v-else-if="query.isError.value && !query.data.value" class="py-4 text-center" role="alert">
    <p class="text-sm text-ink-muted">{{ errorMessage }}</p>
    <button type="button" class="btn mt-3" @click="query.refetch()">Try again</button>
  </div>

  <template v-else-if="query.data.value">
    <WeatherWidget v-if="isWeatherData(query.data.value)" :data="query.data.value" />
    <YouTubeWidget
      v-else-if="widget.type === 'youtube' && isFeedData(query.data.value)"
      :data="query.data.value"
      @open="markRead"
    />
    <FeedWidget
      v-else-if="isFeedData(query.data.value)"
      :data="query.data.value"
      :config="widget.config"
      @open="markRead"
    />
  </template>
</template>
