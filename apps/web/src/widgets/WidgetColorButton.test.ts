import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WidgetColorButton from './WidgetColorButton.vue'

const mounted: ReturnType<typeof mount>[] = []
function render(modelValue: string | null = null) {
  const wrapper = mount(WidgetColorButton, {
    props: { modelValue } as never,
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}
const panel = () => document.body.querySelector('[role="dialog"]')

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
})

describe('WidgetColorButton', () => {
  it('keeps the palette closed until the button is pressed', async () => {
    const wrapper = render()
    expect(panel()).toBeNull()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('false')

    await wrapper.get('button').trigger('click')
    expect(panel()).not.toBeNull()
    expect(wrapper.get('button').attributes('aria-expanded')).toBe('true')
  })

  it('reports the chosen color and closes', async () => {
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    const teal = panel()!.querySelector('input[aria-label="Teal"]') as HTMLInputElement
    teal.click()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('select')).toEqual([['teal']])
    expect(panel()).toBeNull()
  })

  it('closes on Escape and on a click elsewhere', async () => {
    const wrapper = render()
    await wrapper.get('button').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(panel()).toBeNull()

    await wrapper.get('button').trigger('click')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(panel()).toBeNull()
  })

  it('removes its document and window listeners when unmounted while open', async () => {
    const targets = [document, window]
    const added = targets.map((target) => vi.spyOn(target, 'addEventListener'))
    const removed = targets.map((target) => vi.spyOn(target, 'removeEventListener'))
    const wrapper = render()
    await wrapper.get('button').trigger('click')

    mounted.splice(0).forEach((each) => each.unmount())
    await Promise.resolve()

    targets.forEach((_, index) => {
      const removedListeners = removed[index]!.mock.calls.map(([type, listener]) => [
        type,
        listener,
      ])
      for (const [type, listener] of added[index]!.mock.calls) {
        expect(removedListeners).toContainEqual([type, listener])
      }
    })
    added.concat(removed).forEach((spy) => spy.mockRestore())
  })
})
