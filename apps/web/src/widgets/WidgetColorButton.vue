<script setup lang="ts">
import { Palette } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { WidgetColor } from '@nuenews/shared'
import ColorPicker from '../components/ColorPicker.vue'

const props = defineProps<{ modelValue: WidgetColor | null }>()
const emit = defineEmits<{ select: [color: WidgetColor | null] }>()

const open = ref(false)
const button = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const position = ref({ top: 0, right: 0 })

// The panel is teleported to <body> so no neighbouring widget can paint over it.
const style = computed(() => ({
  top: `${position.value.top}px`,
  right: `${position.value.right}px`,
}))

const choice = computed({
  get: () => props.modelValue,
  set: (color) => {
    emit('select', color)
    close()
  },
})

function toggle() {
  if (open.value) return close()
  const rect = button.value?.getBoundingClientRect()
  if (rect) {
    position.value = { top: rect.bottom + 8, right: window.innerWidth - rect.right }
  }
  open.value = true
}

function close() {
  open.value = false
  button.value?.focus()
}

function onPointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (panel.value?.contains(target) || button.value?.contains(target)) return
  open.value = false
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function dismiss() {
  open.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
    return
  }
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', dismiss)
  window.removeEventListener('scroll', dismiss, true)
})

onBeforeUnmount(() => {
  open.value = false
})
</script>

<template>
  <button
    ref="button"
    type="button"
    class="icon-btn"
    aria-label="Widget color"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="toggle"
  >
    <Palette class="size-4" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      ref="panel"
      role="dialog"
      aria-label="Widget color"
      class="fixed z-50 w-64 rounded-xl border border-line bg-card-high p-2 shadow-2xl"
      :style="style"
    >
      <ColorPicker v-model="choice" />
    </div>
  </Teleport>
</template>
