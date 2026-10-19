import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEditorStore } from './editor'

describe('editor store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('starts out in view mode with the panel closed', () => {
    const editor = useEditorStore()
    expect(editor.editing).toBe(false)
    expect(editor.panelOpen).toBe(false)
  })

  it('opening the add panel switches edit mode on', () => {
    const editor = useEditorStore()
    editor.openAddPanel()
    expect(editor.editing).toBe(true)
    expect(editor.panel).toEqual({ mode: 'add' })
    expect(editor.panelOpen).toBe(true)
  })

  it('opens the settings of one widget', () => {
    const editor = useEditorStore()
    editor.startEditing()
    editor.openSettings('w1')
    expect(editor.panel).toEqual({ mode: 'edit', widgetId: 'w1' })
  })

  it('closing the panel keeps edit mode on', () => {
    const editor = useEditorStore()
    editor.openAddPanel()
    editor.closePanel()
    expect(editor.panelOpen).toBe(false)
    expect(editor.editing).toBe(true)
  })

  it('leaving edit mode also closes the panel', () => {
    const editor = useEditorStore()
    editor.openAddPanel()
    editor.stopEditing()
    expect(editor.editing).toBe(false)
    expect(editor.panelOpen).toBe(false)
  })
})
