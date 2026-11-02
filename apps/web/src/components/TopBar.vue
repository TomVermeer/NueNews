<script setup lang="ts">
import { LayoutDashboard, LogOut, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { DashboardSummary } from '../api/types'
import { timeAgo } from '../lib/time'
import DashboardNameForm from './DashboardNameForm.vue'

const props = defineProps<{
  dashboards: DashboardSummary[]
  activeId?: string
  editing: boolean
  dirty: boolean
  saving: boolean
  refreshing: boolean
  updatedAt: Date | null
  /** Show the sign out button (only when the app has a login). */
  canSignOut?: boolean
}>()

const emit = defineEmits<{
  edit: []
  cancel: []
  save: []
  refresh: []
  'add-widget': []
  'create-dashboard': [name: string]
  'rename-dashboard': [id: string, name: string]
  'delete-dashboard': [id: string]
  'sign-out': []
}>()

/** Which name form is open: a new dashboard's, the active dashboard's, or none. */
const naming = ref<'create' | 'rename' | null>(null)

const activeName = computed(() => props.dashboards.find((d) => d.id === props.activeId)?.name)

function commitName(name: string) {
  if (naming.value === 'create') emit('create-dashboard', name)
  else if (props.activeId) emit('rename-dashboard', props.activeId, name)
  naming.value = null
}

function confirmDelete() {
  const id = props.activeId
  if (!id) return
  const name = activeName.value ?? 'this dashboard'
  if (window.confirm(`Delete "${name}" and all of its widgets?`)) emit('delete-dashboard', id)
}
</script>

<template>
  <header class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="flex items-center gap-2 text-base/6 font-medium">
      <LayoutDashboard class="size-5 text-accent" aria-hidden="true" />
      NueNews
    </span>

    <nav class="flex flex-wrap items-center gap-1" aria-label="Dashboards">
      <template v-for="dashboard in dashboards" :key="dashboard.id">
        <DashboardNameForm
          v-if="naming === 'rename' && dashboard.id === activeId"
          label="Dashboard name"
          submit-label="Save name"
          :initial-name="activeName"
          @submit="commitName"
          @cancel="naming = null"
        />
        <RouterLink
          v-else
          :to="{ name: 'dashboard', params: { id: dashboard.id } }"
          class="touch-target rounded-lg px-3 py-1.5 text-sm transition-colors"
          :class="
            dashboard.id === activeId
              ? 'bg-line text-ink'
              : 'text-ink-muted hover:bg-card-high hover:text-ink'
          "
          :aria-current="dashboard.id === activeId ? 'page' : undefined"
          >{{ dashboard.name }}</RouterLink
        >
      </template>

      <DashboardNameForm
        v-if="naming === 'create'"
        label="New dashboard name"
        submit-label="Create dashboard"
        placeholder="Dashboard name"
        cancelable
        @submit="commitName"
        @cancel="naming = null"
      />
      <button
        v-else
        type="button"
        class="icon-btn"
        aria-label="New dashboard"
        @click="naming = 'create'"
      >
        <Plus class="size-4" aria-hidden="true" />
      </button>

      <template v-if="editing && activeId && naming !== 'rename'">
        <button
          type="button"
          class="icon-btn"
          aria-label="Rename dashboard"
          @click="naming = 'rename'"
        >
          <Pencil class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn" aria-label="Delete dashboard" @click="confirmDelete">
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </template>
    </nav>

    <div class="ml-auto flex items-center gap-2">
      <template v-if="editing">
        <button type="button" class="btn" @click="emit('add-widget')">
          <Plus class="size-4" aria-hidden="true" /> Add widget
        </button>
        <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancel</button>
        <button type="button" class="btn btn-primary" :disabled="saving" @click="emit('save')">
          {{ saving ? 'Saving…' : dirty ? 'Save layout' : 'Done' }}
        </button>
      </template>
      <template v-else>
        <span v-if="updatedAt" class="hidden text-xs text-ink-muted sm:inline">
          Updated {{ timeAgo(updatedAt) }}
        </span>
        <button
          type="button"
          class="icon-btn"
          aria-label="Refresh all widgets"
          :disabled="refreshing || !activeId"
          @click="emit('refresh')"
        >
          <RefreshCw class="size-4" :class="{ 'animate-spin': refreshing }" aria-hidden="true" />
        </button>
        <button type="button" class="btn" :disabled="!activeId" @click="emit('edit')">
          <Pencil class="size-4" aria-hidden="true" /> Edit layout
        </button>
        <button
          v-if="canSignOut"
          type="button"
          class="icon-btn"
          aria-label="Sign out"
          @click="emit('sign-out')"
        >
          <LogOut class="size-4" aria-hidden="true" />
        </button>
      </template>
    </div>
  </header>
</template>
