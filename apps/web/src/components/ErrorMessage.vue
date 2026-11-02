<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

withDefaults(defineProps<{ role?: 'alert' | 'status' }>(), { role: 'alert' })
</script>

<!-- A problem in words with an icon, so color is never the only signal. Set the text size with a class. -->
<template>
  <p class="flex items-start gap-1.5 text-warning" :role="role">
    <span class="flex h-[1lh] shrink-0 items-center">
      <TriangleAlert class="size-3.5" aria-hidden="true" />
    </span>
    <span><slot /></span>
  </p>
</template>
