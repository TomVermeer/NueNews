import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from './router'
import { createFakeAuthClient, fakeSession } from './test/fakeAuth'

const hoisted = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('./auth/client', () => ({
  get authClient() {
    return hoisted.client
  },
}))

beforeEach(() => {
  setActivePinia(createPinia())
  hoisted.client = null
})

async function go(path: string) {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  return router.currentRoute.value
}

describe('router without a login configured', () => {
  it('opens every page, and sends the login page home', async () => {
    expect((await go('/d/abc')).name).toBe('dashboard')
    expect((await go('/login')).name).toBe('home')
  })
})

describe('router with a login configured', () => {
  it('sends signed-out visitors to the login page, remembering where they wanted to go', async () => {
    hoisted.client = createFakeAuthClient().client
    const home = await go('/')
    expect(home.name).toBe('login')
    expect(home.query).toEqual({})

    setActivePinia(createPinia())
    const deep = await go('/d/abc')
    expect(deep.name).toBe('login')
    expect(deep.query).toEqual({ redirect: '/d/abc' })
  })

  it('lets signed-in users through, and keeps them off the login page', async () => {
    hoisted.client = createFakeAuthClient(fakeSession()).client
    expect((await go('/d/abc')).name).toBe('dashboard')
    expect((await go('/login')).name).toBe('home')
  })

  it('shows the login page to signed-out visitors', async () => {
    hoisted.client = createFakeAuthClient().client
    expect((await go('/login')).name).toBe('login')
  })
})
