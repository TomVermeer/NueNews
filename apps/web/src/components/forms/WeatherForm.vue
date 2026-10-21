<script setup lang="ts">
import { LoaderCircle, MapPin } from 'lucide-vue-next'
import { computed, onBeforeUnmount, reactive, ref, toRef, watch } from 'vue'
import type { GeocodeResult, WeatherConfig } from '@nuenews/shared'
import { api, unwrap } from '../../api/client'
import { useAutoTitle } from '../../composables/useAutoTitle'

const props = defineProps<{
  initial?: { title: string; config: Partial<WeatherConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: WeatherConfig }] }>()

const form = reactive({
  title: props.initial?.title ?? 'Weather',
  location: props.initial?.config.location ?? null,
  units: props.initial?.config.units ?? ('metric' as 'metric' | 'imperial'),
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() => (form.location ? `Weather · ${form.location.name}` : undefined)),
  { auto: !props.initial },
)

const query = ref('')
const results = ref<GeocodeResult[]>([])
const searching = ref(false)
const searchError = ref('')
const attempted = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

watch(query, (value) => {
  clearTimeout(timer)
  results.value = []
  searchError.value = ''
  if (value.trim().length < 2) return
  timer = setTimeout(() => void search(value.trim()), 300)
})

onBeforeUnmount(() => clearTimeout(timer))

async function search(text: string) {
  searching.value = true
  try {
    const body = await unwrap<{ results: GeocodeResult[] }>(
      api.geocode.$get({ query: { q: text } }),
    )
    if (query.value.trim() !== text) return // a newer search superseded this one
    results.value = body.results
    if (body.results.length === 0) searchError.value = 'No places found'
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : 'Search failed'
  } finally {
    searching.value = false
  }
}

function describe(place: GeocodeResult) {
  return [place.name, place.region, place.country].filter(Boolean).join(', ')
}

function choose(place: GeocodeResult) {
  form.location = { name: place.name, lat: place.lat, lon: place.lon }
  query.value = ''
  results.value = []
}

function submit() {
  attempted.value = true
  if (!form.title.trim() || !form.location) return
  emit('submit', {
    title: form.title.trim(),
    config: { location: form.location, units: form.units },
  })
}

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="field-label" for="weather-title">Title</label>
      <input
        id="weather-title"
        v-model="form.title"
        class="field"
        maxlength="80"
        @input="autoTitle.markEdited()"
      />
    </div>

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
            class="w-full px-3 py-2 text-left text-sm hover:bg-line"
            @click="choose(place)"
          >
            {{ describe(place) }}
          </button>
        </li>
      </ul>
      <p v-else-if="searchError" class="mt-1 text-xs text-amber-400" role="status">
        {{ searchError }}
      </p>
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

    <p v-if="attempted && !form.location" class="text-xs text-amber-400" role="alert">
      Choose a location
    </p>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
