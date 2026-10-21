import { describe, expect, it } from 'vitest'
import { suggestTitle } from './titles'

describe('suggestTitle', () => {
  it('has nothing to suggest without a name', () => {
    expect(suggestTitle([])).toBeUndefined()
  })

  it('uses the name of a single source', () => {
    expect(suggestTitle(['Tweakers'])).toBe('Tweakers')
  })

  it('counts the other sources', () => {
    expect(suggestTitle(['Tweakers', 'The Verge', 'Ars Technica'])).toBe('Tweakers +2')
  })
})
