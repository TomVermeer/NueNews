import { onBeforeUnmount, ref, watch } from 'vue'
import type { GeocodeResult } from '@nuenews/shared'
import { api, unwrap } from '../api/client'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

/**
 * A place search that follows `query`: it waits for a pause in typing, skips queries shorter than
 * two characters, and drops answers to a query the user has already typed past.
 */
export function useGeocodeSearch() {
  const query = ref('')
  const results = ref<GeocodeResult[]>([])
  const searching = ref(false)
  const searchError = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined

  watch(query, (value) => {
    clearTimeout(timer)
    results.value = []
    searchError.value = ''
    if (value.trim().length < MIN_QUERY_LENGTH) return
    timer = setTimeout(() => void search(value.trim()), DEBOUNCE_MS)
  })

  onBeforeUnmount(() => clearTimeout(timer))

  async function search(text: string) {
    searching.value = true
    try {
      const body = await unwrap(api.geocode.$get({ query: { q: text } }))
      if (query.value.trim() !== text) return // a newer search superseded this one
      results.value = body.results
      if (body.results.length === 0) searchError.value = 'No places found'
    } catch (error) {
      searchError.value = error instanceof Error ? error.message : 'Search failed'
    } finally {
      searching.value = false
    }
  }

  /** Empties the search box and its results, e.g. once a place has been chosen. */
  function clear() {
    query.value = ''
    results.value = []
  }

  return { query, results, searching, searchError, clear }
}
