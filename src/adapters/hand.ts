import type { IntentBus } from '../core/bus'
import { transactionId } from '../core/bus'
import type { HandRequest, HandResponse } from '../vision/hand.worker'
import { HAND_ACTIVE_MARGIN, HAND_CONFIDENCE_MIN, PINCH_CLOSE, PINCH_OPEN } from '../tuning'

export interface HandCursor {
  /** Client coordinates, so the same value drives hit testing and the overlay. */
  readonly x: number
  readonly y: number
  readonly visible: boolean
  readonly pinching: boolean
}

export type HandStatus = 'off' | 'starting' | 'running' | 'denied' | 'failed'

export interface HandAdapterOptions {
  readonly bus: IntentBus
  readonly worker: Worker
  readonly surface: HTMLElement
  readonly wasmPath: string
  readonly modelPath: string
  /** Supplied by the frame loop, which already hit tests once per frame. */
  readonly getHovered: () => string | null
  readonly onStatus?: (status: HandStatus) => void
}

const HIDDEN: HandCursor = { x: 0, y: 0, visible: false, pinching: false }

function stretch(value: number): number {
  const span = 1 - HAND_ACTIVE_MARGIN * 2
  return Math.min(1, Math.max(0, (value - HAND_ACTIVE_MARGIN) / span))
}

/**
 * Consumes the worker's samples on the main thread and turns them into the same
 * intents the pointer produces. Nothing downstream can tell the two apart, which
 * is the point: hover, selection, and undo behave identically in both modes.
 */
export class HandAdapter {
  private readonly options: HandAdapterOptions
  private stream: MediaStream | null = null
  private readonly video: HTMLVideoElement
  private frameHandle: number | null = null
  private inFlight = false
  private ready = false
  private status: HandStatus = 'off'
  private current: HandCursor = HIDDEN
  private pinching = false
  private txn: string | null = null
  private dragId: string | null = null
  private lastX = 0
  private lastY = 0

  constructor(options: HandAdapterOptions) {
    this.options = options
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    options.worker.onmessage = (event: MessageEvent<HandResponse>) => {
      this.receive(event.data)
    }
  }

  get cursor(): HandCursor {
    return this.current
  }

  get running(): boolean {
    return this.status === 'running' || this.status === 'starting'
  }

  /** Opens the camera. Only ever called from an explicit user action. */
  async start(): Promise<void> {
    if (this.running) return
    this.setStatus('starting')
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      })
    } catch (error: unknown) {
      this.setStatus(
        error instanceof DOMException && error.name === 'NotAllowedError' ? 'denied' : 'failed',
      )
      return
    }

    this.video.srcObject = this.stream
    await this.video.play()
    this.send({ type: 'init', wasmPath: this.options.wasmPath, modelPath: this.options.modelPath })
    this.pump()
  }

  stop(): void {
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle)
    this.frameHandle = null
    for (const track of this.stream?.getTracks() ?? []) track.stop()
    this.stream = null
    this.video.srcObject = null
    this.send({ type: 'stop' })
    this.releasePinch()
    this.ready = false
    this.inFlight = false
    this.current = HIDDEN
    this.setStatus('off')
  }

  private setStatus(status: HandStatus): void {
    if (this.status === status) return
    this.status = status
    this.options.onStatus?.(status)
  }

  private send(message: HandRequest): void {
    this.options.worker.postMessage(message)
  }

  /**
   * One frame in flight at a time. Queueing frames would build a backlog the
   * moment inference falls behind capture, and the cursor would lag further the
   * longer the camera stayed on.
   */
  private pump(): void {
    const step = (): void => {
      this.frameHandle = requestAnimationFrame(step)
      if (!this.ready || this.inFlight || this.video.readyState < 2) return
      this.inFlight = true
      createImageBitmap(this.video)
        .then(bitmap => {
          this.options.worker.postMessage(
            { type: 'frame', bitmap, timestamp: performance.now() } satisfies HandRequest,
            [bitmap],
          )
        })
        .catch(() => {
          this.inFlight = false
        })
    }
    this.frameHandle = requestAnimationFrame(step)
  }

  private receive(response: HandResponse): void {
    switch (response.type) {
      case 'ready':
        this.ready = true
        this.setStatus('running')
        return
      case 'error':
        this.setStatus('failed')
        return
      case 'sample':
        this.inFlight = false
        this.apply(response.x, response.y, response.pinch, response.confidence)
        return
    }
  }

  private apply(nx: number, ny: number, pinch: number, confidence: number): void {
    if (confidence < HAND_CONFIDENCE_MIN) {
      this.current = HIDDEN
      this.releasePinch()
      return
    }

    const rect = this.options.surface.getBoundingClientRect()
    const x = rect.left + stretch(nx) * rect.width
    const y = rect.top + stretch(ny) * rect.height

    // Hysteresis: close at the tighter threshold, release only at the looser one.
    const closed = this.pinching ? pinch < PINCH_OPEN : pinch < PINCH_CLOSE
    this.current = { x, y, visible: true, pinching: closed }

    if (closed && !this.pinching) this.beginPinch(x, y)
    else if (!closed && this.pinching) this.releasePinch()
    else if (closed) this.dragTo(x, y)
  }

  /** A pinch is the hand equivalent of pointer down: it selects and grabs. */
  private beginPinch(x: number, y: number): void {
    this.pinching = true
    this.lastX = x
    this.lastY = y
    const target = this.options.getHovered()
    this.options.bus.emit({ op: 'select', id: target }, 'hand')
    this.dragId = target
    this.txn = target === null ? null : transactionId('hand-move')
  }

  private dragTo(x: number, y: number): void {
    const txn = this.txn
    const id = this.dragId
    if (txn === null || id === null) return

    const dx = Math.round(x - this.lastX)
    const dy = Math.round(y - this.lastY)
    if (dx === 0 && dy === 0) return
    this.lastX += dx
    this.lastY += dy

    this.options.bus.emit({ op: 'nudge', id, path: 'x', delta: dx }, 'hand', txn)
    this.options.bus.emit({ op: 'nudge', id, path: 'y', delta: dy }, 'hand', txn)
  }

  private releasePinch(): void {
    if (this.txn !== null) this.options.bus.endTransaction(this.txn)
    this.txn = null
    this.dragId = null
    this.pinching = false
  }
}
