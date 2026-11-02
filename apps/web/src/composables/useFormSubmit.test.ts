import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useFormSubmit } from './useFormSubmit'

describe('useFormSubmit', () => {
  it('hides the problem until the first attempt', () => {
    const { shownProblem, submit } = useFormSubmit(ref('Give the widget a title'), vi.fn())
    expect(shownProblem.value).toBe('')
    submit()
    expect(shownProblem.value).toBe('Give the widget a title')
  })

  it('submits only when there is no problem', () => {
    const problem = ref('Choose a location')
    const onValid = vi.fn()
    const { shownProblem, submit } = useFormSubmit(problem, onValid)

    submit()
    expect(onValid).not.toHaveBeenCalled()

    problem.value = ''
    submit()
    expect(onValid).toHaveBeenCalledOnce()
    expect(shownProblem.value).toBe('')
  })
})
