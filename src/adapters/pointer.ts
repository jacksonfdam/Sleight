import type { IntentBus } from '../core/bus'
import { blockIdAt } from '../render/renderer'

export interface PointerAdapterOptions {
  readonly surface: HTMLElement
  readonly bus: IntentBus
}

interface DragSession {
  readonly id: string
  readonly txn: string
  readonly pointerId: number
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
  private sequence = 0

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

    // The canvas itself carries a block id; clicking it clears the selection.
    this.bus.emit({ op: 'select', id: target }, 'pointer')
    if (target === null) return

    event.preventDefault()
    this.surface.setPointerCapture(event.pointerId)
    this.drag = {
      id: target,
      txn: `pointer-move-${String(this.sequence++)}`,
      pointerId: event.pointerId,
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

    if (dx !== 0)
      this.bus.emit({ op: 'nudge', id: drag.id, path: 'x', delta: dx }, 'pointer', drag.txn)
    if (dy !== 0)
      this.bus.emit({ op: 'nudge', id: drag.id, path: 'y', delta: dy }, 'pointer', drag.txn)
  }

  private handleUp(event: PointerEvent): void {
    const drag = this.drag
    if (drag === null || event.pointerId !== drag.pointerId) return
    if (this.surface.hasPointerCapture(event.pointerId)) {
      this.surface.releasePointerCapture(event.pointerId)
    }
    this.drag = null
  }
}
