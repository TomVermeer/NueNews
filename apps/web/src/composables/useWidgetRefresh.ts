import { ref, watch } from 'vue'
import { useWidgetMutations } from '../api/queries'
import type { WidgetDto } from '../api/types'

/**
 * Asks the server to re-fetch widgets now, tracking which ones are refreshing and when the data
 * was last updated. That time starts at the dashboard's first load (`loadedAt`, a TanStack Query
 * `dataUpdatedAt`) and moves on with every refresh from here.
 */
export function useWidgetRefresh(loadedAt: () => number) {
  const { refresh: refreshMutation } = useWidgetMutations()
  const refreshingIds = ref<string[]>([])
  const updatedAt = ref<Date | null>(null)

  watch(loadedAt, (time) => {
    if (time && !updatedAt.value) updatedAt.value = new Date(time)
  })

  async function refresh(widgets: readonly WidgetDto[]) {
    const ids = widgets.map((widget) => widget.id)
    refreshingIds.value = [...refreshingIds.value, ...ids]
    await Promise.allSettled(ids.map((id) => refreshMutation.mutateAsync(id)))
    refreshingIds.value = refreshingIds.value.filter((id) => !ids.includes(id))
    updatedAt.value = new Date()
  }

  return { refreshingIds, updatedAt, refresh }
}
