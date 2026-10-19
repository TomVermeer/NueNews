import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type PanelState = { mode: 'closed' } | { mode: 'add' } | { mode: 'edit'; widgetId: string }

/** UI state for edit mode and the add/edit widget panel. */
export const useEditorStore = defineStore('editor', () => {
  const editing = ref(false)
  const panel = ref<PanelState>({ mode: 'closed' })

  const panelOpen = computed(() => panel.value.mode !== 'closed')

  function startEditing() {
    editing.value = true
  }

  function stopEditing() {
    editing.value = false
    panel.value = { mode: 'closed' }
  }

  /** Adding widgets needs edit mode, so this switches it on. */
  function openAddPanel() {
    editing.value = true
    panel.value = { mode: 'add' }
  }

  function openSettings(widgetId: string) {
    panel.value = { mode: 'edit', widgetId }
  }

  function closePanel() {
    panel.value = { mode: 'closed' }
  }

  return {
    editing,
    panel,
    panelOpen,
    startEditing,
    stopEditing,
    openAddPanel,
    openSettings,
    closePanel,
  }
})
