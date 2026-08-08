import type { IntentBus } from '../core/bus'
import { transactionId } from '../core/bus'
import type { HandleName } from '../render/renderer'
import { blockIdAt, handleAt, textNodeFor } from '../render/renderer'
import { resizeNudges } from './resize'

const EDITABLE_TYPES = new Set(['text', 'hero'])

export interface PointerAdapterOptions {
  readonly surface: HTMLElement
  readonly bus: IntentBus
}

interface DragSession {
  readonly id: string
  readonly txn: string
  readonly pointerId: number
  readonly handle: HandleName | null
  lastX: number
  lastY: number
}

/**
 * Translates raw pointer events into intents. It reads the DOM for hit testing
 * and writes to the bus; it never touches the store, so swapping the pointer for
 * a tracked hand changes nothing downstream.
 */
export class PointerAdapter {
  private readonly surface: HTMLElement
  private readonly bus: IntentBus
  private drag: DragSession | null = null

  constructor(options: PointerAdapterOptions) {
    this.surface = options.surface
    this.bus = options.bus
  }

  attach(): () => void {
    this.surface.addEventListener('pointerdown', this.onDown)
    this.surface.addEventListener('dblclick', this.onDoubleClick)
    return () => {
      this.surface.removeEventListener('pointerdown', this.onDown)
      this.surface.removeEventListener('dblclick', this.onDoubleClick)
      this.stopTracking()
    }
  }

  /**
   * Text is edited in the block itself rather than only in the inspector, so the
   * document being edited and the document being read are the same thing.
   */
  private readonly onDoubleClick = (event: MouseEvent): void => {
    const id = blockIdAt(event.target)
    const element = event.target instanceof Element ? event.target.closest('[data-block-id]') : null
    if (id === null || element === null) return
    if (!EDITABLE_TYPES.has(element.getAttribute('data-block-type') ?? '')) return

    const node = textNodeFor(element)
    if (node === null) return

    node.contentEditable = 'true'
    node.spellcheck = false
    node.focus()

    const commit = (): void => {
      node.contentEditable = 'false'
      node.removeEventListener('blur', commit)
      node.removeEventListener('keydown', onKey)
      this.bus.emit({ op: 'set', id, path: 'text', value: node.textContent ?? '' }, 'pointer')
    }
    const onKey = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Enter' && !keyEvent.shiftKey) {
        keyEvent.preventDefault()
        node.blur()
      }
      if (keyEvent.key === 'Escape') node.blur()
    }

    node.addEventListener('blur', commit)
    node.addEventListener('keydown', onKey)
  }

  private readonly onDown = (event: PointerEvent): void => {
    this.handleDown(event)
  }

  private readonly onMove = (event: PointerEvent): void => {
    this.handleMove(event)
  }

  private readonly onUp = (event: PointerEvent): void => {
    this.handleUp(event)
  }

  /**
   * Move and release are tracked on the window rather than through pointer
   * capture: a drag that leaves the stage, or ends outside the window entirely,
   * still has to close its transaction and free the lock it holds.
   */
  private startTracking(): void {
    const view = this.surface.ownerDocument.defaultView ?? window
    view.addEventListener('pointermove', this.onMove)
    view.addEventListener('pointerup', this.onUp)
    view.addEventListener('pointercancel', this.onUp)
  }

  private stopTracking(): void {
    const view = this.surface.ownerDocument.defaultView ?? window
    view.removeEventListener('pointermove', this.onMove)
    view.removeEventListener('pointerup', this.onUp)
    view.removeEventListener('pointercancel', this.onUp)
  }

  private handleDown(event: PointerEvent): void {
    if (event.button !== 0) return
    // A drag started inside a text node being edited would fight the caret.
    if (event.target instanceof Element && event.target.closest('[contenteditable="true"]')) return
    const id = blockIdAt(event.target)
    const target = id === null || id === 'root' ? null : id
    const handle = handleAt(event.target)

    // The canvas itself carries a block id; clicking it clears the selection.
    if (handle === null) this.bus.emit({ op: 'select', id: target }, 'pointer')
    if (target === null) return

    event.preventDefault()
    const kind = handle === null ? 'move' : 'resize'
    this.drag = {
      id: target,
      txn: transactionId(`pointer-${kind}`),
      pointerId: event.pointerId,
      handle,
      lastX: event.clientX,
      lastY: event.clientY,
    }
    this.startTracking()
  }

  private handleMove(event: PointerEvent): void {
    const drag = this.drag
    if (drag === null || event.pointerId !== drag.pointerId) return

    const dx = event.clientX - drag.lastX
    const dy = event.clientY - drag.lastY
    if (dx === 0 && dy === 0) return
    drag.lastX = event.clientX
    drag.lastY = event.clientY

    if (drag.handle === null) {
      this.nudge(drag, 'x', dx)
      this.nudge(drag, 'y', dy)
      return
    }
    this.resize(drag, drag.handle, dx, dy)
  }

  /** All nudges from one handle drag share a transaction, so it is one undo step. */
  private resize(drag: DragSession, handle: HandleName, dx: number, dy: number): void {
    for (const nudge of resizeNudges(handle, dx, dy)) {
      this.bus.emit({ op: 'nudge', id: drag.id, ...nudge }, 'pointer', drag.txn)
    }
  }

  private nudge(drag: DragSession, path: 'x' | 'y', delta: number): void {
    if (delta === 0) return
    this.bus.emit({ op: 'nudge', id: drag.id, path, delta }, 'pointer', drag.txn)
  }

  private handleUp(event: PointerEvent): void {
    const drag = this.drag
    if (drag === null || event.pointerId !== drag.pointerId) return
    this.stopTracking()
    this.drag = null
    // Releasing here rather than waiting for the lease to expire lets a voice
    // command deferred during the drag apply the moment the drag ends.
    this.bus.endTransaction(drag.txn)
  }
}
