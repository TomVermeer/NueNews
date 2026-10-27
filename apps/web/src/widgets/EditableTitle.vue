<script setup lang="ts">
import { Pencil } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'

const props = defineProps<{ title: string; editable: boolean }>()
const emit = defineEmits<{ rename: [title: string] }>()

const renaming = ref(false)
const draft = ref('')
const input = ref<HTMLInputElement | null>(null)

async function start() {
  draft.value = props.title
  renaming.value = true
  await nextTick()
  input.value?.select()
}

function commit() {
  if (!renaming.value) return
  renaming.value = false
  const title = draft.value.trim()
  if (title && title !== props.title) emit('rename', title)
}

function cancel() {
  renaming.value = false
}
</script>

<template>
  <input
    v-if="renaming"
    ref="input"
    v-model="draft"
    class="field min-w-0 flex-1 py-1"
    maxlength="80"
    aria-label="Widget title"
    @keydown.enter.prevent="commit"
    @keydown.esc.prevent="cancel"
    @blur="commit"
  />
  <h2 v-else class="min-w-0 flex-1 text-sm/5 font-medium text-ink-muted">
    <button
      v-if="editable"
      type="button"
      class="group -mx-2 flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-line hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      aria-label="Rename widget"
      @click="start"
    >
      <span class="truncate">{{ title }}</span>
      <Pencil class="size-3 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden="true" />
    </button>
    <span v-else class="block truncate">{{ title }}</span>
  </h2>
</template>
