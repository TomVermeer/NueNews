import { defineComponent } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import type { GridItemData } from '../composables/useLayoutDraft'
import { widget } from '../test/factories'
import { mountApp } from '../test/mount'
import DashboardGrid from './DashboardGrid.vue'

// The grid library measures the DOM, which happy-dom cannot do (see DashboardPage.test.ts).
vi.mock('grid-layout-plus', () => ({
  GridLayout: defineComponent({
    props: { margin: { type: Array, default: () => [] } },
    template: '<div data-testid="grid" :data-margin="margin.join(\',\')"><slot /></div>',
  }),
  GridItem: defineComponent({ template: '<div data-testid="grid-item"><slot /></div>' }),
}))

const widgets = [
  widget('a', { title: 'Alpha' }),
  widget('b', { title: 'Bravo' }),
  widget('c', { title: 'Charlie' }),
]

// Saved positions: Alpha top left, Bravo top right, Charlie below. Listed out of order on purpose.
const layout: GridItemData[] = [
  { i: 'c', x: 0, y: 6, w: 6, h: 4 },
  { i: 'b', x: 6, y: 0, w: 6, h: 4 },
  { i: 'a', x: 0, y: 0, w: 6, h: 4 },
]

const render = (props: { compact?: boolean; editing?: boolean } = {}) =>
  mountApp(DashboardGrid, {
    props: { widgets, layout, editing: false, ...props },
    global: { stubs: { WidgetBody: true } },
  })

describe('DashboardGrid on a wide screen', () => {
  it('places the widgets on the grid', async () => {
    const { wrapper } = await render({ compact: false })
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-testid="grid-item"]')).toHaveLength(3)
  })

  it('leaves 24px between cards, as the expanded size class asks', async () => {
    const { wrapper } = await render({ compact: false })
    expect(wrapper.get('[data-testid="grid"]').attributes('data-margin')).toBe('24,24')
  })

  it('cancels the grid library’s own 24px outer inset, so cards line up with the page margin', async () => {
    const { wrapper } = await render({ compact: false })
    expect(wrapper.get('[data-testid="grid"]').classes()).toContain('-m-6')
  })
})

describe('DashboardGrid on a compact screen', () => {
  it('stacks the widgets in one column instead of using the grid', async () => {
    const { wrapper } = await render({ compact: true })
    expect(wrapper.find('[data-testid="grid"]').exists()).toBe(false)
    expect(wrapper.findAll('section')).toHaveLength(3)
  })

  it('lists the widgets in reading order, without changing the saved layout', async () => {
    const { wrapper } = await render({ compact: true })
    expect(wrapper.findAll('section h2').map((heading) => heading.text())).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
    ])
    expect(layout.map((item) => item.i)).toEqual(['c', 'b', 'a'])
    expect(wrapper.emitted('update:layout')).toBeUndefined()
  })

  it('offers no drag handles', async () => {
    const { wrapper } = await render({ compact: true })
    expect(wrapper.find('.drag-handle').exists()).toBe(false)
  })
})
