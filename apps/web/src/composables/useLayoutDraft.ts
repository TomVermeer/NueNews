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

/** Whether a grid item has exactly this position and size. */
const isAtLayout = (item: GridItemData, layout: WidgetDto['layout']): boolean =>
  item.x === layout.x && item.y === layout.y && item.w === layout.w && item.h === layout.h

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

  /** Keeps the draft, but picks up widgets added on the server meanwhile and drops ones that vanished. */
  function mergeServerChanges() {
    const known = new Set(layout.value.map((item) => item.i))
    const onServer = new Set(widgets.value.map((widget) => widget.id))
    const added = widgets.value
      .filter((widget) => !known.has(widget.id) && !removed.value.includes(widget.id))
      .map(toItem)
    layout.value = [...layout.value.filter((item) => onServer.has(item.i)), ...added]
    removed.value = removed.value.filter((id) => onServer.has(id))
  }

  watch([widgets, editing], () => (editing.value ? mergeServerChanges() : reset()), {
    immediate: true,
  })

  function remove(id: string) {
    if (!removed.value.includes(id)) removed.value = [...removed.value, id]
    layout.value = layout.value.filter((item) => item.i !== id)
  }

  const dirty = computed(() => {
    if (removed.value.length > 0) return true
    const saved = new Map(widgets.value.map((widget) => [widget.id, widget.layout]))
    return layout.value.some((item) => {
      const savedLayout = saved.get(item.i)
      return !savedLayout || !isAtLayout(item, savedLayout)
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
