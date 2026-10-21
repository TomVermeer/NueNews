<script setup lang="ts">
import { Check } from 'lucide-vue-next'
import { useId } from 'vue'
import { WIDGET_COLORS, type WidgetColor } from '@nuenews/shared'
import { colorLabel } from '../lib/widgetColors'

const model = defineModel<WidgetColor | null>({ required: true })

const name = useId()
const options: (WidgetColor | null)[] = [null, ...WIDGET_COLORS]
</script>

<template>
  <div role="radiogroup" aria-label="Widget color" class="flex flex-wrap">
    <label v-for="option in options" :key="option ?? 'default'" class="cursor-pointer p-2">
      <input
        v-model="model"
        type="radio"
        class="peer sr-only"
        :name="name"
        :value="option"
        :aria-label="colorLabel(option)"
      />
      <span
        :data-widget-color="option ?? undefined"
        :title="colorLabel(option)"
        class="grid size-8 place-items-center rounded-full border border-line bg-(--widget-swatch) transition-shadow peer-checked:ring-2 peer-checked:ring-accent peer-checked:ring-offset-2 peer-checked:ring-offset-card-high peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
      >
        <Check
          v-if="model === option"
          class="size-4"
          :class="option ? 'text-canvas' : 'text-ink'"
          aria-hidden="true"
        />
      </span>
    </label>
  </div>
</template>
