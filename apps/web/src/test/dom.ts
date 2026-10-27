import type { DOMWrapper } from '@vue/test-utils'

interface HasButtons {
  findAll(selector: 'button'): DOMWrapper<HTMLButtonElement>[]
}

interface HasElements {
  get(selector: string): { element: Element }
}

/** The first button whose text includes `text`, if there is one. */
export function findButton(
  wrapper: HasButtons,
  text: string,
): DOMWrapper<HTMLButtonElement> | undefined {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

/** Like `findButton`, but fails the test when there is no such button. */
export function getButton(wrapper: HasButtons, text: string): DOMWrapper<HTMLButtonElement> {
  const button = findButton(wrapper, text)
  if (!button) throw new Error(`No button with the text "${text}"`)
  return button
}

/** The input `selector` finds, failing the test when it is missing or not an input. */
export function inputOf(wrapper: HasElements, selector: string): HTMLInputElement {
  return asInput(wrapper.get(selector).element, selector)
}

/** `inputOf` for plain DOM, e.g. a popover teleported to `document.body`. */
export function inputIn(root: ParentNode, selector: string): HTMLInputElement {
  return asInput(root.querySelector(selector), selector)
}

function asInput(element: Element | null, selector: string): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) throw new Error(`${selector} is not an input`)
  return element
}
