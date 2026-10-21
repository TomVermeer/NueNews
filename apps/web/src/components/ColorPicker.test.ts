import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { WIDGET_COLORS } from '@nuenews/shared'
import ColorPicker from './ColorPicker.vue'

const render = (modelValue: string | null) => mount(ColorPicker, { props: { modelValue } as never })

describe('ColorPicker', () => {
  it('offers the default and every palette color as radio buttons', () => {
    const wrapper = render(null)
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(WIDGET_COLORS.length + 1)
    expect(radios[0]!.attributes('aria-label')).toBe('Default')
    expect(radios[1]!.attributes('aria-label')).toBe('Red')
    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe('Widget color')
  })

  it('marks the current color as selected', () => {
    const blue = render('blue').findAll('input[type="radio"]')
    expect(blue.filter((r) => (r.element as HTMLInputElement).checked)).toHaveLength(1)
    expect(
      (render('blue').get('input[aria-label="Blue"]').element as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (render(null).get('input[aria-label="Default"]').element as HTMLInputElement).checked,
    ).toBe(true)
  })

  it('reports the chosen color, and null for the default', async () => {
    const wrapper = render('blue')
    await wrapper.get('input[aria-label="Teal"]').setValue(true)
    await wrapper.get('input[aria-label="Default"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([['teal'], [null]])
  })
})
