<script setup lang="ts">
import { ArrowLeft, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import {
  feedConfigSchema,
  routeConfigSchema,
  weatherConfigSchema,
  youtubeConfigSchema,
  type CreateWidget,
  type WidgetColor,
} from '@nuenews/shared'
import { ApiRequestError } from '../api/client'
import { useWidgetMutations, useWidgetTypesQuery } from '../api/queries'
import type { WidgetDto } from '../api/types'
import {
  ADDABLE_WIDGET_TYPES,
  isAddableWidgetType,
  WIDGET_TYPE_INFO,
  type AddableWidgetType,
} from '../lib/widgetTypes'
import ColorPicker from './ColorPicker.vue'
import FeedForm from './forms/FeedForm.vue'
import RouteForm from './forms/RouteForm.vue'
import WeatherForm from './forms/WeatherForm.vue'
import YouTubeForm from './forms/YouTubeForm.vue'
import ErrorMessage from './ErrorMessage.vue'

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

const serverTypes = useWidgetTypesQuery(() => !props.widget)

interface TypeOption {
  type: AddableWidgetType
  /** The server cannot create this type, e.g. it has no Google Maps key. */
  unavailable: boolean
}

/** The route widget is listed once the server has said whether it can create one. */
const typeOptions = computed<TypeOption[]>(() =>
  ADDABLE_WIDGET_TYPES.flatMap((option): TypeOption[] => {
    if (option !== 'route') return [{ type: option, unavailable: false }]
    const known = serverTypes.data.value?.find((entry) => entry.type === option)
    return known ? [{ type: option, unavailable: !known.available }] : []
  }),
)

const heading = computed(() => {
  if (props.widget) return 'Widget settings'
  return type.value ? WIDGET_TYPE_INFO[type.value].label : 'Add widget'
})

const saveLabel = computed(() => {
  if (saving.value) return 'Saving…'
  return props.widget ? 'Save changes' : 'Add widget'
})

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
  } catch (saveError) {
    error.value =
      saveError instanceof ApiRequestError ? saveError.message : 'Could not save the widget'
  }
}
</script>

<template>
  <aside
    class="fixed top-0 right-0 z-30 flex h-dvh w-full flex-col border-l border-line bg-card shadow-2xl medium:max-w-md"
    role="dialog"
    aria-label="Widget panel"
  >
    <header class="flex items-center gap-2 border-b border-line px-6 py-4">
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
        {{ heading }}
      </h2>
      <button type="button" class="icon-btn" aria-label="Close panel" @click="emit('close')">
        <X class="size-4" aria-hidden="true" />
      </button>
    </header>

    <div class="flex-1 overflow-y-auto px-6 py-6">
      <ul v-if="!type" class="space-y-2">
        <li v-for="option in typeOptions" :key="option.type">
          <button
            type="button"
            class="flex w-full items-center gap-3 rounded-lg border border-line px-3 py-3 text-left transition-colors enabled:hover:bg-card-high disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="option.unavailable"
            @click="picked = option.type"
          >
            <component
              :is="WIDGET_TYPE_INFO[option.type].icon"
              class="size-5 shrink-0 text-ink-muted"
              aria-hidden="true"
            />
            <span>
              <span class="block text-sm">{{ WIDGET_TYPE_INFO[option.type].label }}</span>
              <span class="block text-xs text-ink-muted">{{
                option.unavailable
                  ? 'Needs a Google Maps key on the server'
                  : WIDGET_TYPE_INFO[option.type].description
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
          v-else-if="type === 'weather'"
          ref="form"
          :initial="initialWith(weatherConfigSchema)"
          @submit="(value) => save({ type: 'weather', ...value })"
        />
        <RouteForm
          v-else
          ref="form"
          :initial="initialWith(routeConfigSchema)"
          @submit="(value) => save({ type: 'route', ...value })"
        />
        <fieldset class="mt-6">
          <legend class="field-label">Color</legend>
          <ColorPicker v-model="color" class="-mx-2" />
        </fieldset>
        <ErrorMessage v-if="error" class="mt-4 text-sm">{{ error }}</ErrorMessage>
      </template>
    </div>

    <footer v-if="type" class="flex justify-end gap-2 border-t border-line px-6 py-4">
      <button type="button" class="btn btn-ghost" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="saving" @click="form?.submit()">
        {{ saveLabel }}
      </button>
    </footer>
  </aside>
</template>
