<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  name: string
  /** Where the source lives; without it the name is not a link. */
  url: string | null
  iconUrl: string | null
  /** Shown on the right, e.g. "3 videos". */
  count: string
}>()

const link = computed(() =>
  props.url ? { href: props.url, target: '_blank', rel: 'noopener noreferrer' } : {},
)
</script>

<template>
  <header class="-mx-4 flex items-center gap-3 border-b border-line px-4 pt-1 pb-2">
    <component
      :is="url ? 'a' : 'div'"
      v-bind="link"
      class="group flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <img
        v-if="iconUrl"
        :src="iconUrl"
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
        {{ name.charAt(0).toUpperCase() }}
      </span>
      <h3 class="min-w-0 flex-1 truncate text-base/6 font-medium text-ink group-hover:text-accent">
        {{ name }}
      </h3>
    </component>
    <span class="shrink-0 text-xs/4 font-medium text-ink-muted">
      {{ count }}
    </span>
  </header>
</template>
