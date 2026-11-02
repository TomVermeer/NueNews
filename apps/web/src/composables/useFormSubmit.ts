import { computed, ref, type Ref } from 'vue'

/**
 * Submit handling shared by the widget forms: `submit` only calls `onValid` when there is no
 * problem, and the problem is shown only after the first attempt, not while the user is typing.
 */
export function useFormSubmit(problem: Ref<string>, onValid: () => void) {
  const attempted = ref(false)
  const shownProblem = computed(() => (attempted.value ? problem.value : ''))

  function submit() {
    attempted.value = true
    if (!problem.value) onValid()
  }

  return { shownProblem, submit }
}
