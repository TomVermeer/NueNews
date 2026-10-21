<script setup lang="ts">
import { GripVertical, RefreshCw, Settings, Trash2 } from 'lucide-vue-next'
import type { Component } from 'vue'
import EditableTitle from './EditableTitle.vue'

defineProps<{
  title: string
  icon: Component
  editing: boolean
  refreshing?: boolean
}>()

defineEmits<{ refresh: []; settings: []; remove: []; rename: [title: string] }>()
</script>

<template>
  <section
    class="flex size-full min-h-0 flex-col rounded-xl border bg-card"
    :class="editing ? 'border-dashed border-accent/50' : 'border-line'"
    :aria-label="title"
  >
    <header class="flex shrink-0 items-center gap-2 px-4 pt-3 pb-2">
      <button
        v-if="editing"
        type="button"
        class="drag-handle icon-btn -ml-1 cursor-grab touch-none active:cursor-grabbing"
        aria-label="Drag to move"
      >
        <GripVertical class="size-4" aria-hidden="true" />
      </button>
      <component :is="icon" v-else class="size-4 shrink-0 text-ink-muted" aria-hidden="true" />

      <EditableTitle :title="title" :editable="editing" @rename="(name) => $emit('rename', name)" />

      <template v-if="editing">
        <button
          type="button"
          class="icon-btn"
          aria-label="Widget settings"
          @click="$emit('settings')"
        >
          <Settings class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn" aria-label="Remove widget" @click="$emit('remove')">
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </template>
      <button
        v-else
        type="button"
        class="icon-btn"
        aria-label="Refresh widget"
        :disabled="refreshing"
        @click="$emit('refresh')"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': refreshing }" aria-hidden="true" />
      </button>
    </header>

    <div class="min-h-0 flex-1 overflow-y-auto px-4 pt-1 pb-4">
      <slot />
    </div>
  </section>
</template>
