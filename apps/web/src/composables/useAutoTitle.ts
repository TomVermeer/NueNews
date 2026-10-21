import { ref, watch, type Ref } from 'vue'

/**
 * Keeps a new widget's title in step with a suggestion (a city, a channel name) until the user
 * types their own. Existing widgets keep their title: pass `auto: false`.
 */
export function useAutoTitle(
  title: Ref<string>,
  suggestion: Ref<string | undefined>,
  options: { auto: boolean },
) {
  const edited = ref(!options.auto)

  watch(suggestion, (value) => {
    if (!edited.value && value) title.value = value
  })

  return {
    markEdited: () => {
      edited.value = true
    },
  }
}
