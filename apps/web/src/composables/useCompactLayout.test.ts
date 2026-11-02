import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { stubViewport } from '../test/fakeViewport'
import { useCompactLayout } from './useCompactLayout'

function setup() {
  const scope = effectScope()
  const compact = scope.run(useCompactLayout)
  if (!compact) throw new Error('The effect scope is not active')
  return { scope, compact }
}

afterEach(() => vi.unstubAllGlobals())

describe('useCompactLayout', () => {
  it('asks whether the screen is narrower than the expanded size class (840px)', () => {
    const viewport = stubViewport(false)
    setup()
    expect(viewport.matchMedia).toHaveBeenCalledWith('(max-width: 839.98px)')
  })

  it('is compact on a narrow screen and not on a wide one', () => {
    stubViewport(true)
    expect(setup().compact.value).toBe(true)

    stubViewport(false)
    expect(setup().compact.value).toBe(false)
  })

  it('follows the screen when it is resized or rotated', () => {
    const viewport = stubViewport(false)
    const { compact } = setup()

    viewport.setCompact(true)
    expect(compact.value).toBe(true)
    viewport.setCompact(false)
    expect(compact.value).toBe(false)
  })

  it('stops listening once its scope ends', () => {
    const viewport = stubViewport(false)
    const { scope } = setup()
    expect(viewport.query.addEventListener).toHaveBeenCalledTimes(1)

    scope.stop()
    expect(viewport.query.removeEventListener).toHaveBeenCalledTimes(1)
  })

  it('treats the screen as wide where matchMedia does not exist', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(setup().compact.value).toBe(false)
  })
})
