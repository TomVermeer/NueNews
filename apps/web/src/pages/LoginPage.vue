<script setup lang="ts">
import { LayoutDashboard } from 'lucide-vue-next'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const error = ref('')
const signingIn = ref(false)

/** Only paths on this site: anything else (including //evil.example) goes home. */
function destination(): string {
  const wanted = route.query.redirect
  return typeof wanted === 'string' && wanted.startsWith('/') && !wanted.startsWith('//')
    ? wanted
    : '/'
}

async function submit() {
  if (signingIn.value) return
  error.value = ''
  signingIn.value = true
  try {
    await auth.signIn(email.value.trim(), password.value)
    await router.replace(destination())
  } catch (problem) {
    error.value = problem instanceof Error ? problem.message : 'Could not sign in.'
  } finally {
    signingIn.value = false
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center">
    <div class="rounded-xl border border-line bg-card p-6">
      <div class="mb-6 flex items-center gap-2">
        <LayoutDashboard class="size-5 text-accent" aria-hidden="true" />
        <span class="text-sm font-medium">NueNews</span>
      </div>

      <h1 class="text-[22px]/7">Sign in</h1>
      <p class="mt-1 text-sm/5 text-ink-muted">Access is by invitation.</p>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <div>
          <label class="field-label" for="login-email">Email</label>
          <input
            id="login-email"
            v-model="email"
            class="field"
            type="email"
            autocomplete="email"
            required
          />
        </div>
        <div>
          <label class="field-label" for="login-password">Password</label>
          <input
            id="login-password"
            v-model="password"
            class="field"
            type="password"
            autocomplete="current-password"
            required
          />
        </div>

        <p v-if="error" class="text-sm text-amber-400" role="alert">{{ error }}</p>

        <button type="submit" class="btn btn-primary w-full justify-center" :disabled="signingIn">
          {{ signingIn ? 'Signing in…' : 'Sign in' }}
        </button>
      </form>
    </div>
  </main>
</template>
