<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'
import type { YouTubeConfig } from '@nuenews/shared'
import ResolveInput from './ResolveInput.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<YouTubeConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: YouTubeConfig }] }>()

const form = reactive({
  title: props.initial?.title ?? 'YouTube',
  channels: (props.initial?.config.channels ?? [{ input: '' }]).map((c) => ({
    input: c.input,
    label: c.label ?? '',
  })),
  limit: props.initial?.config.limit ?? 3,
})

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
      <input id="yt-title" v-model="form.title" class="field" maxlength="80" />
    </div>

    <fieldset>
      <legend class="field-label">Channels</legend>
      <ul class="space-y-3">
        <li v-for="(channel, index) in form.channels" :key="index" class="flex items-start gap-2">
          <div class="min-w-0 flex-1 space-y-2">
            <ResolveInput
              v-model="channel.input"
              kind="youtube"
              :label="`Channel ${index + 1}`"
              placeholder="@handle, channel address or channel ID"
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
        @click="form.channels.push({ input: '', label: '' })"
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

    <p v-if="attempted && problem" class="text-xs text-amber-400" role="alert">{{ problem }}</p>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
