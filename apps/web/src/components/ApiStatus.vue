<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '../api/client'

const state = ref<'checking' | 'online' | 'offline'>('checking')

onMounted(async () => {
  try {
    const res = await api.health.$get()
    state.value = res.ok ? 'online' : 'offline'
  } catch {
    state.value = 'offline'
  }
})
</script>

<template>
  <span class="text-xs text-ink-muted" data-testid="api-status"> API: {{ state }} </span>
</template>
