import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import type { Component } from 'vue'
import { createMemoryHistory } from 'vue-router'
import { createAppRouter } from '../router'

/** Mounts a component with Pinia, TanStack Query (no retries) and a memory router installed. */
export async function mountApp<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> & { route?: string } = {},
) {
  const { route = '/', global: globalOptions, ...rest } = options
  const pinia = createPinia()
  setActivePinia(pinia)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: Infinity } },
  })
  const router = createAppRouter(createMemoryHistory())
  await router.push(route)
  await router.isReady()

  const wrapper = mount(component, {
    ...rest,
    global: {
      ...globalOptions,
      plugins: [
        pinia,
        [VueQueryPlugin, { queryClient }],
        router,
        ...(globalOptions?.plugins ?? []),
      ],
    },
  })

  return { wrapper, queryClient, router, pinia }
}

/** Waits for pending promises and DOM updates (queries resolve over a few ticks). */
export async function settle(times = 6) {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
