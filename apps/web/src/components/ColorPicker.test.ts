import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { WIDGET_COLORS, type WidgetColor } from '@nuenews/shared'
import ColorPicker from './ColorPicker.vue'
import { inputOf } from '../test/dom'

const render = (modelValue: WidgetColor | null) => mount(ColorPicker, { props: { modelValue } })

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
    expect(
      blue.filter((radio) => radio.element instanceof HTMLInputElement && radio.element.checked),
    ).toHaveLength(1)
    expect(inputOf(render('blue'), 'input[aria-label="Blue"]').checked).toBe(true)
    expect(inputOf(render(null), 'input[aria-label="Default"]').checked).toBe(true)
  })

  it('reports the chosen color, and null for the default', async () => {
    const wrapper = render('blue')
    await wrapper.get('input[aria-label="Teal"]').setValue(true)
    await wrapper.get('input[aria-label="Default"]').setValue(true)
    expect(wrapper.emitted('update:modelValue')).toEqual([['teal'], [null]])
  })
})
