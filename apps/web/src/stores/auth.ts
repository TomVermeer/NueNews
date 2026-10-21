import type { Session } from '@supabase/supabase-js'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { authClient } from '../auth/client'

/** Who is signed in. Without a configured login (local development) everyone counts as signed in. */
export const useAuthStore = defineStore('auth', () => {
  const configured = authClient !== null
  const session = ref<Session | null>(null)
  const email = computed(() => session.value?.user.email ?? null)
  const signedIn = computed(() => !configured || session.value !== null)

  let starting: Promise<void> | undefined

  /** Loads the stored session and keeps it in step with sign-ins, sign-outs and refreshes. */
  function init(): Promise<void> {
    starting ??= start()
    return starting
  }

  async function start() {
    if (!authClient) return
    const { data } = await authClient.auth.getSession()
    session.value = data.session
    authClient.auth.onAuthStateChange((_event, next) => {
      session.value = next
    })
  }

  /** Throws an Error with a message fit for the sign-in form. */
  async function signIn(address: string, password: string) {
    if (!authClient) return
    const { data, error } = await authClient.auth.signInWithPassword({ email: address, password })
    if (error) throw new Error(friendly(error.message))
    session.value = data.session
  }

  async function signOut() {
    if (!authClient) return
    await authClient.auth.signOut()
    session.value = null
  }

  return { configured, session, email, signedIn, init, signIn, signOut }
})

function friendly(message: string): string {
  return /invalid login credentials/i.test(message)
    ? 'That email and password do not match.'
    : 'Could not sign in. Try again in a moment.'
}
