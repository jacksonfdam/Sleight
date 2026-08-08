import type { IntentBus } from '../core/bus'
import { transactionId } from '../core/bus'
import type { HandleName } from '../render/renderer'
import type { HandLabel, HandPoint, HandRequest, HandResponse } from '../vision/hand.worker'
import { resizeNudges } from './resize'
import {
  DWELL_MS,
  DWELL_RADIUS_PX,
  HAND_ACTIVE_MARGIN,
  HAND_CONFIDENCE_MIN,
  PINCH_CLOSE,
  PINCH_OPEN,
  PINCH_SCALE_MAX,
  PINCH_SCALE_MIN,
  TWO_HAND_MIN_SPAN,
} from '../tuning'

export interface HandCursor {
  readonly label: HandLabel
  /** Client coordinates, so the same value drives hit testing and the overlay. */
  readonly x: number
  readonly y: number
  readonly pinching: boolean
  /** Progress towards a dwell click, 0 to 1. */
  readonly dwell: number
}

export type HandStatus = 'off' | 'starting' | 'running' | 'denied' | 'failed'

/** Geometry the adapter needs in order to scale a block without reading the store. */
export interface BlockBox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * The slice of the worker interface this adapter uses. Depending on the narrow
 * shape rather than on `Worker` keeps the gesture logic testable with synthetic
 * samples, no camera and no inference involved.
 */
export interface HandWorkerLike {
  postMessage(message: HandRequest, transfer?: Transferable[]): void
  onmessage: ((event: MessageEvent<HandResponse>) => void) | null
  terminate(): void
}

export interface HandAdapterOptions {
  readonly bus: IntentBus
  readonly worker: HandWorkerLike
  readonly surface: HTMLElement
  readonly wasmPath: string
  readonly modelPath: string
  /** Supplied by the frame loop, which already hit tests once per frame. */
  readonly getHovered: () => string | null
  /** The resize handle under the cursor, from the same per-frame probe. */
  readonly getHandle: () => HandleName | null
  /** Falls back to the selection when a two-hand gesture starts off a block. */
  readonly getSelected: () => string | null
  readonly getBox: (id: string) => BlockBox | null
  readonly onStatus?: (status: HandStatus) => void
}

interface Grab {
  readonly id: string
  readonly txn: string
  readonly handle: HandleName | null
  lastX: number
  lastY: number
}

interface Transform {
  readonly id: string
  readonly txn: string
  readonly box: BlockBox
  readonly span: number
  readonly midX: number
  readonly midY: number
}

function stretch(value: number): number {
  const span = 1 - HAND_ACTIVE_MARGIN * 2
  return Math.min(1, Math.max(0, (value - HAND_ACTIVE_MARGIN) / span))
}

/**
 * Consumes the worker's samples on the main thread and turns them into the same
 * intents the pointer produces. One pinched hand grabs, exactly as a pointer
 * press does. Two pinched hands scale and pan together, which is what two
 * fingers do on a tablet.
 */
export class HandAdapter {
  private readonly options: HandAdapterOptions
  private stream: MediaStream | null = null
  private readonly video: HTMLVideoElement
  private frameHandle: number | null = null
  private inFlight = false
  private ready = false
  private status: HandStatus = 'off'
  private current: readonly HandCursor[] = []
  private readonly pinched = new Set<HandLabel>()
  private grab: Grab | null = null
  private transform: Transform | null = null
  private dwellX = 0
  private dwellY = 0
  private dwellSince = 0
  private dwellFired = false

  constructor(options: HandAdapterOptions) {
    this.options = options
    this.video = document.createElement('video')
    this.video.playsInline = true
    this.video.muted = true
    options.worker.onmessage = (event: MessageEvent<HandResponse>) => {
      this.receive(event.data)
    }
  }

  /** Every tracked hand this frame. */
  get cursors(): readonly HandCursor[] {
    return this.current
  }

  /** The hand that drives hit testing: a pinching one, else the first tracked. */
  get cursor(): HandCursor | null {
    return this.current.find(hand => hand.pinching) ?? this.current[0] ?? null
  }

  /** True while two hands are scaling a block together. */
  get transforming(): boolean {
    return this.transform !== null
  }

