<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import type { FeedData } from '../api/types'

// Renders one line per failing source with no wrapper, so classes such as spacing go on each line.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  sources: FeedData['sources']
  /** What to call a failing source that has no title, e.g. "A channel". */
  fallbackName: string
}>()

const failing = computed(() => props.sources.filter((source) => source.error))
</script>

<template>
  <p
    v-for="source in failing"
    :key="source.id"
    v-bind="$attrs"
    class="flex items-start gap-1.5 text-xs text-warning"
    role="status"
  >
    <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
    <span>{{ source.title ?? fallbackName }}: {{ source.error }}</span>
  </p>
</template>
