import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardSummary } from '../api/types'
import { mountApp } from '../test/mount'
import TopBar from './TopBar.vue'
import { findButton, getButton, inputOf } from '../test/dom'

const dashboards: DashboardSummary[] = [
  { id: 'd1', name: 'Home', position: 0 },
  { id: 'd2', name: 'Reading', position: 1 },
]

const base = {
  dashboards,
  activeId: 'd1',
  editing: false,
  dirty: false,
  saving: false,
  refreshing: false,
  updatedAt: null as Date | null,
}

const render = (
  props: Partial<typeof base> & { updatedAt?: Date | null; canSignOut?: boolean } = {},
) => mountApp(TopBar, { props: { ...base, ...props } })

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('TopBar tabs', () => {
  it('lists the dashboards as links and marks the active one', async () => {
    const { wrapper } = await render()
    const links = wrapper.findAll('nav a')
    expect(links.map((l) => l.text())).toEqual(['Home', 'Reading'])
    expect(links[0]!.attributes('href')).toBe('/d/d1')
    expect(links[0]!.attributes('aria-current')).toBe('page')
    expect(links[1]!.attributes('aria-current')).toBeUndefined()
  })

  it('creates a dashboard from the plus button', async () => {
    const { wrapper } = await render()
    await wrapper.get('[aria-label="New dashboard"]').trigger('click')
    await wrapper.get('input[aria-label="New dashboard name"]').setValue('  Dev  ')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('create-dashboard')).toEqual([['Dev']])
    expect(wrapper.find('input[aria-label="New dashboard name"]').exists()).toBe(false)
  })

  it('ignores an empty name', async () => {
    const { wrapper } = await render()
    await wrapper.get('[aria-label="New dashboard"]').trigger('click')
    await wrapper.get('input[aria-label="New dashboard name"]').setValue('   ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('create-dashboard')).toBeUndefined()
  })

  it('can cancel creating a dashboard', async () => {
    const { wrapper } = await render()
    await wrapper.get('[aria-label="New dashboard"]').trigger('click')
    await wrapper.get('[aria-label="Cancel"]').trigger('click')
    expect(wrapper.find('input').exists()).toBe(false)
  })
})

describe('TopBar in view mode', () => {
  it('offers refresh and edit', async () => {
    const { wrapper } = await render()
    await wrapper.get('[aria-label="Refresh all widgets"]').trigger('click')
    await getButton(wrapper, 'Edit layout').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
    expect(wrapper.emitted('edit')).toHaveLength(1)
    expect(findButton(wrapper, 'Save layout')).toBeUndefined()
  })

  it('shows when the data was last updated', async () => {
    const { wrapper } = await render({ updatedAt: new Date(Date.now() - 5 * 60_000) })
    expect(wrapper.text()).toContain('Updated 5 min ago')
  })

  it('disables actions while refreshing or when there is no dashboard', async () => {
    const refreshing = await render({ refreshing: true })
    expect(
      refreshing.wrapper.get('[aria-label="Refresh all widgets"]').attributes('disabled'),
    ).toBeDefined()
    const none = await render({ activeId: undefined })
    expect(getButton(none.wrapper, 'Edit layout').attributes('disabled')).toBeDefined()
  })
})

describe('TopBar in edit mode', () => {
  it('replaces refresh and edit with add, cancel and save', async () => {
    const { wrapper } = await render({ editing: true })
    expect(findButton(wrapper, 'Edit layout')).toBeUndefined()

    await getButton(wrapper, 'Add widget').trigger('click')
    await getButton(wrapper, 'Cancel').trigger('click')
    expect(wrapper.emitted('add-widget')).toHaveLength(1)
    expect(wrapper.emitted('cancel')).toHaveLength(1)
  })

  it('says "Save layout" when there are changes and "Done" when there are none', async () => {
    const dirty = await render({ editing: true, dirty: true })
    expect(findButton(dirty.wrapper, 'Save layout')).toBeDefined()
    await getButton(dirty.wrapper, 'Save layout').trigger('click')
    expect(dirty.wrapper.emitted('save')).toHaveLength(1)

    const clean = await render({ editing: true, dirty: false })
    expect(findButton(clean.wrapper, 'Done')).toBeDefined()
    expect(findButton(clean.wrapper, 'Save layout')).toBeUndefined()
  })

  it('shows progress while saving', async () => {
    const { wrapper } = await render({ editing: true, dirty: true, saving: true })
    const save = getButton(wrapper, 'Saving…')
    expect(save.attributes('disabled')).toBeDefined()
  })

  it('renames the active dashboard', async () => {
    const { wrapper } = await render({ editing: true })
    await wrapper.get('[aria-label="Rename dashboard"]').trigger('click')
    const input = wrapper.get('input[aria-label="Dashboard name"]')
    expect(inputOf(wrapper, 'input[aria-label="Dashboard name"]').value).toBe('Home')
    await input.setValue('Start')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('rename-dashboard')).toEqual([['d1', 'Start']])
  })

  it('deletes the active dashboard only after confirmation', async () => {
    const { wrapper } = await render({ editing: true })
    const confirm = vi.fn().mockReturnValue(false)
    vi.stubGlobal('confirm', confirm)
    await wrapper.get('[aria-label="Delete dashboard"]').trigger('click')
    expect(confirm).toHaveBeenCalledWith('Delete "Home" and all of its widgets?')
    expect(wrapper.emitted('delete-dashboard')).toBeUndefined()

    confirm.mockReturnValue(true)
    await wrapper.get('[aria-label="Delete dashboard"]').trigger('click')
    expect(wrapper.emitted('delete-dashboard')).toEqual([['d1']])
  })

  it('does not offer rename and delete outside edit mode', async () => {
    const { wrapper } = await render({ editing: false })
    expect(wrapper.find('[aria-label="Rename dashboard"]').exists()).toBe(false)
    expect(wrapper.find('[aria-label="Delete dashboard"]').exists()).toBe(false)
  })

  describe('sign out', () => {
    it('is only offered when the app has a login', async () => {
      const without = await render()
      expect(without.wrapper.find('[aria-label="Sign out"]').exists()).toBe(false)

      const withLogin = await render({ canSignOut: true })
      await withLogin.wrapper.get('[aria-label="Sign out"]').trigger('click')
      expect(withLogin.wrapper.emitted('sign-out')).toHaveLength(1)
    })
  })
})
