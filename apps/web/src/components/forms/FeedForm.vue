<script setup lang="ts">
import { computed, reactive, toRef } from 'vue'
import { feedConfigSchema, type FeedConfig } from '@nuenews/shared'
import { useAutoTitle } from '../../composables/useAutoTitle'
import { useFormSubmit } from '../../composables/useFormSubmit'
import { suggestTitle } from '../../lib/titles'
import ResolveList from './ResolveList.vue'
import TitleField from './TitleField.vue'
import { labelOf, newSourceRow, resolvedRows, rowNames } from './sourceRows'
import ErrorMessage from '../ErrorMessage.vue'

const props = defineProps<{
  initial?: { title: string; config: Partial<FeedConfig> }
}>()

const emit = defineEmits<{ submit: [value: { title: string; config: FeedConfig }] }>()

const defaults = feedConfigSchema.parse({ sources: [{ url: 'https://placeholder.invalid' }] })

const form = reactive({
  title: props.initial?.title ?? 'News',
  sources: (props.initial?.config.sources ?? [{ url: '' }]).map((source) =>
    newSourceRow(source.url, source.label),
  ),
  limit: props.initial?.config.limit ?? defaults.limit,
  excerpt: props.initial?.config.excerpt ?? defaults.excerpt,
  showImages: props.initial?.config.showImages ?? defaults.showImages,
  unreadDots: props.initial?.config.unreadDots ?? defaults.unreadDots,
  variant: props.initial?.config.variant ?? defaults.variant,
})

const autoTitle = useAutoTitle(
  toRef(form, 'title'),
  computed(() => suggestTitle(rowNames(form.sources))),
  { auto: !props.initial },
)

const resolvedSources = computed(() => resolvedRows(form.sources))
const problem = computed(() => {
  if (!form.title.trim()) return 'Give the widget a title'
  if (resolvedSources.value.length === 0) return 'Add at least one feed and look it up'
  if (resolvedSources.value.length < form.sources.length) {
    return 'Look up every address, or remove the ones you do not need'
  }
  return ''
})

const { shownProblem, submit } = useFormSubmit(problem, () =>
  emit('submit', {
    title: form.title.trim(),
    config: {
      sources: resolvedSources.value.map((source) => ({ url: source.value, ...labelOf(source) })),
      limit: form.limit,
      excerpt: form.excerpt,
      showImages: form.showImages,
      unreadDots: form.unreadDots,
      variant: form.variant,
    },
  }),
)

defineExpose({ submit })
</script>

<template>
  <form class="space-y-4" @submit.prevent="submit">
    <TitleField id="feed-title" v-model="form.title" @edit="autoTitle.markEdited()" />

    <ResolveList
      v-model="form.sources"
      kind="rss"
      legend="Feeds"
      noun="feed"
      input-label="Feed address"
      placeholder="Website, feed address or r/subreddit page"
    />

    <details class="rounded-lg border border-line px-3">
      <summary class="cursor-pointer py-3.5 text-sm text-ink-muted">Display options</summary>
      <div class="grid grid-cols-2 gap-3 pb-3">
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
        <div class="text-sm">
          <label class="flex min-h-12 items-center gap-2"
            ><input v-model="form.showImages" type="checkbox" /> Show images</label
          >
          <label class="flex min-h-12 items-center gap-2"
            ><input v-model="form.unreadDots" type="checkbox" /> Unread dots</label
          >
        </div>
      </div>
    </details>

    <ErrorMessage v-if="shownProblem" class="text-xs">{{ shownProblem }}</ErrorMessage>
    <button type="submit" class="sr-only">Save</button>
  </form>
</template>
