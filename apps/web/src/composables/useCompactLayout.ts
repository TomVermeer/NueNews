import { onScopeDispose, ref, type Ref } from 'vue'

// Below the Material "expanded" size class (840px) the 12-column grid is too narrow for a widget.
const COMPACT_QUERY = '(max-width: 839.98px)'

/** Whether the screen is too narrow for the grid, kept up to date as it is resized or rotated. */
export function useCompactLayout(): Ref<boolean> {
  const compact = ref(false)
  if (typeof window.matchMedia !== 'function') return compact

  const query = window.matchMedia(COMPACT_QUERY)
  compact.value = query.matches
  const onChange = (event: MediaQueryListEvent) => {
    compact.value = event.matches
  }
  query.addEventListener('change', onChange)
  onScopeDispose(() => query.removeEventListener('change', onChange))
  return compact
}
