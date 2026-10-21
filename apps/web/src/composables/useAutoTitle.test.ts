import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useAutoTitle } from './useAutoTitle'

function setup(auto: boolean) {
  const title = ref('News')
  const suggestion = ref<string | undefined>()
  const autoTitle = useAutoTitle(title, suggestion, { auto })
  return { title, suggestion, autoTitle }
}

describe('useAutoTitle', () => {
  it('follows the suggestion until the user edits the title', async () => {
    const { title, suggestion, autoTitle } = setup(true)

    suggestion.value = 'Tweakers'
    await nextTick()
    expect(title.value).toBe('Tweakers')

    suggestion.value = 'Tweakers +1'
    await nextTick()
    expect(title.value).toBe('Tweakers +1')

    autoTitle.markEdited()
    suggestion.value = 'Something else'
    await nextTick()
    expect(title.value).toBe('Tweakers +1')
  })

  it('keeps the current title when the suggestion goes away', async () => {
    const { title, suggestion } = setup(true)
    suggestion.value = 'Tweakers'
    await nextTick()
    suggestion.value = undefined
    await nextTick()
    expect(title.value).toBe('Tweakers')
  })

  it('leaves the title of an existing widget alone', async () => {
    const { title, suggestion } = setup(false)
    suggestion.value = 'Tweakers'
    await nextTick()
    expect(title.value).toBe('News')
  })
})
