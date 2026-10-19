<script setup lang="ts">
import { Check, LoaderCircle, TriangleAlert } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import type { SourceKind } from '@nuenews/shared'
import { api, unwrap } from '../../api/client'

const props = defineProps<{
  kind: SourceKind
  placeholder?: string
  label: string
}>()

/** The canonical value (feed URL or channel ID). Empty until the address has been looked up. */
const model = defineModel<string>({ required: true })

const emit = defineEmits<{ resolved: [result: { key: string; title?: string }] }>()

const text = ref(model.value)
const state = ref<'idle' | 'loading' | 'ok' | 'error'>(model.value ? 'ok' : 'idle')
const title = ref('')
const message = ref('')

// An edit after a successful lookup invalidates it.
watch(text, (value) => {
  if (state.value === 'ok' && value !== model.value) {
    state.value = 'idle'
    model.value = ''
  }
})

async function lookUp() {
  const input = text.value.trim()
  if (!input || state.value === 'loading') return

  state.value = 'loading'
  message.value = ''
  try {
    const result = await unwrap<{ key: string; title?: string }>(
      api.sources.resolve.$post({ json: { kind: props.kind, input } }),
    )
    model.value = result.key
    text.value = result.key
    title.value = result.title ?? ''
    state.value = 'ok'
    emit('resolved', result)
  } catch (error) {
    state.value = 'error'
    message.value = error instanceof Error ? error.message : 'Could not look that up'
  }
}
</script>

<template>
  <div>
    <div class="flex gap-2">
      <input
        v-model="text"
        class="field"
        :placeholder="placeholder"
        :aria-label="label"
        @keydown.enter.prevent="lookUp"
      />
      <button
        type="button"
        class="btn shrink-0"
        :disabled="state === 'loading' || !text.trim()"
        @click="lookUp"
      >
        <LoaderCircle v-if="state === 'loading'" class="size-4 animate-spin" aria-hidden="true" />
        Look up
      </button>
    </div>
    <p
      v-if="state === 'ok'"
      class="mt-1 flex items-center gap-1 text-xs text-emerald-400"
      role="status"
    >
      <Check class="size-3.5" aria-hidden="true" />
      {{ title ? `Found: ${title}` : 'Address checked' }}
    </p>
    <p
      v-else-if="state === 'error'"
      class="mt-1 flex items-start gap-1 text-xs text-amber-400"
      role="alert"
    >
      <TriangleAlert class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      {{ message }}
    </p>
  </div>
</template>
