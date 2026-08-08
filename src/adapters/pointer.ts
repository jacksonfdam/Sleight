import type { IntentBus } from '../core/bus'
import { transactionId } from '../core/bus'
import type { HandleName } from '../render/renderer'
import { blockIdAt, handleAt } from '../render/renderer'

/** Which edges a handle drives, as multipliers on the pointer delta. */
const HANDLE_AXES: Record<HandleName, { readonly ew: -1 | 0 | 1; readonly ns: -1 | 0 | 1 }> = {
  nw: { ew: -1, ns: -1 },
  n: { ew: 0, ns: -1 },
  ne: { ew: 1, ns: -1 },
  e: { ew: 1, ns: 0 },
  se: { ew: 1, ns: 1 },
  s: { ew: 0, ns: 1 },
  sw: { ew: -1, ns: 1 },
  w: { ew: -1, ns: 0 },
}

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
    const onDown = (event: PointerEvent): void => {
      this.handleDown(event)
    }
    const onMove = (event: PointerEvent): void => {
      this.handleMove(event)
    }
    const onUp = (event: PointerEvent): void => {
      this.handleUp(event)
    }

    this.surface.addEventListener('pointerdown', onDown)
    this.surface.addEventListener('pointermove', onMove)
    this.surface.addEventListener('pointerup', onUp)
    this.surface.addEventListener('pointercancel', onUp)

    return () => {
      this.surface.removeEventListener('pointerdown', onDown)
      this.surface.removeEventListener('pointermove', onMove)
      this.surface.removeEventListener('pointerup', onUp)
      this.surface.removeEventListener('pointercancel', onUp)
    }
  }

  private handleDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const id = blockIdAt(event.target)
    const target = id === null || id === 'root' ? null : id
    const handle = handleAt(event.target)

    // The canvas itself carries a block id; clicking it clears the selection.
    if (handle === null) this.bus.emit({ op: 'select', id: target }, 'pointer')
    if (target === null) return

    event.preventDefault()
    this.surface.setPointerCapture(event.pointerId)
    const kind = handle === null ? 'move' : 'resize'
    this.drag = {
      id: target,
      txn: transactionId(`pointer-${kind}`),
      pointerId: event.pointerId,
      handle,
      lastX: event.clientX,
      lastY: event.clientY,
    }
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

  /**
   * A west or north handle grows the block by moving its origin, so it writes
   * both an origin and a size delta. Both land in the same transaction and so
   * collapse into one undo step.
   */
  private resize(drag: DragSession, handle: HandleName, dx: number, dy: number): void {
    const axes = HANDLE_AXES[handle]
    if (axes.ew === 1) {
      this.nudge(drag, 'w', dx)
    } else if (axes.ew === -1) {
      this.nudge(drag, 'x', dx)
      this.nudge(drag, 'w', -dx)
    }
    if (axes.ns === 1) {
      this.nudge(drag, 'h', dy)
    } else if (axes.ns === -1) {
      this.nudge(drag, 'y', dy)
      this.nudge(drag, 'h', -dy)
    }
  }

  private nudge(drag: DragSession, path: 'x' | 'y' | 'w' | 'h', delta: number): void {
    if (delta === 0) return
    this.bus.emit({ op: 'nudge', id: drag.id, path, delta }, 'pointer', drag.txn)
  }

  private handleUp(event: PointerEvent): void {
    const drag = this.drag
    if (drag === null || event.pointerId !== drag.pointerId) return
    if (this.surface.hasPointerCapture(event.pointerId)) {
      this.surface.releasePointerCapture(event.pointerId)
    }
    this.drag = null
    // Releasing here rather than waiting for the lease to expire lets a voice
    // command deferred during the drag apply the moment the drag ends.
    this.bus.endTransaction(drag.txn)
  }
}
