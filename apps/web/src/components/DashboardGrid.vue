<script setup lang="ts">
import { GridItem, GridLayout } from 'grid-layout-plus'
import { computed } from 'vue'
import { GRID_COLUMNS } from '@nuenews/shared'
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
}>()

const byId = computed(() => new Map(props.widgets.map((widget) => [widget.id, widget])))
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
      v-for="item in layout"
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
        v-if="byId.get(item.i)"
        :title="byId.get(item.i)!.title"
        :icon="widgetIcon(byId.get(item.i)!.type)"
        :editing="editing"
        :refreshing="refreshingIds?.includes(item.i)"
        @refresh="$emit('refresh', byId.get(item.i)!)"
        @settings="$emit('settings', byId.get(item.i)!)"
        @remove="$emit('remove', byId.get(item.i)!)"
      >
        <WidgetBody :widget="byId.get(item.i)!" />
      </WidgetFrame>
    </GridItem>
  </GridLayout>
</template>
