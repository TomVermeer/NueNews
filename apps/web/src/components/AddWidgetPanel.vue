<script setup lang="ts">
import { ArrowLeft, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  feedConfigSchema,
  weatherConfigSchema,
  youtubeConfigSchema,
  type CreateWidget,
  type WidgetColor,
} from '@nuenews/shared'
import { ApiRequestError } from '../api/client'
import { useWidgetMutations } from '../api/queries'
import type { WidgetDto } from '../api/types'
import {
  ADDABLE_WIDGET_TYPES,
  isAddableWidgetType,
  WIDGET_TYPE_INFO,
  type AddableWidgetType,
} from '../lib/widgetTypes'
import ColorPicker from './ColorPicker.vue'
import FeedForm from './forms/FeedForm.vue'
import WeatherForm from './forms/WeatherForm.vue'
import YouTubeForm from './forms/YouTubeForm.vue'

const props = defineProps<{
  dashboardId: string
  /** Set to edit an existing widget's settings; omit to add a new one. */
  widget?: WidgetDto
}>()

const emit = defineEmits<{ close: [] }>()

const mutations = useWidgetMutations()
const picked = ref<AddableWidgetType | null>(null)
const error = ref('')
const color = ref<WidgetColor | null>(props.widget?.color ?? null)
const form = ref<{ submit: () => void } | null>(null)

const type = computed<AddableWidgetType | null>(() =>
  props.widget && isAddableWidgetType(props.widget.type) ? props.widget.type : picked.value,
)
const saving = computed(() => mutations.create.isPending.value || mutations.update.isPending.value)

interface ConfigSchema<T> {
  safeParse(value: unknown): { success: boolean; data?: T }
}

/** The widget being edited, with its stored config read through the form's own schema. */
function initialWith<T>(
  schema: ConfigSchema<T>,
): { title: string; config: Partial<T> } | undefined {
  if (!props.widget) return undefined
  return { title: props.widget.title, config: schema.safeParse(props.widget.config).data ?? {} }
}

async function save(widget: CreateWidget) {
  error.value = ''
  try {
    if (props.widget) {
      await mutations.update.mutateAsync({
        dashboardId: props.dashboardId,
        id: props.widget.id,
        title: widget.title,
        color: color.value,
        config: widget.config,
      })
    } else {
      await mutations.create.mutateAsync({
        dashboardId: props.dashboardId,
        widget: { ...widget, color: color.value ?? undefined },
      })
    }
    emit('close')
  } catch (e) {
    error.value = e instanceof ApiRequestError ? e.message : 'Could not save the widget'
  }
}
</script>

<template>
  <aside
    class="fixed inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l border-line bg-card shadow-2xl"
    role="dialog"
    aria-label="Widget panel"
  >
    <header class="flex items-center gap-2 border-b border-line px-5 py-4">
      <button
        v-if="!widget && picked"
        type="button"
        class="icon-btn"
        aria-label="Back to widget types"
        @click="picked = null"
      >
        <ArrowLeft class="size-4" aria-hidden="true" />
      </button>
      <h2 class="flex-1 text-base font-medium">
        {{ widget ? 'Widget settings' : type ? WIDGET_TYPE_INFO[type].label : 'Add widget' }}
      </h2>
      <button type="button" class="icon-btn" aria-label="Close panel" @click="emit('close')">
        <X class="size-4" aria-hidden="true" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-5 py-5">
      <ul v-if="!type" class="space-y-2">
        <li v-for="option in ADDABLE_WIDGET_TYPES" :key="option">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-3 text-left transition-colors hover:border-accent/60 hover:bg-line/40"
            @click="picked = option"
          >
            <component
              :is="WIDGET_TYPE_INFO[option].icon"
              class="size-5 shrink-0 text-accent"
              aria-hidden="true"
            />
            <span>
              <span class="block text-sm">{{ WIDGET_TYPE_INFO[option].label }}</span>
              <span class="block text-xs text-ink-muted">{{
                WIDGET_TYPE_INFO[option].description
              }}</span>
            </span>
          </button>
        </li>
      </ul>

      <template v-else>
        <FeedForm
          v-if="type === 'feed'"
          ref="form"
          :initial="initialWith(feedConfigSchema)"
          @submit="(value) => save({ type: 'feed', ...value })"
        />
        <YouTubeForm
          v-else-if="type === 'youtube'"
          ref="form"
          :initial="initialWith(youtubeConfigSchema)"
          @submit="(value) => save({ type: 'youtube', ...value })"
        />
        <WeatherForm
          v-else
          ref="form"
          :initial="initialWith(weatherConfigSchema)"
          @submit="(value) => save({ type: 'weather', ...value })"
        />
        <fieldset class="mt-5">
          <legend class="field-label">Color</legend>
          <ColorPicker v-model="color" class="-mx-2" />
        </fieldset>
        <p v-if="error" class="mt-4 text-sm text-amber-400" role="alert">{{ error }}</p>
      </template>
    </div>

    <footer v-if="type" class="flex justify-end gap-2 border-t border-line px-5 py-4">
      <button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="saving" @click="form?.submit()">
        {{ saving ? 'Saving…' : widget ? 'Save changes' : 'Add widget' }}
      </button>
    </footer>
  </aside>
</template>
