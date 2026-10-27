<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, reactive, ref, toRef } from 'vue'
import type { YouTubeConfig } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { suggestTitle } from '../../lib/titles'
import ResolveInput from './ResolveInput.vue'
import ErrorMessage from '../ErrorMessage.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<YouTubeConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: YouTubeConfig }] }>()

// Rows are keyed by id, not index: ResolveInput keeps its own text, so removing a row
// would otherwise leave the old text in the row that moves up.
let nextRowId = 0

const form = reactive({
  title: props.initial?.title ?? 'YouTube',
  channels: (props.initial?.config.channels ?? [{ input: '' }]).map((c) => ({
    id: nextRowId++,
    input: c.input,
    label: c.label ?? '',
    name: '',
  })),
  limit: props.initial?.config.limit ?? 3,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() =>
    suggestTitle(form.channels.map((c) => c.label.trim() || c.name).filter((name) => name)),
  ),
  { auto: !props.initial },
)

const attempted = ref(false)
const resolved = computed(() => form.channels.filter((c) => c.input))
const problem = computed(() => {
  if (!form.title.trim()) return 'Give the widget a title'
  if (resolved.value.length === 0) return 'Add at least one channel and look it up'
  if (resolved.value.length < form.channels.length) {
    return 'Look up every channel, or remove the ones you do not need'
  }
  return ''
})

function submit() {
  attempted.value = true
  if (problem.value) return
  emit('submit', {
    title: form.title.trim(),
    config: {
      channels: resolved.value.map((c) => ({
        input: c.input,
        ...(c.label.trim() ? { label: c.label.trim() } : {}),
      })),
      limit: form.limit,
    },
  })
}

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="field-label" for="yt-title">Title</label>
      <input
        id="yt-title"
        v-model="form.title"
        class="field"
        maxlength="80"
        @input="autoTitle.markEdited()"
      />
    </div>

    <fieldset>
      <legend class="field-label">Channels</legend>
      <ul class="space-y-3">
        <li
          v-for="(channel, index) in form.channels"
          :key="channel.id"
          class="flex items-start gap-2"
        >
          <div class="min-w-0 flex-1 space-y-2">
            <ResolveInput
              v-model="channel.input"
              kind="youtube"
              :label="`Channel ${index + 1}`"
              placeholder="@handle, channel address or channel ID"
              @resolved="(result) => (channel.name = result.title ?? '')"
            />
            <input
              v-if="channel.input"
              v-model="channel.label"
              class="field"
              placeholder="Name (optional)"
              :aria-label="`Name for channel ${index + 1}`"
              maxlength="60"
            />
          </div>
          <button
            v-if="form.channels.length > 1"
            type="button"
            class="icon-btn mt-1"
            :aria-label="`Remove channel ${index + 1}`"
            @click="form.channels.splice(index, 1)"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="btn btn-ghost mt-2 !px-0"
        @click="form.channels.push({ id: nextRowId++, input: '', label: '', name: '' })"
      >
        <Plus class="size-4" aria-hidden="true" /> Add another channel
      </button>
    </fieldset>

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

    <ErrorMessage v-if="attempted && problem" class="text-xs">{{ problem }}</ErrorMessage>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
