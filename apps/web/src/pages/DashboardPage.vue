<script setup lang="ts">
import { LayoutDashboard, LayoutGrid, TriangleAlert } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  useDashboardMutations,
  useDashboardQuery,
  useDashboardsQuery,
  useWidgetMutations,
} from '../api/queries'
import type { WidgetColor } from '@nuenews/shared'
import type { WidgetDto } from '../api/types'
import AddWidgetPanel from '../components/AddWidgetPanel.vue'
import DashboardGrid from '../components/DashboardGrid.vue'
import TopBar from '../components/TopBar.vue'
import { useLayoutDraft } from '../composables/useLayoutDraft'
import { useAuthStore } from '../stores/auth'
import { useEditorStore } from '../stores/editor'

const route = useRoute()
const router = useRouter()
const editor = useEditorStore()
const auth = useAuthStore()
const { editing, panel } = storeToRefs(editor)

const dashboardsQuery = useDashboardsQuery()
const dashboards = computed(() => dashboardsQuery.data.value ?? [])

const activeId = computed(() => {
  const wanted = route.params.id
  return dashboards.value.find((d) => d.id === wanted)?.id ?? dashboards.value[0]?.id
})

// Keep the address bar in step with the dashboard that is actually shown.
watch(
  activeId,
  (id, previous) => {
    if (id && route.params.id !== id) void router.replace({ name: 'dashboard', params: { id } })
    if (previous && id !== previous) editor.stopEditing()
  },
  { immediate: true },
)

const dashboardQuery = useDashboardQuery(activeId)
const widgets = computed(() => dashboardQuery.data.value?.widgets ?? [])
const draft = useLayoutDraft(widgets, editing)

const dashboardMutations = useDashboardMutations()
const widgetMutations = useWidgetMutations()

const editingWidget = computed(() => {
  const current = panel.value
  if (current.mode !== 'edit') return undefined
  return widgets.value.find((w) => w.id === current.widgetId)
})

const updatedAt = ref<Date | null>(null)
watch(
  () => dashboardQuery.dataUpdatedAt.value,
  (time) => {
    if (time && !updatedAt.value) updatedAt.value = new Date(time)
  },
)

const refreshingIds = ref<string[]>([])
async function refreshWidgets(list: WidgetDto[]) {
  refreshingIds.value = [...refreshingIds.value, ...list.map((w) => w.id)]
  await Promise.allSettled(list.map((w) => widgetMutations.refresh.mutateAsync(w.id)))
  refreshingIds.value = refreshingIds.value.filter((id) => !list.some((w) => w.id === id))
  updatedAt.value = new Date()
}

async function save() {
  if (!activeId.value) return
  if (draft.dirty.value) {
    await widgetMutations.saveLayout.mutateAsync({
      dashboardId: activeId.value,
      ...draft.payload(),
    })
  }
  editor.stopEditing()
}

function cancel() {
  draft.reset()
  editor.stopEditing()
}

function renameWidget(widget: WidgetDto, title: string) {
  if (!activeId.value) return
  widgetMutations.update.mutate({ dashboardId: activeId.value, id: widget.id, title })
}

function recolorWidget(widget: WidgetDto, color: WidgetColor | null) {
  if (!activeId.value) return
  widgetMutations.update.mutate({ dashboardId: activeId.value, id: widget.id, color })
}

async function createDashboard(name: string) {
  const created = await dashboardMutations.create.mutateAsync(name)
  void router.push({ name: 'dashboard', params: { id: created.id } })
}

async function deleteDashboard(id: string) {
  await dashboardMutations.remove.mutateAsync(id)
  editor.stopEditing()
  void router.replace({ name: 'home' })
}

const firstName = ref('Home')
</script>

<template>
  <div
    v-if="dashboardsQuery.isPending.value"
    class="py-20 text-center text-sm text-ink-muted"
    role="status"
  >
    Loading…
  </div>

  <div
    v-else-if="dashboardsQuery.isError.value"
    class="mx-auto max-w-sm py-20 text-center"
    role="alert"
  >
    <TriangleAlert class="mx-auto mb-4 size-6 text-ink-muted" aria-hidden="true" />
    <p class="text-sm text-ink-muted">Could not load your dashboards. Is the server running?</p>
    <button type="button" class="btn mt-4" @click="dashboardsQuery.refetch()">Try again</button>
  </div>

  <div v-else-if="dashboards.length === 0" class="mx-auto max-w-sm py-24 text-center">
    <LayoutDashboard class="mx-auto mb-4 size-6 text-ink-muted" aria-hidden="true" />
    <h1 class="text-[22px]/7">Start your first dashboard</h1>
    <p class="mt-2 text-sm text-ink-muted">
      A dashboard holds the widgets you arrange: feeds, videos and weather.
    </p>
    <form class="mt-6 flex gap-2" @submit.prevent="createDashboard(firstName.trim() || 'Home')">
      <input v-model="firstName" class="field" aria-label="Dashboard name" maxlength="60" />
      <button type="submit" class="btn btn-primary shrink-0">Create dashboard</button>
    </form>
  </div>

  <div v-else>
    <TopBar
      :dashboards="dashboards"
      :active-id="activeId"
      :editing="editing"
      :dirty="draft.dirty.value"
      :saving="widgetMutations.saveLayout.isPending.value"
      :refreshing="refreshingIds.length > 0"
      :updated-at="updatedAt"
      :can-sign-out="auth.configured"
      @sign-out="auth.signOut()"
      @edit="editor.startEditing()"
      @cancel="cancel"
      @save="save"
      @refresh="refreshWidgets(widgets)"
      @add-widget="editor.openAddPanel()"
      @create-dashboard="createDashboard"
      @rename-dashboard="(id, name) => dashboardMutations.rename.mutate({ id, name })"
      @delete-dashboard="deleteDashboard"
    />

    <div v-if="dashboardQuery.isError.value" class="py-10 text-center" role="alert">
      <TriangleAlert class="mx-auto mb-4 size-6 text-ink-muted" aria-hidden="true" />
      <p class="text-sm text-ink-muted">Could not load this dashboard.</p>
    </div>

    <div
      v-else-if="dashboardQuery.isSuccess.value && widgets.length === 0 && !editing"
      class="mx-auto max-w-sm py-24 text-center"
      data-testid="empty-dashboard"
    >
      <LayoutGrid class="mx-auto mb-4 size-6 text-ink-muted" aria-hidden="true" />
      <h1 class="text-[22px]/7">This dashboard is empty</h1>
      <p class="mt-2 text-sm text-ink-muted">Add a feed, a YouTube channel or the weather.</p>
      <button type="button" class="btn btn-primary mt-6" @click="editor.openAddPanel()">
        Add a widget
      </button>
    </div>

    <DashboardGrid
      v-else
      v-model:layout="draft.layout.value"
      :widgets="widgets"
      :editing="editing"
      :refreshing-ids="refreshingIds"
      @refresh="(widget) => refreshWidgets([widget])"
      @settings="(widget) => editor.openSettings(widget.id)"
      @remove="(widget) => draft.remove(widget.id)"
      @rename="renameWidget"
      @color="recolorWidget"
    />

    <AddWidgetPanel
      v-if="editor.panelOpen && activeId && (panel.mode === 'add' || editingWidget)"
      :key="panel.mode === 'edit' ? panel.widgetId : 'add'"
      :dashboard-id="activeId"
      :widget="editingWidget"
      @close="editor.closePanel()"
    />
  </div>
</template>
