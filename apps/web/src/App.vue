<script setup lang="ts">
import ApiStatus from './components/ApiStatus.vue'
</script>

<template>
  <div class="min-h-screen p-6">
    <header class="mb-6 flex items-center justify-between">
      <h1 class="text-lg font-medium">NueNews</h1>
      <ApiStatus />
    </header>
    <main>
      <div class="rounded-xl border border-line bg-card p-6 text-sm text-ink-muted">
        Your widgets will appear here.
      </div>
    </main>
  </div>
</template>
