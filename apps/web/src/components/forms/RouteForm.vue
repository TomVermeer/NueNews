<script setup lang="ts">
import { computed, reactive, toRef } from 'vue'
import { routeModeSchema, type RouteConfig, type RouteMode } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { useFormSubmit } from '../../composables/useFormSubmit'
import { ROUTE_MODE_LABELS } from '../../lib/routeModes'
import TitleField from './TitleField.vue'
import ErrorMessage from '../ErrorMessage.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<RouteConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: RouteConfig }] }>()

const DEFAULT_SWAP_TIME = '12:00'
const MAX_TITLE_LENGTH = 80

const initialMode: RouteMode = props.initial?.config.mode ?? 'driving'

const form = reactive({
  title: props.initial?.title ?? 'Route',
  origin: props.initial?.config.origin ?? '',
  destination: props.initial?.config.destination ?? '',
  mode: initialMode,
  autoSwap: props.initial?.config.autoSwapAt !== undefined,
  swapTime: props.initial?.config.autoSwapAt ?? DEFAULT_SWAP_TIME,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() => {
    const origin = form.origin.trim()
    const destination = form.destination.trim()
    if (!origin || !destination) return undefined
    return `${origin} → ${destination}`.slice(0, MAX_TITLE_LENGTH)
  }),
  { auto: !props.initial },
)

const problem = computed(() => {
  if (!form.origin.trim()) return 'Enter a starting point'
  if (!form.destination.trim()) return 'Enter a destination'
  if (!form.title.trim()) return 'Give the widget a title'
  if (form.autoSwap && !form.swapTime) return 'Choose the time of the swap'
  return ''
})

const { shownProblem, submit } = useFormSubmit(problem, () => {
  emit('submit', {
    title: form.title.trim(),
    config: {
      origin: form.origin.trim(),
      destination: form.destination.trim(),
      mode: form.mode,
      // Editing the addresses must not undo a swap the user made on the card.
      reversed: props.initial?.config.reversed ?? false,
      ...(form.autoSwap ? { autoSwapAt: form.swapTime } : {}),
    },
  })
})

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <TitleField id="route-title" v-model="form.title" @edit="autoTitle.markEdited()" />

    <div>
      <label class="field-label" for="route-origin">From</label>
      <input
        id="route-origin"
        v-model="form.origin"
        class="field"
        placeholder="Address or place name"
        maxlength="200"
        autocomplete="off"
      />
    </div>

    <div>
      <label class="field-label" for="route-destination">To</label>
      <input
        id="route-destination"
        v-model="form.destination"
        class="field"
        placeholder="Address or place name"
        maxlength="200"
        autocomplete="off"
      />
    </div>

    <fieldset>
      <legend class="field-label">Travel by</legend>
      <div class="flex flex-wrap gap-x-4 text-sm">
        <label
          v-for="mode in routeModeSchema.options"
          :key="mode"
          class="flex min-h-12 items-center gap-2"
          ><input v-model="form.mode" type="radio" :value="mode" />
          {{ ROUTE_MODE_LABELS[mode] }}</label
        >
      </div>
    </fieldset>

    <div>
      <label class="flex min-h-12 items-center gap-2 text-sm"
        ><input id="route-auto-swap" v-model="form.autoSwap" type="checkbox" /> Swap the direction
        at a set time</label
      >
      <div v-if="form.autoSwap" class="mt-1">
        <label class="field-label" for="route-swap-time">Swap at</label>
        <input id="route-swap-time" v-model="form.swapTime" type="time" class="field w-32" />
        <p class="mt-1 text-xs text-ink-muted">
          Before this time the route goes from start to destination. From then on it goes back.
        </p>
      </div>
    </div>

    <ErrorMessage v-if="shownProblem" class="text-xs">{{ shownProblem }}</ErrorMessage>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
