import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ErrorMessage from './ErrorMessage.vue'

describe('ErrorMessage', () => {
  it('shows the message with a warning icon, announced as an alert', () => {
    const wrapper = mount(ErrorMessage, { slots: { default: 'Give the widget a title' } })
    expect(wrapper.attributes('role')).toBe('alert')
    expect(wrapper.text()).toBe('Give the widget a title')
    expect(wrapper.find('svg[aria-hidden="true"]').exists()).toBe(true)
    expect(wrapper.classes()).toContain('text-warning')
  })

  it('can be a polite status instead', () => {
    const wrapper = mount(ErrorMessage, { props: { role: 'status' }, slots: { default: 'Stale' } })
    expect(wrapper.attributes('role')).toBe('status')
  })
})
