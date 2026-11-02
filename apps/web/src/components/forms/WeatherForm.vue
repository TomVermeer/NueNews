<script setup lang="ts">
import { LoaderCircle, MapPin } from 'lucide-vue-next'
import { computed, reactive, toRef } from 'vue'
import type { GeocodeResult, WeatherConfig } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { useFormSubmit } from '../../composables/useFormSubmit'
import { useGeocodeSearch } from '../../composables/useGeocodeSearch'
import TitleField from './TitleField.vue'
import ErrorMessage from '../ErrorMessage.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<WeatherConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: WeatherConfig }] }>()

const initialUnits: WeatherConfig['units'] = props.initial?.config.units ?? 'metric'

const form = reactive({
  title: props.initial?.title ?? 'Weather',
  location: props.initial?.config.location ?? null,
  units: initialUnits,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() => (form.location ? `Weather · ${form.location.name}` : undefined)),
  { auto: !props.initial },
)

const { query, results, searching, searchError, clear } = useGeocodeSearch()

function placeLabel(place: GeocodeResult) {
  return [place.name, place.region, place.country].filter(Boolean).join(', ')
}

function choose(place: GeocodeResult) {
  form.location = { name: place.name, lat: place.lat, lon: place.lon }
  clear()
}

const problem = computed(() => {
  if (!form.location) return 'Choose a location'
  if (!form.title.trim()) return 'Give the widget a title'
  return ''
})

const { shownProblem, submit } = useFormSubmit(problem, () => {
  if (!form.location) return
  emit('submit', {
    title: form.title.trim(),
    config: { location: form.location, units: form.units },
  })
})

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <TitleField id="weather-title" v-model="form.title" @edit="autoTitle.markEdited()" />

    <div>
      <label class="field-label" for="weather-search">Location</label>
      <p v-if="form.location" class="mb-2 flex items-center gap-1.5 text-sm">
        <MapPin class="size-4 text-accent" aria-hidden="true" /> {{ form.location.name }}
      </p>
      <div class="relative">
        <input
          id="weather-search"
          v-model="query"
          class="field"
          placeholder="Search for a city"
          autocomplete="off"
        />
        <LoaderCircle
          v-if="searching"
          class="absolute top-2.5 right-3 size-4 animate-spin text-ink-muted"
          aria-hidden="true"
        />
      </div>
      <ul
        v-if="results.length"
        class="mt-2 divide-y divide-line rounded-lg border border-line"
        aria-label="Search results"
      >
        <li v-for="place in results" :key="`${place.lat},${place.lon}`">
          <button
            type="button"
            class="min-h-12 w-full px-3 py-2 text-left text-sm hover:bg-line"
            @click="choose(place)"
          >
            {{ placeLabel(place) }}
          </button>
        </li>
      </ul>
      <ErrorMessage v-else-if="searchError" class="mt-1 text-xs" role="status">
        {{ searchError }}
      </ErrorMessage>
    </div>

    <fieldset>
      <legend class="field-label">Units</legend>
      <div class="flex gap-4 text-sm">
        <label class="flex items-center gap-2"
          ><input v-model="form.units" type="radio" value="metric" /> °C</label
        >
        <label class="flex items-center gap-2"
          ><input v-model="form.units" type="radio" value="imperial" /> °F</label
        >
      </div>
    </fieldset>

    <ErrorMessage v-if="shownProblem" class="text-xs">{{ shownProblem }}</ErrorMessage>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
