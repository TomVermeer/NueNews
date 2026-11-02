<script setup lang="ts">
import type { WidgetColor } from '@nuenews/shared'
import type { WidgetDto } from '../api/types'
import { widgetIcon } from '../lib/widgetTypes'
import WidgetBody from '../widgets/WidgetBody.vue'
import WidgetFrame from '../widgets/WidgetFrame.vue'

defineProps<{
  widget: WidgetDto
  editing: boolean
  refreshing?: boolean
}>()

defineEmits<{
  refresh: []
  settings: []
  remove: []
  rename: [title: string]
  color: [color: WidgetColor | null]
}>()
</script>

<template>
  <WidgetFrame
    :title="widget.title"
    :icon="widgetIcon(widget.type)"
    :editing="editing"
    :color="widget.color"
    :refreshing="refreshing"
    @refresh="$emit('refresh')"
    @settings="$emit('settings')"
    @remove="$emit('remove')"
    @rename="(title) => $emit('rename', title)"
    @color="(color) => $emit('color', color)"
  >
    <WidgetBody :widget="widget" />
  </WidgetFrame>
</template>
