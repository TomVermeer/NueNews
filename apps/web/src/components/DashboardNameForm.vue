<script setup lang="ts">
import { Check, X } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

const props = defineProps<{
  /** The input's accessible name. */
  label: string
  /** The submit button's accessible name. */
  submitLabel: string
  initialName?: string
  placeholder?: string
  /** Show a cancel button next to the submit button. */
  cancelable?: boolean
}>()

/** `submit` carries the trimmed name; an empty name cancels instead. */
const emit = defineEmits<{ submit: [name: string]; cancel: [] }>()

const name = ref(props.initialName ?? '')
const input = ref<HTMLInputElement | null>(null)

onMounted(() => input.value?.focus())

function submit() {
  const trimmed = name.value.trim()
  if (trimmed) emit('submit', trimmed)
  else emit('cancel')
}
</script>

<template>
  <form class="flex items-center gap-1" @submit.prevent="submit">
    <input
      ref="input"
      v-model="name"
      class="field !w-36 !py-1"
      :placeholder="placeholder"
      :aria-label="label"
      maxlength="60"
      @keydown.esc="emit('cancel')"
    />
    <button type="submit" class="icon-btn" :aria-label="submitLabel">
      <Check class="size-4" aria-hidden="true" />
    </button>
    <button
      v-if="cancelable"
      type="button"
      class="icon-btn"
      aria-label="Cancel"
      @click="emit('cancel')"
    >
      <X class="size-4" aria-hidden="true" />
    </button>
  </form>
</template>
