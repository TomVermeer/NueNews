<script setup lang="ts">
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { WeatherIcon } from '@nuenews/shared'

const props = withDefaults(defineProps<{ icon: WeatherIcon; isDay?: boolean }>(), { isDay: true })

const component = computed(() => {
  switch (props.icon) {
    case 'clear':
      return props.isDay ? Sun : Moon
    case 'partly-cloudy':
      return props.isDay ? CloudSun : Cloud
    case 'fog':
      return CloudFog
    case 'drizzle':
      return CloudDrizzle
    case 'rain':
      return CloudRain
    case 'snow':
      return CloudSnow
    case 'thunder':
      return CloudLightning
    default:
      return Cloud
  }
})
</script>

<template>
  <component :is="component" aria-hidden="true" :stroke-width="1.5" />
</template>
