<script setup lang="ts">
import { Check, LayoutDashboard, LogOut, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-vue-next'
import { nextTick, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { DashboardSummary } from '../api/types'
import { timeAgo } from '../lib/time'

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

const creating = ref(false)
const renaming = ref(false)
const draftName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

// A function ref, because one of the inputs lives inside a v-for (where a plain ref becomes an array).
function setNameInput(el: unknown) {
  nameInput.value = el instanceof HTMLInputElement ? el : null
}

async function focusName() {
  await nextTick()
  nameInput.value?.focus()
}

function startCreate() {
  draftName.value = ''
  renaming.value = false
  creating.value = true
  void focusName()
}

function startRename() {
  draftName.value = props.dashboards.find((d) => d.id === props.activeId)?.name ?? ''
  creating.value = false
  renaming.value = true
  void focusName()
}

function cancelNaming() {
  creating.value = false
  renaming.value = false
}

function commitName() {
  const name = draftName.value.trim()
  if (!name) return cancelNaming()
  if (creating.value) emit('create-dashboard', name)
  else if (props.activeId) emit('rename-dashboard', props.activeId, name)
  cancelNaming()
}

function confirmDelete() {
  const id = props.activeId
  if (!id) return
  const name = props.dashboards.find((d) => d.id === id)?.name ?? 'this dashboard'
  if (window.confirm(`Delete "${name}" and all of its widgets?`)) emit('delete-dashboard', id)
}
</script>

<template>
  <header class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
    <span class="flex items-center gap-2 text-[15px] font-medium">
      <LayoutDashboard class="size-5 text-accent" aria-hidden="true" />
      NueNews
    </span>

    <nav class="flex flex-wrap items-center gap-1" aria-label="Dashboards">
      <template v-for="dashboard in dashboards" :key="dashboard.id">
        <form
          v-if="renaming && dashboard.id === activeId"
          class="flex items-center gap-1"
          @submit.prevent="commitName"
        >
          <input
            :ref="setNameInput"
            v-model="draftName"
            class="field !w-36 !py-1"
            aria-label="Dashboard name"
            maxlength="60"
            @keydown.esc="cancelNaming"
          />
          <button type="submit" class="icon-btn" aria-label="Save name">
            <Check class="size-4" aria-hidden="true" />
          </button>
        </form>
        <RouterLink
          v-else
          :to="{ name: 'dashboard', params: { id: dashboard.id } }"
          class="rounded-lg px-3 py-1.5 text-sm transition-colors"
          :class="
            dashboard.id === activeId
              ? 'bg-line text-ink'
              : 'text-ink-muted hover:bg-line/60 hover:text-ink'
          "
          :aria-current="dashboard.id === activeId ? 'page' : undefined"
          >{{ dashboard.name }}</RouterLink
        >
      </template>

      <form v-if="creating" class="flex items-center gap-1" @submit.prevent="commitName">
        <input
          :ref="setNameInput"
          v-model="draftName"
          class="field !w-36 !py-1"
          placeholder="Dashboard name"
          aria-label="New dashboard name"
          maxlength="60"
          @keydown.esc="cancelNaming"
        />
        <button type="submit" class="icon-btn" aria-label="Create dashboard">
          <Check class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="icon-btn" aria-label="Cancel" @click="cancelNaming">
          <X class="size-4" aria-hidden="true" />
        </button>
      </form>
      <button v-else type="button" class="icon-btn" aria-label="New dashboard" @click="startCreate">
        <Plus class="size-4" aria-hidden="true" />
      </button>

      <template v-if="editing && activeId && !renaming">
        <button type="button" class="icon-btn" aria-label="Rename dashboard" @click="startRename">
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
        <button
          type="button"
          class="btn btn-primary"
          :disabled="saving"
          :aria-label="dirty ? 'Save layout' : 'Done'"
          @click="emit('save')"
        >
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
