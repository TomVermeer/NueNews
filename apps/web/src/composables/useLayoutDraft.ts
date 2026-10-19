import { computed, ref, watch, type Ref } from 'vue'
import type { WidgetDto } from '../api/types'

export interface GridItemData {
  i: string
  x: number
  y: number
  w: number
  h: number
}

const toItem = (widget: WidgetDto): GridItemData => ({ i: widget.id, ...widget.layout })

/**
 * The layout the user is arranging in edit mode. Moves, resizes and removals stay in this draft
 * until they are saved; cancelling throws the draft away. Outside edit mode the draft always
 * mirrors the server.
 */
export function useLayoutDraft(widgets: Ref<WidgetDto[]>, editing: Ref<boolean>) {
  const layout = ref<GridItemData[]>([])
  const removed = ref<string[]>([])

  function reset() {
    layout.value = widgets.value.map(toItem)
    removed.value = []
  }

  watch(
    [widgets, editing],
    () => {
      if (!editing.value) return reset()

      // Editing: keep the draft, but pick up widgets added meanwhile and drop ones that vanished.
      const known = new Set(layout.value.map((item) => item.i))
      const onServer = new Set(widgets.value.map((widget) => widget.id))
      const added = widgets.value
        .filter((w) => !known.has(w.id) && !removed.value.includes(w.id))
        .map(toItem)
      layout.value = [...layout.value.filter((item) => onServer.has(item.i)), ...added]
      removed.value = removed.value.filter((id) => onServer.has(id))
    },
    { immediate: true, deep: false },
  )

  function remove(id: string) {
    if (!removed.value.includes(id)) removed.value = [...removed.value, id]
    layout.value = layout.value.filter((item) => item.i !== id)
  }

  const dirty = computed(() => {
    if (removed.value.length > 0) return true
    const server = new Map(widgets.value.map((w) => [w.id, w.layout]))
    return layout.value.some((item) => {
      const saved = server.get(item.i)
      return (
        !saved ||
        saved.x !== item.x ||
        saved.y !== item.y ||
        saved.w !== item.w ||
        saved.h !== item.h
      )
    })
  })

  function payload() {
    return {
      widgets: layout.value.map(({ i, x, y, w, h }) => ({ id: i, x, y, w, h })),
      removed: [...removed.value],
    }
  }

  return { layout, removed, dirty, reset, remove, payload }
}
