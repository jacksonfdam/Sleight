import type { IntentBus } from '../core/bus'
import { blockIdAt } from '../render/renderer'

export interface PointerAdapterOptions {
  readonly surface: HTMLElement
  readonly bus: IntentBus
}

/**
 * Translates raw pointer events into intents. It reads the DOM for hit testing
 * and writes to the bus; it never touches the store, so swapping the pointer for
 * a tracked hand changes nothing downstream.
 */
export class PointerAdapter {
  private readonly surface: HTMLElement
  private readonly bus: IntentBus

  constructor(options: PointerAdapterOptions) {
    this.surface = options.surface
    this.bus = options.bus
  }

  attach(): () => void {
    const onPointerDown = (event: PointerEvent): void => {
      this.handleDown(event)
    }
    this.surface.addEventListener('pointerdown', onPointerDown)
    return () => {
      this.surface.removeEventListener('pointerdown', onPointerDown)
    }
  }

  private handleDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const id = blockIdAt(event.target)
    // The canvas itself carries a block id; clicking it clears the selection.
    this.bus.emit({ op: 'select', id: id === null || id === 'root' ? null : id }, 'pointer')
  }
}
