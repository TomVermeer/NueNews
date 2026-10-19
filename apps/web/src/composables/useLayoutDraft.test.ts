import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import type { WidgetDto } from '../api/types'
import { widget } from '../test/factories'
import { useLayoutDraft } from './useLayoutDraft'

const at = (id: string, x: number, y: number, w = 4, h = 4): WidgetDto =>
  widget(id, { layout: { x, y, w, h } })

function setup(initial: WidgetDto[]) {
  const widgets = ref<WidgetDto[]>(initial)
  const editing = ref(false)
  const draft = useLayoutDraft(widgets, editing)
  return { widgets, editing, draft }
}

describe('useLayoutDraft', () => {
  it('mirrors the server when not editing', async () => {
    const { widgets, draft } = setup([at('a', 0, 0)])
    expect(draft.layout.value).toEqual([{ i: 'a', x: 0, y: 0, w: 4, h: 4 }])

    widgets.value = [at('a', 0, 0), at('b', 4, 0)]
    await nextTick()
    expect(draft.layout.value.map((item) => item.i)).toEqual(['a', 'b'])
  })

  it('is not dirty until something changes', () => {
    const { draft } = setup([at('a', 0, 0)])
    expect(draft.dirty.value).toBe(false)
  })

  it('becomes dirty when an item is moved or resized, and clean again when put back', () => {
    const { draft } = setup([at('a', 0, 0)])
    draft.layout.value[0]!.x = 6
    expect(draft.dirty.value).toBe(true)
    draft.layout.value[0]!.x = 0
    expect(draft.dirty.value).toBe(false)
    draft.layout.value[0]!.h = 8
    expect(draft.dirty.value).toBe(true)
  })

  it('removes a widget from the draft and records it for saving', () => {
    const { draft } = setup([at('a', 0, 0), at('b', 4, 0)])
    draft.remove('a')
    expect(draft.layout.value.map((item) => item.i)).toEqual(['b'])
    expect(draft.removed.value).toEqual(['a'])
    expect(draft.dirty.value).toBe(true)
  })

  it('produces the payload for saving', () => {
    const { draft } = setup([at('a', 0, 0), at('b', 4, 0)])
    draft.layout.value[1]!.y = 5
    draft.remove('a')
    expect(draft.payload()).toEqual({
      widgets: [{ id: 'b', x: 4, y: 5, w: 4, h: 4 }],
      removed: ['a'],
    })
  })

  it('reset throws the draft away', () => {
    const { draft } = setup([at('a', 0, 0), at('b', 4, 0)])
    draft.layout.value[0]!.x = 8
    draft.remove('b')
    draft.reset()
    expect(draft.layout.value.map((i) => [i.i, i.x])).toEqual([
      ['a', 0],
      ['b', 4],
    ])
    expect(draft.removed.value).toEqual([])
    expect(draft.dirty.value).toBe(false)
  })

  describe('while editing', () => {
    it('keeps the draft when the server data refreshes', async () => {
      const { widgets, editing, draft } = setup([at('a', 0, 0)])
      editing.value = true
      await nextTick()
      draft.layout.value[0]!.x = 6

      widgets.value = [at('a', 0, 0)] // a refetch returns the saved positions
      await nextTick()
      expect(draft.layout.value[0]!.x).toBe(6)
    })

    it('picks up widgets that were added meanwhile', async () => {
      const { widgets, editing, draft } = setup([at('a', 0, 0)])
      editing.value = true
      await nextTick()
      draft.layout.value[0]!.x = 2

      widgets.value = [at('a', 0, 0), at('b', 0, 4)]
      await nextTick()
      expect(draft.layout.value.map((i) => [i.i, i.x, i.y])).toEqual([
        ['a', 2, 0],
        ['b', 0, 4],
      ])
    })

    it('does not bring back a widget the user removed but has not saved yet', async () => {
      const { widgets, editing, draft } = setup([at('a', 0, 0), at('b', 4, 0)])
      editing.value = true
      await nextTick()
      draft.remove('b')

      widgets.value = [at('a', 0, 0), at('b', 4, 0)]
      await nextTick()
      expect(draft.layout.value.map((i) => i.i)).toEqual(['a'])
    })

    it('drops widgets that no longer exist on the server', async () => {
      const { widgets, editing, draft } = setup([at('a', 0, 0), at('b', 4, 0)])
      editing.value = true
      await nextTick()

      widgets.value = [at('a', 0, 0)]
      await nextTick()
      expect(draft.layout.value.map((i) => i.i)).toEqual(['a'])
    })

    it('returns to the server layout when edit mode ends', async () => {
      const { editing, draft } = setup([at('a', 0, 0)])
      editing.value = true
      await nextTick()
      draft.layout.value[0]!.x = 6

      editing.value = false
      await nextTick()
      expect(draft.layout.value[0]!.x).toBe(0)
    })
  })
})