  /**
   * The live camera element. It is already running for inference, so showing it
   * behind the canvas costs one more compositor layer and no extra capture.
   */
  get feed(): HTMLVideoElement {
    return this.video
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
    this.endGrab()
    this.endTransform()
    this.pinched.clear()
    this.ready = false
    this.inFlight = false
    this.current = []
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
          this.options.worker.postMessage({ type: 'frame', bitmap, timestamp: performance.now() }, [
            bitmap,
          ])
        })
        .catch(() => {
          this.inFlight = false
        })
    }
    this.frameHandle = requestAnimationFrame(step)
  }

  /** Entry point for a worker sample. Exposed so tests can inject one directly. */
  receive(response: HandResponse): void {
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
        this.apply(response.hands)
        return
    }
  }

  private apply(hands: readonly HandPoint[]): void {
    const rect = this.options.surface.getBoundingClientRect()
    const tracked: HandCursor[] = []

    for (const hand of hands) {
      if (hand.confidence < HAND_CONFIDENCE_MIN) continue
      // Hysteresis: close at the tighter threshold, release only at the looser one.
      const held = this.pinched.has(hand.label)
      const pinching = held ? hand.pinch < PINCH_OPEN : hand.pinch < PINCH_CLOSE
      if (pinching) this.pinched.add(hand.label)
      else this.pinched.delete(hand.label)

      tracked.push({
        label: hand.label,
        x: rect.left + stretch(hand.x) * rect.width,
        y: rect.top + stretch(hand.y) * rect.height,
        pinching,
        dwell: 0,
      })
    }

    // A hand that dropped out of tracking cannot keep holding its pinch.
    for (const label of [...this.pinched]) {
      if (!tracked.some(hand => hand.label === label)) this.pinched.delete(label)
    }

    const pinching = tracked.filter(hand => hand.pinching)
    this.current = this.withDwell(tracked, pinching.length > 0)

    if (pinching.length >= 2) {
      this.runTransform(pinching[0], pinching[1], rect.width)
      return
    }

    this.endTransform()
    if (pinching.length === 1) this.runGrab(pinching[0])
    else this.endGrab()
  }

  /** Dwell only makes sense for a single idle hand, so it is scoped to that. */
  private withDwell(tracked: readonly HandCursor[], anyPinching: boolean): HandCursor[] {
    const primary = tracked[0]
    if (anyPinching || tracked.length !== 1 || primary === undefined) {
      this.resetDwell(primary?.x ?? 0, primary?.y ?? 0)
      return [...tracked]
    }
    return [{ ...primary, dwell: this.trackDwell(primary.x, primary.y) }]
  }

  private runGrab(hand: HandCursor | undefined): void {
    if (hand === undefined) return
    const grab = this.grab
    if (grab === null) {
      this.beginGrab(hand)
      return
    }

    const dx = Math.round(hand.x - grab.lastX)
    const dy = Math.round(hand.y - grab.lastY)
    if (dx === 0 && dy === 0) return
    grab.lastX += dx
    grab.lastY += dy

    if (grab.handle !== null) {
      for (const nudge of resizeNudges(grab.handle, dx, dy)) {
        this.options.bus.emit({ op: 'nudge', id: grab.id, ...nudge }, 'hand', grab.txn)
      }
      return
    }
    this.options.bus.emit({ op: 'nudge', id: grab.id, path: 'x', delta: dx }, 'hand', grab.txn)
    this.options.bus.emit({ op: 'nudge', id: grab.id, path: 'y', delta: dy }, 'hand', grab.txn)
  }

  /**
   * A pinch is the hand equivalent of pointer down. Closing it over a resize
   * handle of the selected block grabs that handle; anywhere else it grabs the
   * block itself.
   */
  private beginGrab(hand: HandCursor): void {
    const handle = this.options.getHandle()
    const target = this.options.getHovered()
    if (handle === null) this.options.bus.emit({ op: 'select', id: target }, 'hand')
    if (target === null) return

    this.grab = {
      id: target,
      txn: transactionId(handle === null ? 'hand-move' : 'hand-resize'),
      handle,
      lastX: hand.x,
      lastY: hand.y,
    }
  }

  private endGrab(): void {
    if (this.grab !== null) this.options.bus.endTransaction(this.grab.txn)
    this.grab = null
  }

  /**
   * Two pinched hands scale and pan together: the distance between them sets the
   * size, their midpoint sets the position. The result is written as absolute
   * values rather than accumulated deltas, so a dropped frame cannot leave the
   * block a little further out of place with every gesture.
   */
  private runTransform(a: HandCursor | undefined, b: HandCursor | undefined, width: number): void {
    if (a === undefined || b === undefined) return
    const span = Math.hypot(a.x - b.x, a.y - b.y)
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2

    let active = this.transform
    if (active === null) {
      // Too close together and small tracking errors swing the ratio wildly.
      if (span < width * TWO_HAND_MIN_SPAN) return
      const id = this.options.getHovered() ?? this.options.getSelected()
      if (id === null) return
      const box = this.options.getBox(id)
      if (box === null) return

      this.endGrab()
      active = { id, txn: transactionId('hand-transform'), box, span, midX, midY }
      this.transform = active
      this.options.bus.emit({ op: 'select', id }, 'hand')
    }

    const scale = Math.min(PINCH_SCALE_MAX, Math.max(PINCH_SCALE_MIN, span / active.span))
    const w = Math.round(active.box.w * scale)
    const h = Math.round(active.box.h * scale)
    // Scale about the block's centre, then follow the midpoint as it travels.
    const x = Math.round(active.box.x + (midX - active.midX) - (w - active.box.w) / 2)
    const y = Math.round(active.box.y + (midY - active.midY) - (h - active.box.h) / 2)

    const { bus } = this.options
    bus.emit({ op: 'set', id: active.id, path: 'w', value: w }, 'hand', active.txn)
    bus.emit({ op: 'set', id: active.id, path: 'h', value: h }, 'hand', active.txn)
    bus.emit({ op: 'set', id: active.id, path: 'x', value: x }, 'hand', active.txn)
    bus.emit({ op: 'set', id: active.id, path: 'y', value: y }, 'hand', active.txn)
  }

  private endTransform(): void {
    if (this.transform !== null) this.options.bus.endTransaction(this.transform.txn)
    this.transform = null
  }

  /**
   * Holding still selects, for anyone who cannot hold a pinch comfortably. The
   * progress ring on the overlay is what makes it usable: without continuous
   * feedback a dwell target is indistinguishable from an unresponsive one.
   */
  private trackDwell(x: number, y: number): number {
    if (Math.hypot(x - this.dwellX, y - this.dwellY) > DWELL_RADIUS_PX) {
      return this.resetDwell(x, y)
    }

    const progress = Math.min(1, (performance.now() - this.dwellSince) / DWELL_MS)
    if (progress >= 1 && !this.dwellFired) {
      this.dwellFired = true
      this.options.bus.emit({ op: 'select', id: this.options.getHovered() }, 'hand')
    }
    return progress
  }

  private resetDwell(x: number, y: number): number {
    this.dwellX = x
    this.dwellY = y
    this.dwellSince = performance.now()
    this.dwellFired = false
    return 0
  }
}
