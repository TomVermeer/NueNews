<script setup lang="ts">
import { computed, reactive, toRef } from 'vue'
import { youtubeConfigSchema, type YouTubeConfig } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { useFormSubmit } from '../../composables/useFormSubmit'
import { suggestTitle } from '../../lib/titles'
import ResolveList from './ResolveList.vue'
import TitleField from './TitleField.vue'
import { labelOf, newSourceRow, resolvedRows, rowNames } from './sourceRows'
import ErrorMessage from '../ErrorMessage.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<YouTubeConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: YouTubeConfig }] }>()

const DEFAULT_LIMIT = youtubeConfigSchema.shape.limit.parse(undefined)

const form = reactive({
  title: props.initial?.title ?? 'YouTube',
  channels: (props.initial?.config.channels ?? [{ input: '' }]).map((channel) =>
    newSourceRow(channel.input, channel.label),
  ),
  limit: props.initial?.config.limit ?? DEFAULT_LIMIT,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() => suggestTitle(rowNames(form.channels))),
  { auto: !props.initial },
)

const resolved = computed(() => resolvedRows(form.channels))
const problem = computed(() => {
  if (!form.title.trim()) return 'Give the widget a title'
  if (resolved.value.length === 0) return 'Add at least one channel and look it up'
  if (resolved.value.length < form.channels.length) {
    return 'Look up every channel, or remove the ones you do not need'
  }
  return ''
})

const { shownProblem, submit } = useFormSubmit(problem, () =>
  emit('submit', {
    title: form.title.trim(),
    config: {
      channels: resolved.value.map((channel) => ({ input: channel.value, ...labelOf(channel) })),
      limit: form.limit,
    },
  }),
)

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <TitleField id="yt-title" v-model="form.title" @edit="autoTitle.markEdited()" />

    <ResolveList
      v-model="form.channels"
      kind="youtube"
      legend="Channels"
      noun="channel"
      input-label="Channel"
      placeholder="@handle, channel address or channel ID"
    />

    <div class="w-32">
      <label class="field-label" for="yt-limit">Videos</label>
      <input
        id="yt-limit"
        v-model.number="form.limit"
        type="number"
        min="1"
        max="50"
        class="field"
      />
    </div>

    <ErrorMessage v-if="shownProblem" class="text-xs">{{ shownProblem }}</ErrorMessage>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
