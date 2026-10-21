import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import EditableTitle from './EditableTitle.vue'

const render = (editable: boolean) =>
  mount(EditableTitle, { props: { title: 'News', editable }, attachTo: document.body })

describe('EditableTitle', () => {
  it('is plain text when not editable', () => {
    const wrapper = render(false)
    expect(wrapper.get('h2').text()).toBe('News')
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('turns into an input when clicked and saves on Enter', async () => {
    const wrapper = render(true)
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')

    const input = wrapper.get('input[aria-label="Widget title"]')
    expect((input.element as HTMLInputElement).value).toBe('News')
    await input.setValue('  Tech news  ')
    await input.trigger('keydown.enter')

    expect(wrapper.emitted('rename')).toEqual([['Tech news']])
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('saves when the input loses focus', async () => {
    const wrapper = render(true)
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')
    await wrapper.get('input').setValue('Gaming')
    await wrapper.get('input').trigger('blur')
    expect(wrapper.emitted('rename')).toEqual([['Gaming']])
  })

  it('discards the change on Escape', async () => {
    const wrapper = render(true)
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')
    await wrapper.get('input').setValue('Nope')
    await wrapper.get('input').trigger('keydown.esc')
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.emitted('rename')).toBeUndefined()
    expect(wrapper.get('h2').text()).toBe('News')
  })

  it('does not rename to an empty or unchanged title', async () => {
    const wrapper = render(true)
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')
    await wrapper.get('input').setValue('   ')
    await wrapper.get('input').trigger('keydown.enter')
    await wrapper.get('[aria-label="Rename widget"]').trigger('click')
    await wrapper.get('input').trigger('keydown.enter')
    expect(wrapper.emitted('rename')).toBeUndefined()
  })
})
