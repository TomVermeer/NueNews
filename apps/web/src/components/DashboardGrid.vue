<script setup lang="ts">
import { GridItem, GridLayout } from 'grid-layout-plus'
import { computed } from 'vue'
import { GRID_COLUMNS, type WidgetColor } from '@nuenews/shared'
import type { WidgetDto } from '../api/types'
import type { GridItemData } from '../composables/useLayoutDraft'
import { widgetIcon } from '../lib/widgetTypes'
import WidgetBody from '../widgets/WidgetBody.vue'
import WidgetFrame from '../widgets/WidgetFrame.vue'

const props = defineProps<{
  widgets: WidgetDto[]
  editing: boolean
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

const byId = computed(() => new Map(props.widgets.map((widget) => [widget.id, widget])))

/** Each layout item with its widget. Items whose widget is gone would render empty, so skip them. */
const cells = computed(() =>
  layout.value.flatMap((item) => {
    const widget = byId.value.get(item.i)
    return widget ? [{ item, widget }] : []
  }),
)
</script>

<template>
  <GridLayout
    v-model:layout="layout"
    :col-num="GRID_COLUMNS"
    :row-height="56"
    :margin="[16, 16]"
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
      <WidgetFrame
        :title="widget.title"
        :icon="widgetIcon(widget.type)"
        :editing="editing"
        :color="widget.color"
        :refreshing="refreshingIds?.includes(item.i)"
        @refresh="$emit('refresh', widget)"
        @settings="$emit('settings', widget)"
        @remove="$emit('remove', widget)"
        @rename="(title) => $emit('rename', widget, title)"
        @color="(color) => $emit('color', widget, color)"
      >
        <WidgetBody :widget="widget" />
      </WidgetFrame>
    </GridItem>
  </GridLayout>
</template>
