<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, reactive, ref, toRef } from 'vue'
import { feedConfigSchema, type FeedConfig } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { suggestTitle } from '../../lib/titles'
import ResolveInput from './ResolveInput.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<FeedConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: FeedConfig }] }>()

const defaults = feedConfigSchema.parse({ sources: [{ url: 'https://placeholder.invalid' }] })

// Rows are keyed by id, not index: ResolveInput keeps its own text, so removing a row
// would otherwise leave the old text in the row that moves up.
let nextRowId = 0

const form = reactive({
  title: props.initial?.title ?? 'News',
  sources: (props.initial?.config.sources ?? [{ url: '' }]).map((s) => ({
    id: nextRowId++,
    url: s.url,
    label: s.label ?? '',
    name: '',
  })),
  limit: props.initial?.config.limit ?? defaults.limit,
  excerpt: props.initial?.config.excerpt ?? defaults.excerpt,
  showImages: props.initial?.config.showImages ?? defaults.showImages,
  unreadDots: props.initial?.config.unreadDots ?? defaults.unreadDots,
  variant: props.initial?.config.variant ?? defaults.variant,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() =>
    suggestTitle(form.sources.map((s) => s.label.trim() || s.name).filter((name) => name)),
  ),
  { auto: !props.initial },
)

const attempted = ref(false)
const resolvedSources = computed(() => form.sources.filter((s) => s.url))
const problem = computed(() => {
  if (!form.title.trim()) return 'Give the widget a title'
  if (resolvedSources.value.length === 0) return 'Add at least one feed and look it up'
  if (resolvedSources.value.length < form.sources.length) {
    return 'Look up every address, or remove the ones you do not need'
  }
  return ''
})

function submit() {
  attempted.value = true
  if (problem.value) return
  emit('submit', {
    title: form.title.trim(),
    config: {
      sources: resolvedSources.value.map((s) => ({
        url: s.url,
        ...(s.label.trim() ? { label: s.label.trim() } : {}),
      })),
      limit: form.limit,
      excerpt: form.excerpt,
      showImages: form.showImages,
      unreadDots: form.unreadDots,
      variant: form.variant,
    },
  })
}

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="field-label" for="feed-title">Title</label>
      <input
        id="feed-title"
        v-model="form.title"
        class="field"
        maxlength="80"
        @input="autoTitle.markEdited()"
      />
    </div>

    <fieldset>
      <legend class="field-label">Feeds</legend>
      <ul class="space-y-3">
        <li v-for="(source, index) in form.sources" :key="source.id" class="flex items-start gap-2">
          <div class="min-w-0 flex-1 space-y-2">
            <ResolveInput
              v-model="source.url"
              kind="rss"
              :label="`Feed address ${index + 1}`"
              placeholder="Website, feed address or r/subreddit page"
              @resolved="(result) => (source.name = result.title ?? '')"
            />
            <input
              v-if="source.url"
              v-model="source.label"
              class="field"
              placeholder="Name (optional)"
              :aria-label="`Name for feed ${index + 1}`"
              maxlength="60"
            />
          </div>
          <button
            v-if="form.sources.length > 1"
            type="button"
            class="icon-btn mt-1"
            :aria-label="`Remove feed ${index + 1}`"
            @click="form.sources.splice(index, 1)"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </li>
      </ul>
      <button
        type="button"
        class="btn btn-ghost mt-2 !px-0"
        @click="form.sources.push({ id: nextRowId++, url: '', label: '', name: '' })"
      >
        <Plus class="size-4" aria-hidden="true" /> Add another feed
      </button>
    </fieldset>

    <details class="rounded-lg border border-line px-3 py-2">
      <summary class="cursor-pointer text-sm text-ink-muted">Display options</summary>
      <div class="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label class="field-label" for="feed-limit">Items</label>
          <input
            id="feed-limit"
            v-model.number="form.limit"
            type="number"
            min="1"
            max="50"
            class="field"
          />
        </div>
        <div>
          <label class="field-label" for="feed-excerpt">Excerpt</label>
          <select id="feed-excerpt" v-model="form.excerpt" class="field">
            <option value="none">None</option>
            <option value="compact">Compact</option>
            <option value="expanded">Expanded</option>
          </select>
        </div>
        <div>
          <label class="field-label" for="feed-variant">Layout</label>
          <select id="feed-variant" v-model="form.variant" class="field">
            <option value="cards">Cards</option>
            <option value="list">Plain list</option>
          </select>
        </div>
        <div class="space-y-2 pt-5 text-sm">
          <label class="flex items-center gap-2"
            ><input v-model="form.showImages" type="checkbox" /> Show images</label
          >
          <label class="flex items-center gap-2"
            ><input v-model="form.unreadDots" type="checkbox" /> Unread dots</label
          >
        </div>
      </div>
    </details>

    <p v-if="attempted && problem" class="text-xs text-amber-400" role="alert">{{ problem }}</p>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
