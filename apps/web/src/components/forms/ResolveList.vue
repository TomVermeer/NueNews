<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import type { SourceKind } from '@nuenews/shared'
import ResolveInput from './ResolveInput.vue'
import { newSourceRow, type SourceRow } from './sourceRows'

defineProps<{
  kind: SourceKind
  legend: string
  /** What one row is called in labels, e.g. "feed" gives "Remove feed 2". */
  noun: string
  /** The address input's label, numbered per row, e.g. "Feed address" gives "Feed address 1". */
  inputLabel: string
  placeholder: string
}>()

const rows = defineModel<SourceRow[]>({ required: true })

function remove(id: number) {
  rows.value = rows.value.filter((row) => row.id !== id)
}

function add() {
  rows.value = [...rows.value, newSourceRow()]
}
</script>

<template>
  <fieldset>
    <legend class="field-label">{{ legend }}</legend>
    <ul class="space-y-3">
      <li v-for="(row, index) in rows" :key="row.id" class="flex items-start gap-2">
        <div class="min-w-0 flex-1 space-y-2">
          <ResolveInput
            v-model="row.value"
            :kind="kind"
            :label="`${inputLabel} ${index + 1}`"
            :placeholder="placeholder"
            @resolved="(result) => (row.name = result.title ?? '')"
          />
          <input
            v-if="row.value"
            v-model="row.label"
            class="field"
            placeholder="Name (optional)"
            :aria-label="`Name for ${noun} ${index + 1}`"
            maxlength="60"
          />
        </div>
        <button
          v-if="rows.length > 1"
          type="button"
          class="icon-btn mt-1"
          :aria-label="`Remove ${noun} ${index + 1}`"
          @click="remove(row.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>
    <button type="button" class="btn btn-ghost mt-2 !px-0" @click="add">
      <Plus class="size-4" aria-hidden="true" /> Add another {{ noun }}
    </button>
  </fieldset>
</template>
