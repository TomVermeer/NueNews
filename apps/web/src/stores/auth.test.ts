import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeAuthClient, fakeSession } from '../test/fakeAuth'
import { useAuthStore } from './auth'

const hoisted = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('../auth/client', () => ({
  get authClient() {
    return hoisted.client
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  hoisted.client = null
})

describe('auth store without a login configured', () => {
  it('treats everyone as signed in, so local development needs no login', async () => {
    const auth = useAuthStore()
    await auth.init()
    expect(auth.configured).toBe(false)
    expect(auth.signedIn).toBe(true)
  })
})

describe('auth store with a login configured', () => {
  it('starts signed out, and signed in when a session is stored', async () => {
    hoisted.client = createFakeAuthClient().client
    const signedOut = useAuthStore()
    await signedOut.init()
    expect(signedOut.configured).toBe(true)
    expect(signedOut.signedIn).toBe(false)

    setActivePinia(createPinia())
    hoisted.client = createFakeAuthClient(fakeSession('me@example.com')).client
    const signedIn = useAuthStore()
    await signedIn.init()
    expect(signedIn.signedIn).toBe(true)
    expect(signedIn.email).toBe('me@example.com')
  })

  it('only loads the session once', async () => {
    const fake = createFakeAuthClient()
    hoisted.client = fake.client
    const auth = useAuthStore()
    await Promise.all([auth.init(), auth.init()])
    await auth.init()
    expect(fake.client.auth.getSession).toHaveBeenCalledTimes(1)
  })

  it('signs in with the email and password', async () => {
    const fake = createFakeAuthClient()
    hoisted.client = fake.client
    const auth = useAuthStore()
    await auth.init()

    await auth.signIn('me@example.com', 'secret')
    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret',
    })
    expect(auth.signedIn).toBe(true)
  })

  it('reports wrong credentials in plain words, and stays signed out', async () => {
    const fake = createFakeAuthClient()
    fake.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })
    hoisted.client = fake.client
    const auth = useAuthStore()
    await auth.init()

    await expect(auth.signIn('me@example.com', 'wrong')).rejects.toThrow(
      'That email and password do not match.',
    )
    expect(auth.signedIn).toBe(false)
  })

  it('does not repeat provider messages it does not understand', async () => {
    const fake = createFakeAuthClient()
    fake.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'internal gotrue detail' },
    })
    hoisted.client = fake.client
    const auth = useAuthStore()
    await expect(auth.signIn('a@b.c', 'x')).rejects.toThrow(
      'Could not sign in. Try again in a moment.',
    )
  })

  it('follows sign-outs that happen elsewhere, such as a revoked session', async () => {
    const fake = createFakeAuthClient(fakeSession())
    hoisted.client = fake.client
    const auth = useAuthStore()
    await auth.init()
    expect(auth.signedIn).toBe(true)

    fake.change('SIGNED_OUT', null)
    expect(auth.signedIn).toBe(false)
  })

  it('signs out', async () => {
    const fake = createFakeAuthClient(fakeSession())
    hoisted.client = fake.client
    const auth = useAuthStore()
    await auth.init()
    await auth.signOut()
    expect(fake.client.auth.signOut).toHaveBeenCalled()
    expect(auth.signedIn).toBe(false)
  })
})
