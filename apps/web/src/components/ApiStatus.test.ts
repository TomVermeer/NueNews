import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ApiStatus from './ApiStatus.vue'

const { health } = vi.hoisted(() => ({ health: vi.fn() }))

vi.mock('../api/client', () => ({ api: { health: { $get: health } } }))

describe('ApiStatus', () => {
  beforeEach(() => {
    health.mockReset()
  })

  it('shows online when the API responds ok', async () => {
    health.mockResolvedValue({ ok: true })
    const wrapper = mount(ApiStatus)
    expect(wrapper.text()).toContain('checking')
    await flushPromises()
    expect(wrapper.text()).toContain('online')
  })

  it('shows offline when the request fails', async () => {
    health.mockImplementation(() => Promise.reject(new Error('network')))
    const wrapper = mount(ApiStatus)
    await flushPromises()
    expect(wrapper.text()).toContain('offline')
  })
})
