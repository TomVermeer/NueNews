<script setup lang="ts">
import { GridItem, GridLayout } from 'grid-layout-plus'
import { computed } from 'vue'
import { GRID_COLUMNS, type WidgetColor } from '@nuenews/shared'
import type { WidgetDto } from '../api/types'
import type { GridItemData } from '../composables/useLayoutDraft'
import { readingOrder } from '../lib/readingOrder'
import DashboardWidget from './DashboardWidget.vue'

const props = defineProps<{
  widgets: WidgetDto[]
  editing: boolean
  /** Show the widgets in one column instead of on the grid. */
  compact?: boolean
  refreshingIds?: string[]
}>()

const layout = defineModel<GridItemData[]>('layout', { required: true })

defineEmits<{
  refresh: [widget: WidgetDto]
  settings: [widget: WidgetDto]
  remove: [widget: WidgetDto]
  rename: [widget: WidgetDto, title: string]
  color: [widget: WidgetDto, color: WidgetColor | null]
}>()

// The grid only shows from the expanded size class (840px) up, where cards are 24px apart.
const GRID_GAP = 24

const byId = computed(() => new Map(props.widgets.map((widget) => [widget.id, widget])))

/** Each layout item with its widget. Items whose widget is gone would render empty, so skip them. */
function withWidgets(items: readonly GridItemData[]) {
  return items.flatMap((item) => {
    const widget = byId.value.get(item.i)
    return widget ? [{ item, widget }] : []
  })
}

const cells = computed(() => withWidgets(layout.value))
// Only the order of the saved layout is used; the stack never changes it.
const stacked = computed(() => withWidgets(readingOrder(layout.value)))
</script>

<template>
  <div v-if="compact" class="flex flex-col gap-4">
    <DashboardWidget
      v-for="{ item, widget } in stacked"
      :key="item.i"
      :widget="widget"
      :editing="false"
      :refreshing="refreshingIds?.includes(item.i)"
      @refresh="$emit('refresh', widget)"
      @settings="$emit('settings', widget)"
      @remove="$emit('remove', widget)"
      @rename="(title) => $emit('rename', widget, title)"
      @color="(color) => $emit('color', widget, color)"
    />
  </div>

  <!-- The library also insets the whole grid by the gap; -m-6 (24px) cancels that. -->
  <GridLayout
    v-else
    v-model:layout="layout"
    class="-m-6"
    :col-num="GRID_COLUMNS"
    :row-height="56"
    :margin="[GRID_GAP, GRID_GAP]"
    :is-draggable="editing"
    :is-resizable="editing"
    vertical-compact
    use-css-transforms
  >
    <GridItem
      v-for="{ item, widget } in cells"
      :key="item.i"
      :i="item.i"
      :x="item.x"
      :y="item.y"
      :w="item.w"
      :h="item.h"
      :min-w="2"
      :min-h="2"
      drag-allow-from=".drag-handle"
      drag-ignore-from="input, textarea, select"
    >
      <DashboardWidget
        :widget="widget"
        :editing="editing"
        :refreshing="refreshingIds?.includes(item.i)"
        @refresh="$emit('refresh', widget)"
        @settings="$emit('settings', widget)"
        @remove="$emit('remove', widget)"
        @rename="(title) => $emit('rename', widget, title)"
        @color="(color) => $emit('color', widget, color)"
      />
    </GridItem>
  </GridLayout>
</template>
