<script setup lang="ts">
import type { WeatherData } from '../api/types'
import WeatherIcon from './WeatherIcon.vue'

defineProps<{ data: WeatherData }>()

const weekday = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('en', { weekday: 'short' })
</script>

<template>
  <div>
    <div class="flex items-center gap-4">
      <WeatherIcon
        :icon="data.current.icon"
        :is-day="data.current.isDay"
        class="size-12 shrink-0 text-accent"
      />
      <div>
        <p class="text-3xl font-medium leading-none" data-testid="temperature">
          {{ data.current.temperature }}°
        </p>
        <p class="mt-1 text-sm text-ink-muted">{{ data.current.label }}</p>
      </div>
      <p class="ml-auto self-start text-right text-xs text-ink-muted">{{ data.location.name }}</p>
    </div>

    <ul class="mt-4 grid grid-cols-5 gap-1 text-center">
      <li v-for="day in data.daily" :key="day.date" class="rounded-lg bg-canvas/60 px-1 py-2">
        <p class="text-xs text-ink-muted">{{ weekday(day.date) }}</p>
        <WeatherIcon :icon="day.icon" class="mx-auto my-1 size-5 text-ink-muted" />
        <p class="text-xs">
          <span class="text-ink">{{ day.max }}°</span>
          <span class="ml-1 text-ink-muted">{{ day.min }}°</span>
        </p>
      </li>
    </ul>

    <p v-if="data.stale" class="mt-3 text-xs text-amber-400" role="status">
      The weather service is unavailable, so this may be out of date.
    </p>
    <p class="mt-3 text-[11px] text-ink-muted">
      <a
        href="https://www.met.no/en"
        target="_blank"
        rel="noopener noreferrer"
        class="hover:text-accent"
        >{{ data.attribution }}</a
      >
    </p>
  </div>
</template>
