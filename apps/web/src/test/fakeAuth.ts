import type { Session } from '@supabase/supabase-js'
import { vi } from 'vitest'

export function fakeSession(email = 'me@example.com', token = 'token-1'): Session {
  return { access_token: token, user: { email } } as unknown as Session
}

type Listener = (event: string, session: Session | null) => void

/** A stand-in for the Supabase client with just the calls the app makes. */
export function createFakeAuthClient(initial: Session | null = null) {
  let session = initial
  const listeners: Listener[] = []

  function change(event: string, next: Session | null) {
    session = next
    listeners.forEach((listener) => listener(event, next))
  }

  const signInWithPassword = vi.fn(async ({ email }: { email: string; password: string }) => ({
    data: { session: fakeSession(email) },
    error: null as { message: string } | null,
  }))

  const client = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session } })),
      signInWithPassword,
      signOut: vi.fn(async () => {
        change('SIGNED_OUT', null)
        return { error: null }
      }),
      onAuthStateChange: vi.fn((listener: Listener) => {
        listeners.push(listener)
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
    },
  }

  return { client, change, signInWithPassword }
}
