import type { IntentBus } from '../core/bus'

export interface KeyboardAdapterOptions {
  readonly bus: IntentBus
  readonly getSelected: () => string | null
  /** Listening on the document, so the shortcut works wherever focus happens to be. */
  readonly target?: EventTarget
}

/**
 * True while the keystroke belongs to something the user is typing into.
 *
 * Without this check, backspacing a character out of the text field would delete
 * the block being edited. The inspector's own inputs, the canvas text nodes, and
 * anything else editable all have to be exempt.
 */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Keyboard shortcuts, translated into the same intents every other source emits.
 *
 * It is deliberately a fourth source rather than a branch inside the pointer
 * adapter: it competes for the same property locks, appears in history with its
 * own provenance, and can be switched off without touching anything else.
 */
export class KeyboardAdapter {
  private readonly options: KeyboardAdapterOptions
  private readonly target: EventTarget
  private readonly onKeyDown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent)) return
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (isTyping(event.target)) return

    const id = this.options.getSelected()
    if (id === null) return

    // Backspace navigates back in some browsers when nothing has focus.
    event.preventDefault()
    this.options.bus.emit({ op: 'remove', id }, 'pointer')
  }

  constructor(options: KeyboardAdapterOptions) {
    this.options = options
    this.target = options.target ?? document
  }

  attach(): void {
    this.target.addEventListener('keydown', this.onKeyDown)
  }

  detach(): void {
    this.target.removeEventListener('keydown', this.onKeyDown)
  }
}
