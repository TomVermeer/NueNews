import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeAuthClient, type SignInResult } from '../test/fakeAuth'
import { mountApp } from '../test/mount'
import LoginPage from './LoginPage.vue'

const hoisted = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('../auth/client', () => ({
  get authClient() {
    return hoisted.client
  },
}))

let fake: ReturnType<typeof createFakeAuthClient>

beforeEach(() => {
  fake = createFakeAuthClient()
  hoisted.client = fake.client
})

async function open(route = '/login') {
  const mounted = await mountApp(LoginPage, { route })
  return mounted
}

async function fillAndSubmit(wrapper: Awaited<ReturnType<typeof open>>['wrapper']) {
  await wrapper.get('#login-email').setValue('  me@example.com ')
  await wrapper.get('#login-password').setValue('secret')
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

describe('LoginPage', () => {
  it('asks for an email and password, with no way to sign up', async () => {
    const { wrapper } = await open()
    expect(wrapper.get('h1').text()).toBe('Sign in')
    expect(wrapper.get('#login-email').attributes('autocomplete')).toBe('email')
    expect(wrapper.get('#login-password').attributes('autocomplete')).toBe('current-password')
    expect(wrapper.text()).toContain('Access is by invitation')
    expect(wrapper.text().toLowerCase()).not.toContain('sign up')
  })

  it('signs in and goes to the dashboard', async () => {
    const { wrapper, router } = await open()
    await fillAndSubmit(wrapper)

    expect(fake.signInWithPassword).toHaveBeenCalledWith({
      email: 'me@example.com',
      password: 'secret',
    })
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('goes back to the page that was asked for', async () => {
    const { wrapper, router } = await open('/login?redirect=/d/abc')
    await fillAndSubmit(wrapper)
    expect(router.currentRoute.value.fullPath).toBe('/d/abc')
  })

  it.each(['//evil.example', 'https://evil.example', 'javascript:alert(1)'])(
    'ignores a redirect to somewhere else (%s)',
    async (target) => {
      const { wrapper, router } = await open(`/login?redirect=${encodeURIComponent(target)}`)
      await fillAndSubmit(wrapper)
      expect(router.currentRoute.value.name).toBe('home')
    },
  )

  it('shows why sign-in failed and stays on the page', async () => {
    fake.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })
    const { wrapper, router } = await open()
    await fillAndSubmit(wrapper)

    expect(wrapper.get('[role="alert"]').text()).toBe('That email and password do not match.')
    expect(router.currentRoute.value.name).toBe('login')
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined()
  })

  it('does not submit twice while signing in', async () => {
    let finish: (value: SignInResult) => void = () => {}
    fake.signInWithPassword.mockImplementationOnce(
      () => new Promise<SignInResult>((resolve) => (finish = resolve)),
    )
    const { wrapper } = await open()
    await wrapper.get('#login-email').setValue('me@example.com')
    await wrapper.get('#login-password').setValue('secret')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')

    expect(fake.signInWithPassword).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button[type="submit"]').text()).toBe('Signing in…')
    finish({ data: { session: null }, error: null })
    await flushPromises()
  })
})
