<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

// Signing out (or a session the server no longer accepts) sends you to the login page at once.
watch(
  () => auth.signedIn,
  (signedIn) => {
    if (signedIn || route.name === 'login') return
    void router.replace({ name: 'login' })
  },
)
</script>

<template>
  <div class="min-h-screen p-4 min-[600px]:p-6">
    <RouterView />
  </div>
</template>
