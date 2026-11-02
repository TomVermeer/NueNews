import { onBeforeUnmount, watch, type Ref } from 'vue'

export interface DismissablePopoverOptions {
  /** Whether the popover shows. The composable sets it to false to dismiss the popover. */
  readonly open: Ref<boolean>
  /** Elements that count as inside the popover (the panel and its trigger button). */
  readonly inside: readonly Readonly<Ref<HTMLElement | null>>[]
  /** Runs on Escape instead of a plain dismiss, e.g. to close and return focus to the trigger. */
  readonly onEscape: () => void
}

/**
 * Dismisses an open popover on a pointerdown outside it, on Escape, and when the window resizes or
 * scrolls (a fixed-position panel would otherwise drift away from its trigger). Its listeners only
 * exist while the popover is open, and are removed on unmount.
 */
export function useDismissablePopover(options: DismissablePopoverOptions) {
  const { open, inside, onEscape } = options

  function dismiss() {
    open.value = false
  }

  function onPointerDown(event: PointerEvent) {
    const target = event.target
    const isInside =
      target instanceof Node && inside.some((element) => element.value?.contains(target))
    if (!isInside) dismiss()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onEscape()
  }

  function removeListeners() {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('resize', dismiss)
    window.removeEventListener('scroll', dismiss, true)
  }

  watch(open, (isOpen) => {
    if (!isOpen) return removeListeners()
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', dismiss)
    window.addEventListener('scroll', dismiss, true)
  })

  // The watcher is stopped on unmount before it can see `open` turn false, so clean up here.
  onBeforeUnmount(removeListeners)
}
